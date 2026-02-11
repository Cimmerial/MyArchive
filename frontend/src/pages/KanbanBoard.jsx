import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import {
    DndContext,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SquareCheckBig, Square, Calendar } from 'lucide-react';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import LinkContextMenu from '../components/LinkContextMenu';
import './KanbanBoard.css';

const COLUMNS = ['Priority Todos', 'Other Todos', 'Icebox', 'Completed'];
const ACTIVE_COLUMNS = COLUMNS.slice(0, 3); // Priority, Other, Icebox (exclude Completed)

/** Fuzzy search: exact substring = 0, fuzzy subsequence = 1, no match = 2. Lower is better. */
function searchRank(item, query) {
    const q = query.trim().toLowerCase();
    if (!q) return { match: true, rank: 0 };
    const title = (item.title || '').toLowerCase();
    const desc = (item.description || '').toLowerCase();
    const exactTitle = title.includes(q);
    const exactDesc = desc.includes(q);
    if (exactTitle) return { match: true, rank: 0 };
    if (exactDesc) return { match: true, rank: 1 };
    // Fuzzy: query chars appear in order
    const fuzzy = (text) => {
        let j = 0;
        for (let i = 0; i < text.length && j < q.length; i++) {
            if (text[i] === q[j]) j++;
        }
        return j === q.length;
    };
    if (fuzzy(title)) return { match: true, rank: 2 };
    if (fuzzy(desc)) return { match: true, rank: 3 };
    return { match: false, rank: 99 };
}

// --- Create Modal Component ---
function TaskCreateModal({ column, onConfirm, onCancel, onContextMenu }) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onConfirm(title, description);
    };

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal kanban-modal" onClick={e => e.stopPropagation()}>
                <h3>New Task in {column}</h3>
                <form onSubmit={handleSubmit} className="task-create-form">
                    <div className="form-group">
                        <label>Title</label>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            onContextMenu={e => {
                                onContextMenu(e, setTitle, setDescription, 'title');
                            }}
                            autoFocus
                            placeholder="Task title..."
                        />
                    </div>
                    <div className="form-group">
                        <label>Description</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Details (supports [[Wiki Links]])..."
                            rows={6}
                            onContextMenu={e => {
                                onContextMenu(e, setTitle, setDescription, 'description');
                            }}
                        />
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
                        <button type="submit" className="btn-primary">Create Task</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// --- Edit Modal Component ---
function TaskEditModal({ item, onSave, onCancel, onContextMenu }) {
    const [editValues, setEditValues] = useState({
        title: item.title || '',
        description: item.description || '',
        tag_color: item.tag_color || null
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!editValues.title.trim()) return;
        onSave(editValues);
    };

    const openLinkMenu = (e, field) => {
        const selection = window.getSelection();
        const text = selection.toString();
        if (text && text.trim()) {
            onContextMenu(e, field, (linkText) => {
                setEditValues(prev => ({
                    ...prev,
                    [field]: (prev[field] || '').replace(text, linkText)
                }));
            });
        }
    };

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal kanban-modal" onClick={e => e.stopPropagation()}>
                <h3>Edit Task</h3>
                <form onSubmit={handleSubmit} className="task-edit-form">
                    <div className="form-group">
                        <label>Title</label>
                        <input
                            type="text"
                            value={editValues.title}
                            onChange={e => setEditValues(prev => ({ ...prev, title: e.target.value }))}
                            onContextMenu={e => openLinkMenu(e, 'title')}
                            autoFocus
                            placeholder="Task title..."
                        />
                    </div>
                    <div className="form-group">
                        <label>Description</label>
                        <textarea
                            value={editValues.description}
                            onChange={e => setEditValues(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Details (supports [[Wiki Links]])..."
                            rows={10}
                            onContextMenu={e => openLinkMenu(e, 'description')}
                        />
                    </div>
                    <div className="form-group">
                        <label>Tags</label>
                        <div className="item-tag-dots" style={{ marginTop: 4 }}>
                            <button
                                type="button"
                                className={`tag-dot yellow ${editValues.tag_color === 'yellow' ? 'active' : ''}`}
                                title="Importance"
                                onClick={() => setEditValues(prev => ({ ...prev, tag_color: prev.tag_color === 'yellow' ? null : 'yellow' }))}
                            />
                            <button
                                type="button"
                                className={`tag-dot red ${editValues.tag_color === 'red' ? 'active' : ''}`}
                                title="Error"
                                onClick={() => setEditValues(prev => ({ ...prev, tag_color: prev.tag_color === 'red' ? null : 'red' }))}
                            />
                        </div>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
                        <button type="submit" className="btn-primary">Save</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// --- Sortable Item Component ---
function SortableItem({ item, onUpdate, onDelete, onContextMenu, onOpenEditModal, allPages, projectId }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: item.id, data: { ...item } });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    // Handle Wiki Links and Auto-Link ALL CAPS
    const renderDescription = (text) => {
        if (!text) return null;

        const parts = [];
        // Regex to find [[Links]] OR ALL CAPS words (min 2 chars, boundary checks)
        // Groups: 1=[[Link]], 2=ALL CAPS
        const regex = /(\[\[.*?\]\])|(\b[A-Z][A-Z0-9\s]+[A-Z0-9]\b)/g;

        let lastIndex = 0;
        let match;

        while ((match = regex.exec(text)) !== null) {
            // Add text before match
            if (match.index > lastIndex) {
                parts.push(text.substring(lastIndex, match.index));
            }

            const fullMatch = match[0];

            if (match[1]) {
                // Explicit [[Link]]
                const pageName = fullMatch.slice(2, -2);
                const page = allPages.find(p => p.title.toLowerCase() === pageName.toLowerCase());
                if (page) {
                    parts.push(<a key={match.index} className="wiki-link" href={`/project/${projectId}/page/${page.id}`} onClick={e => { e.preventDefault(); window.location.href = `/project/${projectId}/page/${page.id}` }}>{pageName}</a>);
                } else {
                    parts.push(<span key={match.index} className="wiki-link-broken">{pageName}</span>);
                }
            } else if (match[2]) {
                // Auto-link ALL CAPS
                const phrase = match[2];
                // Avoid linking if it's just a common acronym or short? User prompt said "like cells", so match pages.
                const page = allPages.find(p => p.title.toUpperCase() === phrase);
                if (page) {
                    // Use a span with onClick to avoid nesting if parent is dragged, but standard link is okay if we stop propagation
                    parts.push(<a key={match.index} className="wiki-link" href={`/project/${projectId}/page/${page.id}`} onClick={e => { e.preventDefault(); e.stopPropagation(); window.location.href = `/project/${projectId}/page/${page.id}` }}>{toCamelCase(phrase)}</a>);
                } else {
                    parts.push(phrase);
                }
            }

            lastIndex = regex.lastIndex;
        }

        if (lastIndex < text.length) {
            parts.push(text.substring(lastIndex));
        }

        return parts;
    };

    // Helper for display
    const toCamelCase = (str) => {
        return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    };



    // Wait, the prompt implies "highlight right click to link" on any card.
    // If I put `onContextMenu` on the item content div, I can capture calls.
    // But SortableItem doesn't manage the `LinkContextMenu`. The Board should probably do it, 
    // or we render it here. Rendering here is easier for positioning relative to item, but standard is root.
    // Let's modify `onUpdate` to handle a special "contextMenuRequest" or just pass a prop `onContextMenu`.
    // Actually, let's keep it simple: Render local if easier, or lift state. 
    // Lifting state is safer for z-index.
    // Let's assume `onContextMenu` prop is passed.

    // WRONG: We can't update item.id with contextMenu object in local state cleanly if we use onUpdate which calls API.
    // We need a separate prop `onConnectMenu(event, item, field, text)`

    const formatDate = (dateString, label) => {
        if (!dateString) return null;
        return <div className="item-date" title={label}> <Calendar size={10} style={{ display: 'inline', marginRight: 2 }} /> {new Date(dateString).toLocaleDateString()}</div>;
    };

    const isCompleted = item.column === 'Completed';

    return (
        <div ref={setNodeRef} style={style} className={`kanban-item ${isCompleted ? 'completed' : ''} ${item.tag_color === 'yellow' ? 'tag-yellow' : ''} ${item.tag_color === 'red' ? 'tag-red' : ''}`}>
            <div
                    className="item-content"
                    onContextMenu={(e) => {
                        const selection = window.getSelection();
                        const text = selection.toString();
                        if (text) {
                            e.preventDefault();
                            // We need to pass this up to the board
                            // Use a custom event or prop? We'll rely on a prop added below.
                            // But for now, since I can't easily change the signature in this chunk without re-writing `SortableItem` entirely...
                            // Actually I AM rewriting a large chunk. I will add `onItemsContextMenu` prop to SortableItem.
                        }
                    }}
                >
                    <div className="item-header">
                        {/* Drag Handle - Added touch-action: none inline style to enforce it */}
                        <div className="item-drag-handle" {...attributes} {...listeners} style={{ touchAction: 'none' }}>
                            ⋮⋮
                        </div>
                        <div className="item-title-col">
                            <div className="item-title" onContextMenu={(e) => {
                                const selection = window.getSelection();
                                if (selection.toString().trim()) {
                                    onContextMenu(item, 'context-menu', e, selection.toString(), 'title');
                                }
                            }}>{renderDescription(item.title)}</div>
                        </div>
                        {/* Completion Button */}
                        <button
                            className={`btn-icon-check ${isCompleted ? 'checked' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (isCompleted) {
                                    // Restore
                                    const targetCol = item.original_column || 'Priority Todos';
                                    onUpdate(item.id, { column: targetCol });
                                } else {
                                    // Complete
                                    onUpdate(item.id, { column: 'Completed', original_column: item.column });
                                }
                            }}
                            title={isCompleted ? "Mark as Incomplete" : "Mark as Completed"}
                        >
                            {isCompleted ? <SquareCheckBig size={18} /> : <Square size={18} />}
                        </button>
                    </div>
                    {item.description && <div className="item-desc"
                        onContextMenu={(e) => {
                            const selection = window.getSelection();
                            if (selection.toString().trim()) {
                                onContextMenu(item, 'context-menu', e, selection.toString(), 'description');
                            }
                        }}
                    >{renderDescription(item.description)}</div>}
                    <div className="item-footer">
                        <div className="item-dates">
                            {formatDate(item.created_at, "Created")}
                            <div className="item-tag-dots" onClick={e => e.stopPropagation()}>
                                <button
                                    type="button"
                                    className={`tag-dot yellow ${item.tag_color === 'yellow' ? 'active' : ''}`}
                                    title="Importance"
                                    onClick={() => onUpdate(item.id, { tag_color: item.tag_color === 'yellow' ? null : 'yellow' })}
                                />
                                <button
                                    type="button"
                                    className={`tag-dot red ${item.tag_color === 'red' ? 'active' : ''}`}
                                    title="Error"
                                    onClick={() => onUpdate(item.id, { tag_color: item.tag_color === 'red' ? null : 'red' })}
                                />
                            </div>
                        </div>
                        <div className="item-controls-hover">
                            <button className="btn-icon-sm" onClick={() => onOpenEditModal(item)}>✎</button>
                            <button className="btn-icon-sm delete" onClick={() => onDelete(item, 'delete')}>×</button>
                        </div>
                    </div>
                </div>
        </div>
    );
}

// --- Main Board Component ---
function KanbanBoard() {
    const { projectId } = useParams();
    const [project, setProject] = useState(null);
    const [allPages, setAllPages] = useState([]);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeDragItem, setActiveDragItem] = useState(null);
    const [createModalState, setCreateModalState] = useState(null); // { column: string }
    const [editingItem, setEditingItem] = useState(null); // item being edited in modal
    const [deleteItem, setDeleteItem] = useState(null); // { id, title }
    const [contextMenuState, setContextMenuState] = useState(null); // { x, y, text, item, field, updateCallback } 


    const [searchQueries, setSearchQueries] = useState(
        COLUMNS.reduce((acc, col) => ({ ...acc, [col]: '' }), {})
    );
    const [globalSearchQuery, setGlobalSearchQuery] = useState('');
    const [todoBoardFontSize, setTodoBoardFontSize] = useState(() => localStorage.getItem('todo-board-font-size') || 'medium');

    // Initial Load
    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId]);

    useEffect(() => {
        const handler = () => setTodoBoardFontSize(localStorage.getItem('todo-board-font-size') || 'medium');
        window.addEventListener('todo-board-font-size-changed', handler);
        return () => window.removeEventListener('todo-board-font-size-changed', handler);
    }, []);

    const loadData = async () => {
        try {
            const [projRes, pagesRes, itemsRes] = await Promise.all([
                axios.get('/api/projects'),
                axios.get(`/api/projects/${projectId}/pages`),
                axios.get(`/api/projects/${projectId}/kanban`)
            ]);

            const proj = projRes.data.find(p => p.id === parseInt(projectId));
            setProject(proj);
            setAllPages(pagesRes.data);
            setItems(itemsRes.data);
        } catch (error) {
            console.error('Failed to load kanban data:', error);
        } finally {
            setLoading(false);
        }
    };

    // --- Actions ---

    const handleCreateItem = async (title, description) => {
        const column = createModalState.column;
        if (!title || !column) return;

        try {
            const response = await axios.post(`/api/projects/${projectId}/kanban`, {
                column,
                title,
                description,
                orderIndex: items.filter(i => i.column === column).length
            });
            setItems([...items, response.data]);
            setCreateModalState(null);
        } catch (error) {
            console.error("Failed to create item:", error);
            alert("Failed to create item");
        }
    };

    const handleUpdateItem = async (id, updates) => {
        try {
            const response = await axios.put(`/api/projects/${projectId}/kanban/${id}`, updates);
            setItems(items.map(i => i.id === id ? response.data : i));
        } catch (error) {
            console.error("Failed to update item:", error);
        }
    };

    const handleContextAction = (item, action, event, text, field, updateCallback) => {
        if (action === 'delete') {
            setDeleteItem(item);
        } else if (action === 'context-menu') {
            event.preventDefault();
            setContextMenuState({
                x: event.clientX,
                y: event.clientY,
                text: text,
                item: item,
                field: field, // 'title' or 'description'
                updateCallback: updateCallback // Pass the local update callback
            });
        }
    };

    const handleContextMenuLink = (page) => {
        if (!contextMenuState) return;
        const { item, field, text } = contextMenuState;

        // Wrap text in [[ ]]
        // Simple replacement logic: replace FIRST occurrence of selected text if we can't do exact range replacement
        // Since we are not in contentEditable, we rely on string replacement.
        // It's imperfect for duplicate words but acceptable for this context.

        // If we have a local update callback (for modal inputs), use it
        if (contextMenuState.updateCallback) {
            // Pass the fully formed link text to the callback
            // The callback is responsible for inserting it into the input
            contextMenuState.updateCallback(`[[${page.title}]]`);
        } else {
            // API update for existing items
            const originalContent = item[field] || '';
            const newContent = originalContent.replace(text, `[[${page.title}]]`);
            handleUpdateItem(item.id, { [field]: newContent });
        }
        setContextMenuState(null);
    };

    const handleCreationContextMenu = (event, eventSetTitle, eventSetDescription, field) => {
        event.preventDefault();
        const selection = window.getSelection();
        const text = selection.toString();
        if (!text) return;
        setContextMenuState({
            x: event.clientX,
            y: event.clientY,
            text: text,
            item: null,
            field: field,
            updateCallback: (linkText) => {
                if (field === 'title') {
                    eventSetTitle(prev => prev.replace(text, linkText));
                } else {
                    eventSetDescription(prev => prev.replace(text, linkText));
                }
            }
        });
    };

    const handleEditModalContextMenu = (event, field, updateCallback) => {
        event.preventDefault();
        const text = window.getSelection().toString();
        if (!text) return;
        setContextMenuState({
            x: event.clientX,
            y: event.clientY,
            text,
            item: editingItem,
            field,
            updateCallback
        });
    };



    // Need to handle page creation success to then link it
    // But SortableItem logic for create page was complex.
    // For now, let's just create the page. Linking automatically might require more state tracking.

    const handleDeleteItem = async () => {
        if (!deleteItem) return;
        try {
            await axios.delete(`/api/projects/${projectId}/kanban/${deleteItem.id}`);
            setItems(items.filter(i => i.id !== deleteItem.id));
            setDeleteItem(null);
        } catch (error) {
            console.error("Failed to delete item:", error);
            alert("Failed to delete item");
        }
    };



    // --- Drag and Drop Logic ---
    // Increased activation constraint to prevent accidental drags (failed selection)

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );
    const handleDragStart = (event) => {
        setActiveDragItem(event.active.data.current);
    };

    const handleDragOver = (event) => {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id;
        const overId = over.id;

        // Use data payload if possible, else find in state
        const activeItem = items.find(i => i.id === activeId);
        const overItem = items.find(i => i.id === overId); // Might be undefined if over a container

        if (!activeItem) return;

        // Find over column
        let overColumn = null;
        if (overItem) {
            overColumn = overItem.column;
        } else {
            // Check if over is a column container
            if (COLUMNS.includes(overId)) {
                overColumn = overId;
            }
        }

        if (overColumn && activeItem.column !== overColumn) {
            // Moving between columns
            setItems(prev => {
                const activeIndex = prev.findIndex(i => i.id === activeId);
                const overIndex = prev.findIndex(i => i.id === overId);

                const newItems = [...prev];

                if (activeIndex !== -1) {
                    newItems[activeIndex] = { ...newItems[activeIndex], column: overColumn };
                }

                return (activeIndex !== -1 && overIndex !== -1)
                    ? arrayMove(newItems, activeIndex, overIndex)
                    : newItems;
            });
        }
    };

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        setActiveDragItem(null);

        if (!over) return;

        const activeId = active.id;
        const overId = over.id;

        const activeItem = items.find(i => i.id === activeId);

        // Determine target column
        let targetColumn = activeItem.column;
        if (COLUMNS.includes(overId)) {
            targetColumn = overId;
        } else {
            const overItem = items.find(i => i.id === overId);
            if (overItem) targetColumn = overItem.column;
        }


        if (activeId !== overId || activeItem.column !== targetColumn) {

            // Final state: reorder and set moved item's column (state may be stale so we fix it here)
            const activeIndex = items.findIndex(i => i.id === activeId);
            const overIndex = items.findIndex(i => i.id === overId);

            let finalItems = [...items];

            if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
                finalItems = arrayMove(finalItems, activeIndex, overIndex);
            }

            // Ensure the moved item has the target column (critical for persistence)
            const moved = finalItems.find(i => i.id === activeId);
            if (moved) moved.column = targetColumn;

            setItems(finalItems);

            // Persist immediately
            try {
                const targetColItems = finalItems.filter(i => i.column === targetColumn);
                const payload = targetColItems.map((item, idx) => ({
                    id: item.id,
                    column: targetColumn,
                    orderIndex: idx
                }));

                const initialItem = active.data?.current?.item;
                if (initialItem && targetColumn === 'Completed' && initialItem.column !== 'Completed') {
                    await handleUpdateItem(activeId, { original_column: initialItem.column });
                }

                await axios.post(`/api/projects/${projectId}/kanban/reorder`, { items: payload });
            } catch (err) {
                console.error("Failed to reorder", err);
            }
        }
    };

    // Stub functions required by Sidebar but not used in this view context
    const createPage = async () => { };
    const deletePage = async () => { };
    const updatePage = async () => { };

    if (loading) return <div className="kanban-page loading">Loading...</div>;

    return (
        <div className={`kanban-page font-size-${todoBoardFontSize}`}>
            <Header project={project} currentPage={{ id: 'kanban-board', title: 'Todo Board' }} allPages={allPages} />
            <div className="wiki-content">
                <Sidebar
                    projectId={projectId}
                    project={project}
                    allPages={allPages}
                    currentPage={{ id: 'todo' }}
                    onCreatePage={createPage}
                    onDeletePage={deletePage}
                    onUpdatePage={updatePage}
                />

                <div className="kanban-board-container">
                    <div className="kanban-header">
                        <h1>{project ? project.display_name : 'Project'} TODOs</h1>
                        <input
                            type="text"
                            className="kanban-global-search"
                            placeholder="Search all active todos (fuzzy)..."
                            value={globalSearchQuery}
                            onChange={e => setGlobalSearchQuery(e.target.value)}
                        />
                    </div>

                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCorners}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDragEnd={handleDragEnd}
                    >
                        <div className="kanban-columns">
                            {COLUMNS.map(column => {
                                const isActiveColumn = ACTIVE_COLUMNS.includes(column);
                                let columnItems = items.filter(i => i.column === column);

                                if (isActiveColumn && globalSearchQuery.trim()) {
                                    const withRank = columnItems.map(i => ({ item: i, ...searchRank(i, globalSearchQuery) }));
                                    columnItems = withRank
                                        .filter(w => w.match)
                                        .sort((a, b) => a.rank - b.rank || (a.item.order_index - b.item.order_index))
                                        .map(w => w.item);
                                } else {
                                    columnItems = columnItems.filter(i => {
                                        const q = searchQueries[column].toLowerCase();
                                        return !q || (i.title || '').toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q);
                                    });
                                }

                                return (
                                    <div key={column} className="kanban-column">
                                        <div className="column-header">
                                            <h3>{column}</h3>
                                            <span className="count">{columnItems.length}</span>
                                        </div>
                                        <div className="column-tools">
                                            <input
                                                type="text"
                                                placeholder="Search..."
                                                value={searchQueries[column]}
                                                onChange={e => setSearchQueries({ ...searchQueries, [column]: e.target.value })}
                                                className="column-search"
                                            />
                                            <button className="btn-icon-add" onClick={() => setCreateModalState({ column })}>+</button>
                                        </div>

                                        <div className="sortable-container">
                                            <SortableContext
                                                items={columnItems.map(i => i.id)}
                                                strategy={verticalListSortingStrategy}
                                                id={column} // IMPORTANT for drag detection
                                            >
                                                <div className="items-list" data-column={column}>
                                                    {columnItems.map(item => (
                                                        <SortableItem
                                                            key={item.id}
                                                            item={item}
                                                            onUpdate={handleUpdateItem}
                                                            onDelete={handleContextAction}
                                                            onContextMenu={handleContextAction}
                                                            onOpenEditModal={setEditingItem}
                                                            allPages={allPages}
                                                            projectId={projectId}
                                                        />
                                                    ))}
                                                    {/* Drop zone placeholder if empty */}
                                                    {columnItems.length === 0 && (
                                                        <div className="empty-drop-zone" id={column}>Drag items here</div>
                                                    )}
                                                </div>
                                            </SortableContext>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <DragOverlay>
                            {activeDragItem ? (
                                <div className="kanban-item dragging">
                                    <div className="item-title">{activeDragItem.title}</div>
                                </div>
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                </div>
            </div>
            {createModalState && (
                <TaskCreateModal
                    column={createModalState.column}
                    onConfirm={handleCreateItem}
                    onContextMenu={handleCreationContextMenu}
                    onCancel={() => setCreateModalState(null)}
                />
            )}
            {editingItem && (
                <TaskEditModal
                    item={editingItem}
                    onSave={(updates) => {
                        handleUpdateItem(editingItem.id, updates);
                        setEditingItem(null);
                    }}
                    onCancel={() => setEditingItem(null)}
                    onContextMenu={handleEditModalContextMenu}
                />
            )}
            {deleteItem && (
                <DeleteConfirmModal
                    itemType="task"
                    itemName={deleteItem.title}
                    onConfirm={handleDeleteItem}
                    onCancel={() => setDeleteItem(null)}
                />
            )}
            {contextMenuState && (
                <LinkContextMenu
                    projectId={projectId}
                    searchText={contextMenuState.text}
                    position={{ x: contextMenuState.x, y: contextMenuState.y }}
                    allPages={allPages}
                    onClose={() => setContextMenuState(null)}
                    onSelectPage={handleContextMenuLink}
                    onCreateNew={() => setContextMenuState(null)}
                    isLink={false} // Selection is just text for now
                    onUnlink={() => { }}
                />
            )}
            {/* Minimal support for create page from board context menu - reuses Sidebar modal? No, simpler to just have basic one or ignore for now as 'Create New Page' is complex */}
        </div>
    );
}

export default KanbanBoard;
