import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import './PageContent.css';

function PageContent({ projectId, page, allPages, onPageUpdate, onCellsChange, onCreatePage }) {
    const [cells, setCells] = useState(page?.cells || []);
    const navigate = useNavigate();

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Update cells when page changes
    useEffect(() => {
        if (page?.cells) {
            setCells(page.cells);
        } else {
            setCells([]);
        }
    }, [page]);

    const handleDragEnd = async (event) => {
        const { active, over } = event;

        if (active.id !== over.id) {
            const oldIndex = cells.findIndex(c => c.id === active.id);
            const newIndex = cells.findIndex(c => c.id === over.id);

            const newCells = arrayMove(cells, oldIndex, newIndex);
            setCells(newCells);

            // Update order on backend
            try {
                await axios.put(`/api/pages/${page.id}/cells/reorder`, {
                    cellIds: newCells.map(c => c.id)
                });
                onCellsChange();
            } catch (error) {
                console.error('Failed to reorder cells:', error);
                setCells(cells); // Revert on error
            }
        }
    };

    const handleCellUpdate = async (cellId, updates) => {
        try {
            await axios.put(`/api/cells/${cellId}`, updates);
            onCellsChange();
        } catch (error) {
            console.error('Failed to update cell:', error);
        }
    };

    const handleCellDelete = async (cellId) => {
        try {
            await axios.delete(`/api/cells/${cellId}`);
            setCells(cells.filter(c => c.id !== cellId));
            onCellsChange();
        } catch (error) {
            console.error('Failed to delete cell:', error);
        }
    };

    const handleAddCell = async (type = 'text') => {
        if (!page) return;

        try {
            const response = await axios.post(`/api/pages/${page.id}/cells`, {
                type,
                content: '',
                orderIndex: cells.length
            });
            setCells([...cells, response.data]);
            onCellsChange();
        } catch (error) {
            console.error('Failed to add cell:', error);
        }
    };

    if (!page) {
        return (
            <div className="page-content">
                <div className="empty-page">
                    <h2 className="text-muted">Select a page or create a new one</h2>
                </div>
            </div>
        );
    }

    // Get child pages for current page
    const childPages = allPages.filter(p => p.parent_id === page.id).sort((a, b) => a.title.localeCompare(b.title));

    return (
        <div className="page-content">
            <div className="page-content-inner">
                {childPages.length > 0 && (
                    <div className="child-pages-section">
                        <h3 className="child-pages-header">Sub-Articles</h3>
                        <div className="child-pages-grid">
                            {childPages.map(child => (
                                <div
                                    key={child.id}
                                    className="child-page-link"
                                    onClick={() => navigate(`/project/${projectId}/page/${child.id}`)}
                                >
                                    {child.title}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

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
                                pageId={page.id}
                                allPages={allPages}
                                onUpdate={handleCellUpdate}
                                onDelete={handleCellDelete}
                                onCreatePage={onCreatePage}
                            />
                        ))}
                    </SortableContext>
                </DndContext>

                <div className="add-cell-buttons">
                    <button className="btn-secondary" onClick={() => handleAddCell('text')}>
                        + Text
                    </button>
                    <button className="btn-secondary" onClick={() => handleAddCell('header')}>
                        + Header
                    </button>
                    <button className="btn-secondary" onClick={() => handleAddCell('subheader')}>
                        + Subheader
                    </button>
                </div>
            </div>
        </div>
    );
}

export default PageContent;
