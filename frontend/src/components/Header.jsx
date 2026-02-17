import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { House, CheckSquare, ScrollText } from 'lucide-react';
import './Header.css';

const TODO_BOARD_FONT_KEY = 'todo-board-font-size';
const TODO_BOARD_COLUMN_WIDTH_KEY = 'todo-board-column-width';
const TODO_BOARD_MIN_LINES_KEY = 'todo-board-minimized-lines';

function Header({ project, currentPage, allPages }) {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [currentFont, setCurrentFont] = useState(localStorage.getItem('app-font') || 'Inter');
    const [todoBoardFontSize, setTodoBoardFontSize] = useState(localStorage.getItem(TODO_BOARD_FONT_KEY) || 'medium');
    const [todoBoardColumnWidth, setTodoBoardColumnWidth] = useState(localStorage.getItem(TODO_BOARD_COLUMN_WIDTH_KEY) || 'default');
    const [todoBoardMinLines, setTodoBoardMinLines] = useState(localStorage.getItem(TODO_BOARD_MIN_LINES_KEY) || '5');
    const [customButtonText, setCustomButtonText] = useState(localStorage.getItem('custom-button-text') || 'T.P.S TRADING');
    const [customButtonLink, setCustomButtonLink] = useState(localStorage.getItem('custom-button-link') || 'http://localhost:3000/');
    const [isLive, setIsLive] = useState(false);
    const [showCustomButton, setShowCustomButton] = useState(localStorage.getItem('show-custom-header-button') !== 'false');



    const navigate = useNavigate();
    const { projectId } = useParams();

    useEffect(() => {
        // Apply font on mount and change
        document.body.style.fontFamily = getFontFamily(currentFont);
        localStorage.setItem('app-font', currentFont);

        // Close settings when clicking outside
        const handleClickOutside = () => setIsSettingsOpen(false);
        if (isSettingsOpen) {
            document.addEventListener('click', handleClickOutside);
        }

        // Server liveness check
        const checkLiveness = async () => {
            try {
                // Use no-cors to avoid CORS issues for simple connectivity checks
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);

                await fetch(customButtonLink, {
                    mode: 'no-cors',
                    signal: controller.signal,
                    cache: 'no-cache'
                });

                clearTimeout(timeoutId);
                setIsLive(true);
            } catch (err) {
                setIsLive(false);
            }
        };

        checkLiveness();
        const intervalId = setInterval(checkLiveness, 10000); // Check every 10 seconds

        return () => {
            document.removeEventListener('click', handleClickOutside);
            clearInterval(intervalId);
        };
    }, [currentFont, isSettingsOpen, customButtonLink]);


    const handleTodoBoardFontSize = (size) => {
        setTodoBoardFontSize(size);
        localStorage.setItem(TODO_BOARD_FONT_KEY, size);
        window.dispatchEvent(new CustomEvent('todo-board-font-size-changed', { detail: size }));
    };

    const handleTodoBoardColumnWidth = (width) => {
        setTodoBoardColumnWidth(width);
        localStorage.setItem(TODO_BOARD_COLUMN_WIDTH_KEY, width);
        window.dispatchEvent(new CustomEvent('todo-board-column-width-changed', { detail: width }));
    };

    const handleTodoBoardMinLines = (lines) => {
        setTodoBoardMinLines(lines);
        localStorage.setItem(TODO_BOARD_MIN_LINES_KEY, lines);
        window.dispatchEvent(new CustomEvent('todo-board-minimized-lines-changed', { detail: lines }));
    };

    const handleCustomButtonText = (text) => {
        setCustomButtonText(text);
        localStorage.setItem('custom-button-text', text);
    };

    const handleCustomButtonLink = (link) => {
        setCustomButtonLink(link);
        localStorage.setItem('custom-button-link', link);
    };

    const handleShowCustomButtonToggle = () => {
        const newValue = !showCustomButton;
        setShowCustomButton(newValue);
        localStorage.setItem('show-custom-header-button', newValue.toString());
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

    const handleCustomButtonClick = (e) => {
        e.preventDefault();
        if (!isLive) return;

        // Using a named window and focusing it
        const win = window.open(customButtonLink, 'TPS_TRADING_PORTAL');
        if (win) win.focus();
    };

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
                    {projectId && (
                        <>
                            <div className="main-nav-buttons">
                                {showCustomButton && (
                                    <>
                                        <a
                                            href={isLive ? customButtonLink : '#'}
                                            className={`custom-bubble-btn ${!isLive ? 'offline' : ''}`}
                                            onClick={handleCustomButtonClick}
                                        >
                                            {customButtonText}
                                        </a>
                                        <div className="nav-separator">|</div>
                                    </>
                                )}
                                <Link


                                    to={`/project/${projectId}`}
                                    className={`nav-icon-btn ${currentPage?.id === 'main' ? 'active' : ''}`}
                                    title="Home"
                                >
                                    <House size={18} />
                                </Link>
                                <Link
                                    to={`/project/${projectId}/todo`}
                                    className={`nav-icon-btn ${currentPage?.id === 'todo' ? 'active' : ''}`}
                                    title="Kanban Board"
                                >
                                    <CheckSquare size={18} />
                                </Link>
                                <Link
                                    to={`/project/${projectId}/devlog`}
                                    className={`nav-icon-btn ${currentPage?.id === 'devlog' ? 'active' : ''}`}
                                    title="Developer Log"
                                >
                                    <ScrollText size={18} />
                                </Link>
                            </div>
                            <div className="nav-separator">|</div>
                        </>
                    )}
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
                        <SettingsModal
                            todoBoardMinLines={todoBoardMinLines}
                            handleTodoBoardMinLines={handleTodoBoardMinLines}
                            todoBoardColumnWidth={todoBoardColumnWidth}
                            handleTodoBoardColumnWidth={handleTodoBoardColumnWidth}
                            todoBoardFontSize={todoBoardFontSize}
                            handleTodoBoardFontSize={handleTodoBoardFontSize}
                            currentFont={currentFont}
                            setCurrentFont={setCurrentFont}
                            onClose={() => setIsSettingsOpen(false)}
                            isKanban={currentPage?.id === 'kanban-board'}
                            customButtonText={customButtonText}
                            handleCustomButtonText={handleCustomButtonText}
                            customButtonLink={customButtonLink}
                            handleCustomButtonLink={handleCustomButtonLink}
                            showCustomButton={showCustomButton}
                            handleShowCustomButtonToggle={handleShowCustomButtonToggle}
                        />


                    )}
                </div>
            </div>
        </header>
    );
}

function SettingsModal({
    todoBoardMinLines, handleTodoBoardMinLines,
    todoBoardColumnWidth, handleTodoBoardColumnWidth,
    todoBoardFontSize, handleTodoBoardFontSize,
    currentFont, setCurrentFont,
    onClose, isKanban,
    customButtonText, handleCustomButtonText,
    customButtonLink, handleCustomButtonLink,
    showCustomButton, handleShowCustomButtonToggle
}) {


    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal settings-modal" onClick={e => e.stopPropagation()}>
                <div className="settings-modal-header">
                    <h3>App Settings</h3>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>
                <div className="settings-modal-columns">
                    <div className="settings-modal-column">
                        <h4>General</h4>
                        <div className="setting-item">
                            <label>Font Family</label>
                            <CustomDropdown
                                options={['Inter', 'Roboto', 'Serif', 'Mono']}
                                value={currentFont}
                                onChange={setCurrentFont}
                            />
                        </div>
                        <div className="setting-item">
                            <label>Custom Button Text</label>
                            <input
                                type="text"
                                className="settings-input"
                                value={customButtonText}
                                onChange={(e) => handleCustomButtonText(e.target.value)}
                                placeholder="T.P.S TRADING"
                            />
                        </div>
                        <div className="setting-item">
                            <label>Custom Button Link</label>
                            <input
                                type="text"
                                className="settings-input"
                                value={customButtonLink}
                                onChange={(e) => handleCustomButtonLink(e.target.value)}
                                placeholder="http://localhost:3000/"
                            />
                        </div>
                        <div className="setting-item checkbox-setting">
                            <label>Show Custom Button</label>
                            <input
                                type="checkbox"
                                checked={showCustomButton}
                                onChange={handleShowCustomButtonToggle}
                            />
                        </div>
                    </div>


                    {isKanban && (
                        <div className="settings-modal-column">
                            <h4>Kanban Board</h4>
                            <div className="setting-item">
                                <label>Font Size</label>
                                <CustomDropdown
                                    options={['tiny', 'small', 'medium', 'large']}
                                    value={todoBoardFontSize}
                                    onChange={handleTodoBoardFontSize}
                                    displayTransform={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
                                />
                            </div>
                            <div className="setting-item">
                                <label>Column Width</label>
                                <CustomDropdown
                                    options={['verywide', 'wide', 'default', 'thin']}
                                    value={todoBoardColumnWidth}
                                    onChange={handleTodoBoardColumnWidth}
                                    displayTransform={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
                                />
                            </div>
                            <div className="setting-item">
                                <label>Minimized Notes</label>
                                <CustomDropdown
                                    options={['none', '1', '3', '5']}
                                    value={todoBoardMinLines}
                                    onChange={handleTodoBoardMinLines}
                                    displayTransform={(v) => v === 'none' ? 'None' : `${v} Lines`}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function CustomDropdown({ options, value, onChange, displayTransform }) {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="custom-dropdown-container">
            <div className="custom-dropdown-selected" onClick={() => setIsOpen(!isOpen)}>
                {displayTransform ? displayTransform(value) : value}
                <span className={`arrow ${isOpen ? 'up' : 'down'}`}>▾</span>
            </div>
            {isOpen && (
                <div className="custom-dropdown-list">
                    {options.map(opt => (
                        <div
                            key={opt}
                            className={`custom-dropdown-opt ${opt === value ? 'active' : ''}`}
                            onClick={() => {
                                onChange(opt);
                                setIsOpen(false);
                            }}
                        >
                            {displayTransform ? displayTransform(opt) : opt}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default Header;
