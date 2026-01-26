import { useEffect, useState } from 'react';
import axios from 'axios';
import './LinkContextMenu.css';

function LinkContextMenu({ projectId, searchText, position, allPages, onClose, onSelectPage, onCreateNew }) {
    const [suggestions, setSuggestions] = useState([]);

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
            className="link-context-menu"
            style={{ top: position.y, left: position.x }}
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

            <div className="context-menu-footer">
                <button className="btn-secondary" onClick={onCreateNew}>
                    Create New Page
                </button>
            </div>
        </div>
    );
}

export default LinkContextMenu;
