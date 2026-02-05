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

        if (!over) return;

        if (active.id !== over.id) {
            const oldIndex = cells.findIndex(c => c.id === active.id);
            const newIndex = cells.findIndex(c => c.id === over.id);

            const newCells = arrayMove(cells, oldIndex, newIndex);
            setCells(newCells);

            // Update order on backend
            try {
                await axios.put(`/api/projects/${projectId}/pages/${page.id}/cells/reorder`, {
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
            await axios.put(`/api/projects/${projectId}/cells/${cellId}`, updates);
            onCellsChange();
        } catch (error) {
            console.error('Failed to update cell:', error);
        }
    };

    const handleCellDelete = async (cellId) => {
        try {
            await axios.delete(`/api/projects/${projectId}/cells/${cellId}`);
            setCells(cells.filter(c => c.id !== cellId));
            onCellsChange();
        } catch (error) {
            console.error('Failed to delete cell:', error);
        }
    };

    const [newlyCreatedCellId, setNewlyCreatedCellId] = useState(null);

    const handleAddCell = async (type = 'text') => {
        if (!page) return;

        try {
            const response = await axios.post(`/api/projects/${projectId}/pages/${page.id}/cells`, {
                type,
                content: '',
                orderIndex: cells.length
            });
            setCells([...cells, response.data]);
            setNewlyCreatedCellId(response.data.id);
            onCellsChange();
        } catch (error) {
            console.error('Failed to add cell:', error);
        }
    };

    const handleInsertCell = async (targetCellId, position, type) => {
        if (!page) return;

        try {
            // 1. Create the new cell (appended to end by default)
            const response = await axios.post(`/api/projects/${projectId}/pages/${page.id}/cells`, {
                type,
                content: '',
                orderIndex: cells.length // Temporary, will reorder immediately
            });
            const newCell = response.data;

            // 2. Calculate new order
            const targetIndex = cells.findIndex(c => c.id === targetCellId);
            if (targetIndex === -1) return; // Should not happen

            const newCells = [...cells];
            // Insert at correct position
            // If 'before': insert at targetIndex
            // If 'after': insert at targetIndex + 1
            const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;

            newCells.splice(insertIndex, 0, newCell);

            // 3. Update state immediately for responsiveness
            setCells(newCells);
            setNewlyCreatedCellId(newCell.id);

            // 4. Persist order to backend
            await axios.put(`/api/projects/${projectId}/pages/${page.id}/cells/reorder`, {
                cellIds: newCells.map(c => c.id)
            });

            onCellsChange();
        } catch (error) {
            console.error('Failed to insert cell:', error);
            // Revert state if needed, or just let next load fix it
            // Ideally we'd rollback here but for now just log
        }
    };

    const childPages = (page && page.id !== 'main')
        ? allPages.filter(p => p.parent_id === page.id).sort((a, b) => a.title.localeCompare(b.title))
        : allPages.filter(p => !p.parent_id).sort((a, b) => a.title.localeCompare(b.title));

    const [showCreateRootModal, setShowCreateRootModal] = useState(false);
    const [newRootPageTitle, setNewRootPageTitle] = useState('');

    const handleCreateRootPage = async (e) => {
        e.preventDefault();
        if (!newRootPageTitle.trim()) return;
        try {
            await onCreatePage(newRootPageTitle, null);
            setNewRootPageTitle('');
            setShowCreateRootModal(false);
        } catch (error) {
            console.error('Failed to create root page:', error);
        }
    };

    if (!page) return null;

    const isMainPage = page.id === 'main';

    const formatDate = (dateString) => {
        if (!dateString) return 'Never';
        return new Date(dateString).toLocaleDateString();
    };

    return (
        <div className="page-content">
            <div className="page-content-inner">
                {isMainPage ? (
                    <>
                        <h1 className="project-main-header">Project Home Page</h1>
                        {/* Main page doesn't really track update time in same way, skipping or adding if needed */}

                        <div className="child-pages-section">
                            <div className="section-header-row">
                                <h3 className="child-pages-header">Top-Level Articles</h3>
                                <button className="btn-primary btn-sm" onClick={() => setShowCreateRootModal(true)}>
                                    + New Article
                                </button>
                            </div>
                            {childPages.length > 0 ? (
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
                            ) : (
                                <p className="text-muted">No articles found in this project. Create one to get started!</p>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="page-header-section" style={{ marginBottom: '2rem' }}>
                            <h1 className="page-title" style={{ fontSize: '2.5rem', fontWeight: '800', margin: '0 0 0.5rem 0', color: '#ffffff' }}>{page.title}</h1>
                            <div className="page-meta" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                                Last updated: {formatDate(page.updated_at)}
                                {page.sub_updated_at && ` (Subpages: ${formatDate(page.sub_updated_at)})`}
                            </div>
                        </div>

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
                    </>
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
                                autoFocus={cell.id === newlyCreatedCellId}
                                onInsert={handleInsertCell}
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
                    <button className="btn-secondary" onClick={() => handleAddCell('table')}>
                        + Table
                    </button>
                </div>

                {showCreateRootModal && (
                    <div className="modal-overlay" onClick={() => setShowCreateRootModal(false)}>
                        <div className="modal" onClick={(e) => e.stopPropagation()}>
                            <h3>Create New Root Article</h3>
                            <form onSubmit={handleCreateRootPage}>
                                <input
                                    type="text"
                                    placeholder="Article title..."
                                    value={newRootPageTitle}
                                    onChange={(e) => setNewRootPageTitle(e.target.value)}
                                    autoFocus
                                />
                                <div className="modal-actions">
                                    <button type="button" className="btn-secondary" onClick={() => setShowCreateRootModal(false)}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn-primary">
                                        Create
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default PageContent;
