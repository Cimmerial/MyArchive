import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Header.css';

const TODO_BOARD_FONT_KEY = 'todo-board-font-size';

function Header({ project, currentPage, allPages }) {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [currentFont, setCurrentFont] = useState(localStorage.getItem('app-font') || 'Inter');
    const [todoBoardFontSize, setTodoBoardFontSize] = useState(localStorage.getItem(TODO_BOARD_FONT_KEY) || 'medium');
    const navigate = useNavigate();

    useEffect(() => {
        // Apply font on mount and change
        document.body.style.fontFamily = getFontFamily(currentFont);
        localStorage.setItem('app-font', currentFont);

        // Close settings when clicking outside
        const handleClickOutside = () => setIsSettingsOpen(false);
        if (isSettingsOpen) {
            document.addEventListener('click', handleClickOutside);
        }
        return () => document.removeEventListener('click', handleClickOutside);
    }, [currentFont, isSettingsOpen]);

    const handleTodoBoardFontSize = (size) => {
        setTodoBoardFontSize(size);
        localStorage.setItem(TODO_BOARD_FONT_KEY, size);
        window.dispatchEvent(new CustomEvent('todo-board-font-size-changed', { detail: size }));
    };

    const getFontFamily = (fontName) => {
        switch (fontName) {
            case 'Inter': return '"Inter", system-ui, sans-serif';
            case 'Roboto': return '"Roboto", sans-serif';
            case 'Serif': return 'Georgia, serif';
            case 'Mono': return 'monospace';
            default: return '"Inter", system-ui, sans-serif';
        }
    };

    const buildBreadcrumbs = () => {
        if (!currentPage) return [];

        const crumbs = [];
        let page = currentPage;

        // Skip adding the main page directly if we handle it separately,
        // but user might want to see layout structure. 
        // Logic: Main Page -> Parent -> Child

        // If current is main, we don't show it in crumbs (project title is enough)
        if (page.id === 'main') return [];

        while (page) {
            crumbs.unshift(page);
            if (page.parent_id) {
                page = allPages.find(p => p.id === page.parent_id);
            } else {
                page = null;
            }
        }
        return crumbs;
    };

    const breadcrumbs = buildBreadcrumbs();

    return (
        <header className="wiki-header">
            <div className="header-left">
                <div className="breadcrumbs">
                    <Link to="/" className="breadcrumb-item">Myrchive</Link>

                    {project && (
                        <>
                            <span className="breadcrumb-separator">›</span>
                            <Link to={`/project/${project.id}`} className="breadcrumb-item">
                                {project.display_name}
                            </Link>
                        </>
                    )}

                    {breadcrumbs.map((page, index) => (
                        <span key={page.id} className="breadcrumb-container">
                            <span className="breadcrumb-separator">›</span>
                            <Link
                                to={`/project/${project.id}/page/${page.id}`}
                                className={`breadcrumb-item ${index === breadcrumbs.length - 1 ? 'active' : ''}`}
                            >
                                {page.title}
                            </Link>
                        </span>
                    ))}
                </div>
            </div>

            <div className="header-right">
                <div className="nav-controls">
                    <button className="nav-btn" onClick={() => navigate(-1)} title="Go Back">
                        ←
                    </button>
                    <button className="nav-btn" onClick={() => navigate(1)} title="Go Forward">
                        →
                    </button>
                </div>
                <div className="settings-container" onClick={e => e.stopPropagation()}>
                    <button
                        className={`settings-btn ${isSettingsOpen ? 'active' : ''}`}
                        onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                        title="Settings"
                    >
                        ⚙
                    </button>

                    {isSettingsOpen && (
                        <div className="settings-dropdown">
                            <div className="settings-section">
                                <h4>Font Family</h4>
                                <div className="font-options">
                                    {['Inter', 'Roboto', 'Serif', 'Mono'].map(font => (
                                        <div
                                            key={font}
                                            className={`font-option ${currentFont === font ? 'active' : ''}`}
                                            onClick={() => setCurrentFont(font)}
                                        >
                                            {font}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {currentPage?.id === 'kanban-board' && (
                                <div className="settings-section">
                                    <h4>Todo board font size</h4>
                                    <div className="font-options">
                                        {['small', 'medium', 'large'].map(size => (
                                            <div
                                                key={size}
                                                className={`font-option ${todoBoardFontSize === size ? 'active' : ''}`}
                                                onClick={() => handleTodoBoardFontSize(size)}
                                            >
                                                {size.charAt(0).toUpperCase() + size.slice(1)}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}

export default Header;
