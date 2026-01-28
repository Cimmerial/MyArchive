import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import './LinkContextMenu.css';

function LinkContextMenu({ projectId, searchText, position, allPages, onClose, onSelectPage, onCreateNew, isLink, onUnlink }) {
    const [suggestions, setSuggestions] = useState([]);
    const [menuPosition, setMenuPosition] = useState(position);
    const menuRef = React.useRef(null);

    // Adjust position to fit on screen
    useEffect(() => {
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;

            let newY = position.y;
            let newX = position.x;

            // Check bottom edge
            if (rect.bottom > viewportHeight) {
                newY = position.y - rect.height;
                // If flipping up puts it off top, just pin to bottom
                if (newY < 0) newY = viewportHeight - rect.height - 10;
            }

            // Check right edge
            if (rect.right > viewportWidth) {
                newX = viewportWidth - rect.width - 10;
            }

            setMenuPosition({ x: newX, y: newY });
        }
    }, [position, suggestions]); // Re-run when suggestions load as height changes

    useEffect(() => {
        const fetchSuggestions = async () => {
            try {
                const response = await axios.post(`/api/projects/${projectId}/suggest-links`, {
                    text: searchText,
                    currentPageId: null
                });
                setSuggestions(response.data);
            } catch (error) {
                console.error('Failed to fetch suggestions:', error);
            }
        };

        fetchSuggestions();
    }, [searchText, projectId]);

    useEffect(() => {
        const handleClickOutside = () => onClose();
        setTimeout(() => {
            document.addEventListener('click', handleClickOutside);
        }, 0);

        return () => document.removeEventListener('click', handleClickOutside);
    }, [onClose]);

    return (
        <div
            ref={menuRef}
            className="link-context-menu"
            style={{ top: menuPosition.y, left: menuPosition.x, position: 'fixed', visibility: menuRef.current ? 'visible' : 'hidden' }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="context-menu-header">
                Link "{searchText}" to:
            </div>

            {suggestions.length > 0 ? (
                <div className="context-menu-suggestions">
                    {suggestions.map(page => (
                        <div
                            key={page.id}
                            className="context-menu-item"
                            onClick={() => onSelectPage(page)}
                        >
                            <div className="context-menu-item-title">{page.title}</div>
                            <div className="context-menu-item-path text-muted">{page.path}</div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="context-menu-empty text-muted">
                    No matching pages found
                </div>
            )}

            {isLink && (
                <div className="context-menu-footer" style={{ borderBottom: '1px solid var(--color-border)', marginBottom: '0.5rem', paddingBottom: '0.5rem' }}>
                    <button className="btn-secondary" style={{ width: '100%', color: '#ff4d4f' }} onClick={onUnlink}>
                        Unlink
                    </button>
                </div>
            )}

            <div className="context-menu-footer">
                <button className="btn-secondary" onClick={onCreateNew}>
                    Create New Page
                </button>
            </div>
        </div>
    );
}

export default LinkContextMenu;
