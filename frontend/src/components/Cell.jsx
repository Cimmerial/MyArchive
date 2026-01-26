import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import axios from 'axios';
import LinkContextMenu from './LinkContextMenu';
import DeleteConfirmModal from './DeleteConfirmModal';
import './Cell.css';

function Cell({ cell, projectId, pageId, allPages, onUpdate, onDelete, onCreatePage }) {
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

    const handleContextMenu = (e) => {
        e.preventDefault();

        const selection = window.getSelection();
        const text = selection.toString().trim();

        if (text) {
            // Save content before opening context menu
            const currentContent = contentRef.current.innerHTML;
            if (currentContent !== content) {
                setContent(currentContent);
                onUpdate(cell.id, { content: currentContent });
            }

            setIsContextMenuOpen(true);
            setSelectedText(text);
            setContextMenuPos({ x: e.clientX, y: e.clientY });
            setShowContextMenu(true);
        }
    };

    const handleLinkSelect = (page) => {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const linkHtml = `<a href="#" class="wiki-link" data-page-id="${page.id}">${selectedText}</a>`;

            range.deleteContents();
            const temp = document.createElement('div');
            temp.innerHTML = linkHtml;
            range.insertNode(temp.firstChild);

            handleBlur();
        }
        setShowContextMenu(false);
        setIsContextMenuOpen(false);
    };

    const handleCreateNewPage = () => {
        // Save the current selection range
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            setSavedRange(selection.getRangeAt(0).cloneRange());
        }

        setShowContextMenu(false);
        setShowCreatePageModal(true);
    };

    const handleConfirmCreatePage = async (e) => {
        e.preventDefault();

        try {
            const newPage = await onCreatePage(selectedText, newPageParent);

            const currentHtml = contentRef.current.innerHTML;
            const linkHtml = `<a href="#" class="wiki-link" data-page-id="${newPage.id}">${selectedText}</a>`;

            const newHtml = currentHtml.replace(selectedText, linkHtml);
            contentRef.current.innerHTML = newHtml;

            // Update local state and parent immediately
            setContent(newHtml);
            onUpdate(cell.id, { content: newHtml });

            // Reset state
            setShowCreatePageModal(false);
            setNewPageParent(null);
            setSavedRange(null);
            setIsContextMenuOpen(false);
        } catch (error) {
            console.error('Failed to create page and link:', error);
            alert('Failed to create page');
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
                <div className="cell-drag-handle" {...attributes} {...listeners}>
                    ⋮⋮
                </div>

                <div className="cell-content-wrapper">
                    <select
                        className="cell-type-selector"
                        value={type}
                        onChange={(e) => handleTypeChange(e.target.value)}
                    >
                        <option value="text">Text</option>
                        <option value="header">Header</option>
                        <option value="subheader">Subheader</option>
                    </select>

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
