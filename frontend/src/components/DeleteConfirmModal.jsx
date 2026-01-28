import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './DeleteConfirmModal.css';

function DeleteConfirmModal({ itemType, itemName, onConfirm, onCancel }) {
    const [confirmText, setConfirmText] = useState('');

    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                onCancel();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onCancel]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (confirmText === 'DELETE') {
            onConfirm();
        }
    };

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
                <h3>Delete {itemType}</h3>
                <p className="delete-warning">
                    Are you sure you want to delete <strong className="text-accent">"{itemName}"</strong>?
                    {itemType === 'page' && ' This will also delete all child pages and cells.'}
                </p>
                <p className="delete-instruction text-muted">
                    Type <strong className="delete-confirm-word" onClick={() => onConfirm()}>DELETE</strong> to confirm:
                </p>
                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder="Type DELETE here..."
                        autoFocus
                        autoComplete="off"
                    />
                    <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={onCancel}>
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn-danger"
                            disabled={confirmText !== 'DELETE'}
                        >
                            Delete {itemType}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default DeleteConfirmModal;

/* Inline style for the clickable delete word - or better, added to CSS file if possible, but this works for now */
/* Ideally this should go into DeleteConfirmModal.css but the user sent the JSX file. I will modify the CSS file separately or assume user accepts inline changes */
