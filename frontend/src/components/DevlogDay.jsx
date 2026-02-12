import { useState, useEffect } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import axios from 'axios';
import Cell from './Cell';
import './DevlogDay.css';

function DevlogDay({ day, projectId, allPages, onDayUpdate }) {
    const [cells, setCells] = useState(day.cells || []);

    // Sort logic for activity
    const pageActivity = day.activity?.filter(a => a.entity_type === 'page') || [];
    const todoActivity = day.activity?.filter(a => a.entity_type === 'todo') || [];

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    useEffect(() => {
        setCells(day.cells || []);
    }, [day.cells]);

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = cells.findIndex(c => c.id === active.id);
        const newIndex = cells.findIndex(c => c.id === over.id);

        const newCells = arrayMove(cells, oldIndex, newIndex);
        setCells(newCells);

        try {
            await axios.post(`/api/projects/${projectId}/devlog/cells/reorder`, {
                cellIds: newCells.map(c => c.id)
            });
        } catch (error) {
            console.error('Failed to reorder cells:', error);
            setCells(cells); // Revert
        }
    };

    const handleCellUpdate = async (cellId, updates) => {
        try {
            await axios.put(`/api/projects/${projectId}/devlog/cells/${cellId}`, updates);
            // Optimistic update?
            setCells(cells.map(c => c.id === cellId ? { ...c, ...updates } : c));
        } catch (error) {
            console.error('Failed to update cell:', error);
        }
    };

    const handleCellDelete = async (cellId) => {
        try {
            await axios.delete(`/api/projects/${projectId}/devlog/cells/${cellId}`);
            setCells(cells.filter(c => c.id !== cellId));
        } catch (error) {
            console.error('Failed to delete cell:', error);
        }
    };

    const [newlyCreatedCellId, setNewlyCreatedCellId] = useState(null);

    const handleAddCell = async (type = 'text') => {
        try {
            const payload = {
                type,
                content: '',
                orderIndex: cells.length
            };

            if (day.isTemp) {
                payload.date = day.date;
            } else {
                payload.dayId = day.id;
            }

            const response = await axios.post(`/api/projects/${projectId}/devlog/cells`, payload);

            // If we just created the day, we should probably tell the parent?
            // If the parent sees this update, it might need to know the REAL id now.
            // But let's just update local state first.
            // Actually, if we just created the day, future calls need the real ID.
            // The response.data is the CELL. We need to query the day?
            // Or we assume the backend handles lookup by date if we keep sending date?
            // Better: trigger a refresh of the days or hack the ID?

            // For now, let's just add the cell. If user adds another, they rely on 'date' again if we don't update ID.
            // But 'day' prop is from parent.
            if (day.isTemp && onDayUpdate) {
                // We need the new day ID. The cell response has day_id!
                const newDayId = response.data.day_id;
                onDayUpdate({ ...day, id: newDayId, isTemp: false, cells: [...cells, response.data] });
                // Also set local cells? onDayUpdate updates parent which updates props.
                // setCells will be updated via useEffect when prop changes?
                // Yes, line 34: setCells(day.cells || []).
                // So we rely on parent update. 
            } else {
                setCells([...cells, response.data]);
            }

            setNewlyCreatedCellId(response.data.id);
        } catch (error) {
            console.error('Failed to add cell:', error);
        }
    };

    // Support inserting via cell controls using onInsert
    const handleInsertCell = async (targetCellId, position, type) => {
        try {
            // 1. Create content
            const payload = {
                type,
                content: '',
                orderIndex: cells.length // This might be wrong for insert? No, backend just creates it, then we reorder.
            };

            if (day.isTemp) {
                payload.date = day.date;
            } else {
                payload.dayId = day.id;
            }

            const response = await axios.post(`/api/projects/${projectId}/devlog/cells`, payload);
            const newCell = response.data;

            // 2. Reorder locally
            const targetIndex = cells.findIndex(c => c.id === targetCellId);
            const newCells = [...cells];
            const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
            newCells.splice(insertIndex, 0, newCell);
            setCells(newCells);
            setNewlyCreatedCellId(newCell.id);

            // 3. Persist order
            await axios.post(`/api/projects/${projectId}/devlog/cells/reorder`, {
                cellIds: newCells.map(c => c.id)
            });
        } catch (error) {
            console.error('Failed to insert cell:', error);
        }
    };

    const formatDate = (dateStr) => {
        // Parse YYYY-MM-DD manually to avoid timezone shifts
        const [year, month, day] = dateStr.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    };

    // Helper to format activity details
    const formatActivity = (act) => {
        const details = JSON.parse(act.details || '{}');
        let text = '';
        if (act.entity_type === 'page') {
            if (act.action === 'created') text = `Created page "${details.title}"`;
            else if (act.action === 'updated') text = `Updated page "${details.title}"`;
            else if (act.action === 'renamed') text = `Renamed page "${details.oldTitle}" to "${details.newTitle}"`;
            else if (act.action === 'deleted') text = `Deleted page "${details.title}"`;
        } else if (act.entity_type === 'todo') {
            if (act.action === 'created') text = `Created todo "${details.title}" in ${details.column}`;
            else if (act.action === 'updated') text = `Updated todo "${details.title}"`;
            else if (act.action === 'completed') text = `Completed todo "${details.title}"`;
            else if (act.action === 'deleted') text = `Deleted todo "${details.title}"`;
            else if (act.action === 'moved') text = `Moved todo "${details.title}" to ${details.to}`;
        }
        return text;
    };

    return (
        <div className="devlog-day">
            <div className="devlog-date-header">
                {formatDate(day.date)}
            </div>

            <div className="activity-summary">
                <div className="activity-section">
                    <h4>Pages Created/Updated</h4>
                    <ul className="activity-list">
                        {pageActivity.length > 0 ? pageActivity.map(act => (
                            <li key={act.id} className="activity-item">
                                {formatActivity(act)}
                            </li>
                        )) : <li className="text-muted">No page activity</li>}
                    </ul>
                </div>
                <div className="activity-section">
                    <h4>Todos Created/Completed</h4>
                    <ul className="activity-list">
                        {todoActivity.length > 0 ? todoActivity.map(act => (
                            <li key={act.id} className="activity-item">
                                {formatActivity(act)}
                            </li>
                        )) : <li className="text-muted">No todo activity</li>}
                    </ul>
                </div>
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={cells.map(c => c.id)}
                    strategy={verticalListSortingStrategy}
                >
                    {cells.map(cell => (
                        <Cell
                            key={cell.id}
                            cell={cell}
                            projectId={projectId}
                            pageId="devlog" // Unique ID context
                            allPages={allPages}
                            onUpdate={handleCellUpdate}
                            onDelete={handleCellDelete}
                            onCreatePage={() => { }} // Not supporting page creation from devlog yet to keep it simple
                            autoFocus={cell.id === newlyCreatedCellId}
                            onInsert={handleInsertCell}
                        />
                    ))}
                </SortableContext>
            </DndContext>

            <div className="add-cell-buttons">
                <button className="btn-secondary" onClick={() => handleAddCell('text')}>+ Text</button>
                <button className="btn-secondary" onClick={() => handleAddCell('header')}>+ Header</button>
                <button className="btn-secondary" onClick={() => handleAddCell('subheader')}>+ Subheader</button>
                <button className="btn-secondary" onClick={() => handleAddCell('table')}>+ Table</button>
            </div>
        </div>
    );
}

export default DevlogDay;
