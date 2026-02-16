import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SearchBar from './SearchBar';
import DeleteConfirmModal from './DeleteConfirmModal';
import { House, CheckSquare, ScrollText } from 'lucide-react';
import './Sidebar.css';

function Sidebar({ projectId, project, allPages, currentPage, onCreatePage, onDeletePage, onUpdatePage }) {
    const [expandedPages, setExpandedPages] = useState(new Set());
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newPageTitle, setNewPageTitle] = useState('');
    const [newPageParent, setNewPageParent] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [moveTarget, setMoveTarget] = useState(null);
    const [moveParentId, setMoveParentId] = useState(null);
    const [sidebarWidth, setSidebarWidth] = useState(parseInt(localStorage.getItem('sidebar-width') || '300'));
    const [isResizing, setIsResizing] = useState(false);
    const [isMinimized, setIsMinimized] = useState(localStorage.getItem('sidebar-minimized') === 'true');
    const navigate = useNavigate();

    const toggleMinimized = () => {
        if (isMinimized) {
            setIsMinimized(false);
            localStorage.setItem('sidebar-minimized', 'false');
            setSidebarWidth(parseInt(localStorage.getItem('sidebar-width') || '300'));
        } else {
            setIsMinimized(true);
            localStorage.setItem('sidebar-minimized', 'true');
            localStorage.setItem('sidebar-width', String(sidebarWidth));
        }
    };

    // Auto-expand all pages by default
    useEffect(() => {
        const allPageIds = allPages.map(p => p.id);
        setExpandedPages(new Set(allPageIds));
    }, [allPages]);

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isResizing) return;
            const newWidth = Math.max(100, Math.min(600, e.clientX));
            setSidebarWidth(newWidth);
        };

        const handleMouseUp = () => {
            if (isResizing) {
                setIsResizing(false);
                localStorage.setItem('sidebar-width', sidebarWidth);
            }
        };

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        } else {
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing, sidebarWidth]);

    const toggleExpanded = (pageId) => {
        const newExpanded = new Set(expandedPages);
        if (newExpanded.has(pageId)) {
            newExpanded.delete(pageId);
        } else {
            newExpanded.add(pageId);
        }
        setExpandedPages(newExpanded);
    };

    const getChildPages = (parentId) => {
        return allPages
            .filter(p => p.parent_id === parentId)
            .sort((a, b) => a.title.localeCompare(b.title));
    };

    const getRootPages = () => {
        return allPages
            .filter(p => !p.parent_id)
            .sort((a, b) => a.title.localeCompare(b.title));
    };

    const handleCreatePage = async (e) => {
        e.preventDefault();
        if (!newPageTitle.trim()) return;

        try {
            const newPage = await onCreatePage(newPageTitle, newPageParent);
            setNewPageTitle('');
            setNewPageParent(null);
            setShowCreateModal(false);
            navigate(`/project/${projectId}/page/${newPage.id}`);
        } catch (error) {
            alert('Failed to create page');
        }
    };

    const handleDeletePage = async () => {
        if (deleteTarget) {
            await onDeletePage(deleteTarget.id);
            setDeleteTarget(null);
        }
    };

    const handleMovePage = async (e) => {
        e.preventDefault();
        if (!moveTarget) return;

        try {
            await onUpdatePage(moveTarget.id, { parentId: moveParentId });
            setMoveTarget(null);
            setMoveParentId(null);
        } catch (error) {
            alert('Failed to move page');
        }
    };

    const isDescendant = (pageId, potentialParentId) => {
        if (!potentialParentId) return false;
        let current = allPages.find(p => p.id === potentialParentId);
        while (current) {
            if (current.parent_id === pageId) return true;
            if (!current.parent_id) break;
            current = allPages.find(p => p.id === current.parent_id);
        }
        return false;
    };

    const renderPageTree = (pages, depth = 0) => {
        return pages.map(page => {
            const children = getChildPages(page.id);
            const hasChildren = children.length > 0;
            const isExpanded = expandedPages.has(page.id);
            const isActive = currentPage?.id === page.id;

            return (
                <div key={page.id} className="page-tree-item">
                    <div
                        className={`page-item ${isActive ? 'active' : ''}`}
                        style={{ paddingLeft: `${depth * 16 + 8}px` }}
                    >
                        {hasChildren && (
                            <button
                                className="expand-btn"
                                onClick={() => toggleExpanded(page.id)}
                            >
                                {isExpanded ? '▼' : '▶'}
                            </button>
                        )}
                        <span
                            className="page-title"
                            onClick={() => navigate(`/project/${projectId}/page/${page.id}`)}
                            style={{ marginLeft: hasChildren ? '0' : '20px' }}
                        >
                            {page.title}
                        </span>
                        <div className="page-actions">
                            <button
                                className="page-action-btn"
                                onClick={() => {
                                    setNewPageParent(page.id);
                                    setShowCreateModal(true);
                                }}
                                title="Add child page"
                            >
                                +
                            </button>
                            <button
                                className="page-action-btn move"
                                onClick={() => {
                                    setMoveTarget(page);
                                    setMoveParentId(page.parent_id);
                                }}
                                title="Move page"
                            >
                                ↕
                            </button>
                            <button
                                className="page-action-btn delete"
                                onClick={() => setDeleteTarget({ id: page.id, title: page.title })}
                                title="Delete page"
                            >
                                ×
                            </button>
                        </div>
                    </div>
                    {hasChildren && isExpanded && (
                        <div className="page-children">
                            {renderPageTree(children, depth + 1)}
                        </div>
                    )}
                </div>
            );
        });
    };

    return (
        <aside className={`sidebar ${isMinimized ? 'sidebar-minimized' : ''}`} style={{ width: isMinimized ? 40 : sidebarWidth }}>
            {isMinimized ? (
                <div className="sidebar-minimized-strip">
                    <button
                        type="button"
                        className="sidebar-expand-btn"
                        onClick={toggleMinimized}
                        title="Expand sidebar"
                    >
                        ▶
                    </button>
                </div>
            ) : (
                <>
                    <div className="sidebar-header">
                        <SearchBar projectId={projectId} />
                        <div className="sidebar-buttons-row">
                            <button
                                className="btn-primary btn-sm-compact"
                                onClick={() => {
                                    setNewPageParent(null);
                                    setShowCreateModal(true);
                                }}
                                title="Create New Page"
                            >
                                +
                            </button>
                            {project && (
                                <button
                                    type="button"
                                    className="btn-secondary btn-icon sidebar-nav-icon sidebar-minimize-btn"
                                    onClick={toggleMinimized}
                                    title="Minimize sidebar"
                                >
                                    ◀
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="page-tree">
                        {allPages.length === 0 ? (
                            <div className="empty-state text-muted">
                                No pages yet. Create one to get started!
                            </div>
                        ) : (
                            renderPageTree(getRootPages())
                        )}
                    </div>

                    {showCreateModal && (
                        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
                            <div className="modal" onClick={(e) => e.stopPropagation()}>
                                <h3>Create New Page</h3>
                                <form onSubmit={handleCreatePage}>
                                    <input
                                        type="text"
                                        placeholder="Page title..."
                                        value={newPageTitle}
                                        onChange={(e) => setNewPageTitle(e.target.value)}
                                        autoFocus
                                    />
                                    <div className="form-group">
                                        <label>Parent Page (optional)</label>
                                        <select
                                            value={newPageParent || ''}
                                            onChange={(e) => setNewPageParent(e.target.value ? parseInt(e.target.value) : null)}
                                        >
                                            <option value="">Root Level</option>
                                            {allPages
                                                .slice()
                                                .sort((a, b) => a.path.localeCompare(b.path))
                                                .map(page => (
                                                    <option key={page.id} value={page.id}>
                                                        {page.path}
                                                    </option>
                                                ))}
                                        </select>
                                    </div>
                                    <div className="modal-actions">
                                        <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
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

                    {moveTarget && (
                        <div className="modal-overlay" onClick={() => setMoveTarget(null)}>
                            <div className="modal" onClick={(e) => e.stopPropagation()}>
                                <h3>Move Page: {moveTarget.title}</h3>
                                <form onSubmit={handleMovePage}>
                                    <div className="form-group">
                                        <label>Select New Parent</label>
                                        <select
                                            value={moveParentId || ''}
                                            onChange={(e) => setMoveParentId(e.target.value ? parseInt(e.target.value) : null)}
                                        >
                                            <option value="">Root Level</option>
                                            {allPages
                                                .filter(p => p.id !== moveTarget.id && !isDescendant(moveTarget.id, p.id))
                                                .sort((a, b) => a.path.localeCompare(b.path))
                                                .map(page => (
                                                    <option key={page.id} value={page.id}>
                                                        {page.path}
                                                    </option>
                                                ))}
                                        </select>
                                    </div>
                                    <div className="modal-actions">
                                        <button type="button" className="btn-secondary" onClick={() => setMoveTarget(null)}>
                                            Cancel
                                        </button>
                                        <button type="submit" className="btn-primary">
                                            Move
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {deleteTarget && (
                        <DeleteConfirmModal
                            itemType="page"
                            itemName={deleteTarget.title}
                            onConfirm={handleDeletePage}
                            onCancel={() => setDeleteTarget(null)}
                        />
                    )}
                    <div
                        className="sidebar-resizer"
                        onMouseDown={() => setIsResizing(true)}
                    />
                </>
            )}
        </aside>
    );
}

export default Sidebar;
