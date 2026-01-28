import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import axios from 'axios';
import LinkContextMenu from './LinkContextMenu';
import DeleteConfirmModal from './DeleteConfirmModal';
import './Cell.css';

function Cell({ cell, projectId, pageId, allPages, onUpdate, onDelete, onCreatePage, autoFocus }) {
    const [content, setContent] = useState(cell.content);
    const [type, setType] = useState(cell.type);
    const [showContextMenu, setShowContextMenu] = useState(false);
    const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
    const [selectedText, setSelectedText] = useState('');
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showCreatePageModal, setShowCreatePageModal] = useState(false);
    const [newPageParent, setNewPageParent] = useState(null);
    const [savedRange, setSavedRange] = useState(null);
    const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
    const [isTypeMenuOpen, setIsTypeMenuOpen] = useState(false);
    const contentRef = useRef(null);
    const navigate = useNavigate();

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: cell.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    // Auto-focus logic
    useEffect(() => {
        if (autoFocus && contentRef.current) {
            contentRef.current.focus();
            // Optional: place cursor at end if there's content (though new cells are usually empty)
            try {
                const range = document.createRange();
                const selection = window.getSelection();
                range.selectNodeContents(contentRef.current);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            } catch (e) {
                // Ignore
            }
        }
    }, [autoFocus]);

    useEffect(() => {
        // Only update if prop content is different from both our state and the actual DOM
        // This prevents reverting to old content after a save
        if (cell.content !== content && cell.content !== contentRef.current?.innerHTML) {
            setContent(cell.content);
        }
        setType(cell.type);
    }, [cell.content, cell.type]);

    const handleBlur = () => {
        // Don't save if context menu is open to prevent clearing content
        if (isContextMenuOpen) {
            return;
        }

        const newContent = contentRef.current.innerHTML;
        if (newContent !== content) {
            setContent(newContent);
            onUpdate(cell.id, { content: newContent });
        }
    };

    const handleTypeChange = (newType) => {
        setType(newType);
        onUpdate(cell.id, { type: newType });
    };

    const handleKeyDown = (e) => {
        // Ctrl+B for bold
        if (e.ctrlKey && e.key === 'b') {
            e.preventDefault();
            document.execCommand('bold');
        }
        // Ctrl+I for italic
        if (e.ctrlKey && e.key === 'i') {
            e.preventDefault();
            document.execCommand('italic');
        }
    };

    const toCamelCase = (str) => {
        return str
            .split(' ')
            .map((word, index) => {
                if (index === 0) {
                    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                }
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            })
            .join(' ');
    };

    const handleInput = () => {
        // Auto-link ALL CAPS words and phrases
        const html = contentRef.current.innerHTML;
        // Match one or more consecutive ALL CAPS words (e.g., "BLACK HOLES")
        const allCapsPattern = /\b([A-Z][A-Z\s]+[A-Z])\b/g;

        let newHtml = html;
        const matches = [...html.matchAll(allCapsPattern)];

        // Store cursor position before making changes
        const selection = window.getSelection();
        let cursorOffset = 0;
        let cursorNode = null;

        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            cursorNode = range.startContainer;
            cursorOffset = range.startOffset;
        }

        for (const match of matches) {
            const phrase = match[1].trim();
            const matchingPage = allPages.find(p =>
                p.title.toUpperCase() === phrase && p.id !== pageId
            );

            if (matchingPage) {
                const camelCaseTitle = toCamelCase(phrase);
                const linkHtml = `<a href="#" class="wiki-link" data-page-id="${matchingPage.id}">${camelCaseTitle}</a>`;
                // Use a more specific regex to avoid replacing partial matches
                const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                newHtml = newHtml.replace(new RegExp(`\\b${escapedPhrase}\\b`, 'g'), linkHtml);
            }
        }

        if (newHtml !== html) {
            contentRef.current.innerHTML = newHtml;

            // Restore cursor position at the end of the content
            try {
                const newRange = document.createRange();
                const newSelection = window.getSelection();

                // Find the last text node or use the contentRef itself
                const walker = document.createTreeWalker(
                    contentRef.current,
                    NodeFilter.SHOW_TEXT,
                    null,
                    false
                );

                let lastTextNode = null;
                while (walker.nextNode()) {
                    lastTextNode = walker.currentNode;
                }

                if (lastTextNode) {
                    newRange.setStart(lastTextNode, lastTextNode.length);
                    newRange.collapse(true);
                } else {
                    newRange.selectNodeContents(contentRef.current);
                    newRange.collapse(false);
                }

                newSelection.removeAllRanges();
                newSelection.addRange(newRange);
            } catch (e) {
                // Ignore cursor restoration errors
            }
        }
    };

    const handleClick = (e) => {
        if (e.target.classList.contains('wiki-link')) {
            e.preventDefault();
            const pageId = e.target.getAttribute('data-page-id');
            if (pageId) {
                navigate(`/project/${projectId}/page/${pageId}`);
            }
        }
    };

    const restoreCursorToEnd = () => {
        try {
            const newRange = document.createRange();
            const newSelection = window.getSelection();
            newRange.selectNodeContents(contentRef.current);
            newRange.collapse(false); // Collapse to end
            newSelection.removeAllRanges();
            newSelection.addRange(newRange);
        } catch (e) {
            console.error('Failed to restore cursor:', e);
        }
    };

    const handleContextMenu = (e) => {
        e.preventDefault();
        const selection = window.getSelection();
        const text = selection.toString().trim();

        if (text && selection.rangeCount > 0) {
            try {
                // MARKER STRATEGY: Wrap selection in a temporary span
                const range = selection.getRangeAt(0);
                const marker = document.createElement('span');
                marker.className = 'temp-link-marker';
                marker.textContent = text;

                // Use delete + insert to safely replace content
                range.deleteContents();
                range.insertNode(marker);

                // Update local content state to include the marker (persists across re-renders)
                // We do NOT call onUpdate yet to avoid saving temporary marker to DB
                setContent(contentRef.current.innerHTML);

                setSelectedText(text);
                setContextMenuPos({ x: e.clientX, y: e.clientY });
                setIsContextMenuOpen(true);
                setShowContextMenu(true);
            } catch (error) {
                console.error('Failed to create selection marker:', error);
                // Fallback to simple selection if complex wrapping fails?
                // For now, just don't open menu to avoid breaking things
            }
        }
    };

    const cleanupMarker = (html) => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        const markers = tempDiv.getElementsByClassName('temp-link-marker');
        while (markers.length > 0) {
            const marker = markers[0];
            const parent = marker.parentNode;
            while (marker.firstChild) {
                parent.insertBefore(marker.firstChild, marker);
            }
            parent.removeChild(marker);
        }
        return tempDiv.innerHTML;
    };

    const handleLinkSelect = (page) => {
        // Find the marker in the current content
        const currentHtml = contentRef.current.innerHTML;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = currentHtml;

        const marker = tempDiv.querySelector('.temp-link-marker');
        if (marker) {
            const link = document.createElement('a');
            link.href = '#';
            link.className = 'wiki-link';
            link.setAttribute('data-page-id', page.id);
            link.textContent = selectedText; // Use the original selected text

            marker.replaceWith(link);

            const newHtml = tempDiv.innerHTML;
            setContent(newHtml);
            onUpdate(cell.id, { content: newHtml });
        } else {
            console.error('Link marker lost');
            // Fallback: cleanup
            const cleanHtml = cleanupMarker(currentHtml);
            setContent(cleanHtml);
        }

        setShowContextMenu(false);
        setIsContextMenuOpen(false);
        // Ensure DOM update finishes before moving cursor
        setTimeout(restoreCursorToEnd, 0);
    };

    const handleCreateNewPage = () => {
        setShowContextMenu(false);
        setShowCreatePageModal(true);
    };

    const handleConfirmCreatePage = async (e) => {
        e.preventDefault();

        try {
            const newPage = await onCreatePage(selectedText, newPageParent);

            const currentHtml = contentRef.current.innerHTML;
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = currentHtml;

            const marker = tempDiv.querySelector('.temp-link-marker');
            if (marker) {
                const link = document.createElement('a');
                link.href = '#';
                link.className = 'wiki-link';
                link.setAttribute('data-page-id', newPage.id);
                link.textContent = selectedText;

                marker.replaceWith(link);

                const newHtml = tempDiv.innerHTML;
                setContent(newHtml);
                onUpdate(cell.id, { content: newHtml });
            } else {
                // Fallback
                const cleanHtml = cleanupMarker(currentHtml);
                setContent(cleanHtml);
            }

            // Reset state
            setShowCreatePageModal(false);
            setNewPageParent(null);
            setIsContextMenuOpen(false);
            setTimeout(restoreCursorToEnd, 0);
        } catch (error) {
            console.error('Failed to create page and link:', error);
            alert('Failed to create page');
            // Cleanup marker on failure
            const cleanHtml = cleanupMarker(contentRef.current.innerHTML);
            setContent(cleanHtml);
            setIsContextMenuOpen(false);
        }
    };

    const getClassName = () => {
        switch (type) {
            case 'header':
                return 'cell-header';
            case 'subheader':
                return 'cell-subheader';
            default:
                return 'cell-text';
        }
    };

    return (
        <>
            <div ref={setNodeRef} style={style} className="cell-container">
                <div className="cell-content-wrapper">
                    <div
                        ref={contentRef}
                        className={`cell-content ${getClassName()}`}
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={handleBlur}
                        onKeyDown={handleKeyDown}
                        onInput={handleInput}
                        onClick={handleClick}
                        onContextMenu={handleContextMenu}
                        dangerouslySetInnerHTML={{ __html: content }}
                    />
                </div>

                <div className="cell-controls-right">
                    <div className="cell-type-dropdown" onClick={(e) => {
                        e.stopPropagation();
                    }}>
                        <div
                            className="cell-type-trigger"
                            onClick={() => setIsTypeMenuOpen(!isTypeMenuOpen)}
                            title="Change type"
                        >
                            {type === 'header' ? 'H1' : type === 'subheader' ? 'H2' : 'T'}
                        </div>

                        {isTypeMenuOpen && (
                            <div className="cell-type-menu">
                                <div
                                    className="cell-type-option"
                                    onClick={() => { handleTypeChange('text'); setIsTypeMenuOpen(false); }}
                                >
                                    Text
                                </div>
                                <div
                                    className="cell-type-option"
                                    onClick={() => { handleTypeChange('header'); setIsTypeMenuOpen(false); }}
                                >
                                    Header
                                </div>
                                <div
                                    className="cell-type-option"
                                    onClick={() => { handleTypeChange('subheader'); setIsTypeMenuOpen(false); }}
                                >
                                    Subheader
                                </div>
                            </div>
                        )}
                    </div>

                    <div
                        className="cell-drag-handle"
                        {...attributes}
                        {...listeners}
                        title="Drag to move"
                    >
                        ⋮⋮
                    </div>

                    <button
                        className="cell-delete-btn"
                        onClick={() => setShowDeleteModal(true)}
                        title="Delete cell"
                    >
                        ×
                    </button>
                </div>
            </div>

            {showContextMenu && (
                <LinkContextMenu
                    projectId={projectId}
                    searchText={selectedText}
                    position={contextMenuPos}
                    allPages={allPages}
                    onClose={() => {
                        setShowContextMenu(false);
                        setIsContextMenuOpen(false);
                        setIsTypeMenuOpen(false);
                        // Cleanup marker if menu is closed without action
                        if (contentRef.current) {
                            const cleanHtml = cleanupMarker(contentRef.current.innerHTML);
                            if (cleanHtml !== content) {
                                setContent(cleanHtml);
                                // No onUpdate needed as we just reverted visual state
                            }
                        }
                    }}
                    onSelectPage={handleLinkSelect}
                    onCreateNew={handleCreateNewPage}
                />
            )}

            {showDeleteModal && (
                <DeleteConfirmModal
                    itemType="cell"
                    itemName={`${type} cell`}
                    onConfirm={() => {
                        onDelete(cell.id);
                        setShowDeleteModal(false);
                    }}
                    onCancel={() => setShowDeleteModal(false)}
                />
            )}

            {showCreatePageModal && (
                <div className="modal-overlay" onClick={() => {
                    setShowCreatePageModal(false);
                    setIsContextMenuOpen(false);
                }}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h3>Create page "{selectedText}"</h3>
                        <form onSubmit={handleConfirmCreatePage}>
                            <div className="form-group">
                                <label>Parent Page (optional)</label>
                                <select
                                    value={newPageParent || ''}
                                    onChange={(e) => setNewPageParent(e.target.value ? parseInt(e.target.value) : null)}
                                >
                                    <option value="">Root Level</option>
                                    {allPages.filter(p => p.id !== pageId).map(page => (
                                        <option key={page.id} value={page.id}>
                                            {page.path}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => {
                                    setShowCreatePageModal(false);
                                    setIsContextMenuOpen(false);
                                }}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-primary">
                                    Create & Link
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}

export default Cell;
