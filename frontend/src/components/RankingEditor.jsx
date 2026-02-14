import { useState, useEffect, useRef } from 'react';
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
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './RankingEditor.css';

const DEFAULT_DATA = { entries: [], viewMode: 'all' };

function parseContent(content) {
    if (!content || !content.trim()) return DEFAULT_DATA;
    try {
        const parsed = JSON.parse(content);
        const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
        return {
            viewMode: parsed.viewMode === 'one' ? 'one' : 'all',
            entries: entries.map((e) => ({
                label: typeof e.label === 'string' ? e.label : String(e?.label ?? ''),
                score: typeof e.score === 'number' && Number.isInteger(e.score) && e.score >= 0 && e.score <= 100 ? e.score : null,
                notes: typeof e.notes === 'string' ? e.notes : '',
                image: typeof e.image === 'string' ? e.image : '',
                excluded: !!e.excluded,
            })),
        };
    } catch {
        return DEFAULT_DATA;
    }
}

function sortEntries(entries) {
    return [...entries].sort((a, b) => {
        const sa = a.score ?? -1;
        const sb = b.score ?? -1;
        return sb - sa;
    });
}

/** Set score of the moved entry only, to sit between its new neighbors */
function scoreForMovedEntry(newOrder, movedIndex) {
    const above = newOrder[movedIndex - 1]?.score ?? 100;
    const below = newOrder[movedIndex + 1]?.score ?? 0;
    const score = Math.round((above + below) / 2);
    return Math.min(100, Math.max(0, score));
}

function RankingEditor({ content, onChange }) {
    const [data, setData] = useState(() => parseContent(content));
    const [showModal, setShowModal] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [oneAtIndex, setOneAtIndex] = useState(0);
    const notesRefs = useRef({});
    const oneNotesRef = useRef(null);
    const lastNotesRef = useRef({});

    // Modal: display order - only re-sort when score input blurs, or after drag
    const [modalOrder, setModalOrder] = useState([]);

    useEffect(() => {
        const parsed = parseContent(content);
        setData(parsed);
    }, [content]);

    const visibleEntries = data.entries.filter((e) => !e.excluded);
    const sortedEntries = sortEntries(visibleEntries);
    const currentEntry = data.viewMode === 'one' && sortedEntries.length > 0 ? sortedEntries[oneAtIndex] : null;

    const emitChange = (newData) => {
        setData(newData);
        onChange(JSON.stringify(newData));
    };

    // Sync notes div innerHTML only when not focused (fix cursor jumping)
    useEffect(() => {
        sortedEntries.forEach((entry, index) => {
            const el = notesRefs.current[index];
            if (!el) return;
            if (document.activeElement === el) return;
            const want = entry.notes || '';
            el.innerHTML = want;
            lastNotesRef.current[index] = want;
        });
    }, [data.entries, sortedEntries.length]);

    // One-at-a-time: sync single notes div when entry changes; clamp index when visible list shrinks
    useEffect(() => {
        const visible = data.entries.filter((e) => !e.excluded);
        if (data.viewMode !== 'one' || visible.length === 0) return;
        const sorted = sortEntries(visible);
        const entry = sorted[oneAtIndex];
        if (!entry) return;
        const el = oneNotesRef.current;
        if (!el) return;
        if (document.activeElement === el) return;
        el.innerHTML = entry.notes || '';
    }, [data.viewMode, oneAtIndex, sortedEntries.length]);

    const handleNotesChange = (index, html) => {
        const entry = sortedEntries[index];
        if (!entry) return;
        lastNotesRef.current[index] = html;
        const newEntries = data.entries.map((e) =>
            e.label === entry.label ? { ...e, notes: html } : e
        );
        emitChange({ ...data, entries: newEntries });
    };

    const handleNotesBlur = (index) => {
        const el = notesRefs.current[index];
        if (el) {
            const html = el.innerHTML;
            handleNotesChange(index, html);
        }
    };

    // --- Modal: update entries from pasted text
    const handleUpdateFromPaste = () => {
        const lines = pasteText
            .split(/\n/)
            .map((s) => s.trim())
            .filter(Boolean);
        const byLabel = new Map(data.entries.map((e) => [e.label, e]));
        const newEntries = lines.map((label) => {
            const existing = byLabel.get(label);
            if (existing) return { ...existing, image: existing.image ?? '', excluded: existing.excluded };
            return { label, score: null, notes: '', image: '', excluded: false };
        });
        setData((prev) => ({ ...prev, entries: newEntries }));
        setModalOrder(newEntries);
        setPasteText('');
    };

    const handleModalScoreChange = (label, value) => {
        const num = value === '' || value === null ? null : Math.min(100, Math.max(0, Math.floor(Number(value))));
        const newEntries = data.entries.map((e) =>
            e.label === label ? { ...e, score: num } : e
        );
        setData((prev) => ({ ...prev, entries: newEntries }));
    };


    const handleModalImageChange = (label, dataUrl) => {
        const newEntries = data.entries.map((e) =>
            e.label === label ? { ...e, image: dataUrl || '' } : e
        );
        setData((prev) => ({ ...prev, entries: newEntries }));
        setModalOrder((prev) => prev.map((e) => (e.label === label ? { ...e, image: dataUrl || '' } : e)));
    };

    const handleModalDragEnd = (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = parseInt(String(active.id).replace('row-', ''), 10);
        const newIndex = parseInt(String(over.id).replace('row-', ''), 10);
        if (Number.isNaN(oldIndex) || Number.isNaN(newIndex)) return;
        const newOrder = arrayMove(modalOrder, oldIndex, newIndex);
        const movedEntry = newOrder[newIndex];
        const newScore = scoreForMovedEntry(newOrder, newIndex);
        const newOrderWithScore = newOrder.map((e, i) =>
            i === newIndex ? { ...e, score: newScore } : e
        );
        setModalOrder(newOrderWithScore);
        setData((prev) => ({
            ...prev,
            entries: prev.entries.map((e) =>
                e.label === movedEntry.label ? { ...e, score: newScore } : e
            ),
        }));
    };

    const handleModalSave = () => {
        onChange(JSON.stringify(data));
        setShowModal(false);
    };

    const openModal = () => {
        setModalOrder(sortEntries([...data.entries]));
        setShowModal(true);
    };

    const handleToggleExcluded = (label) => {
        const newEntries = data.entries.map((e) =>
            e.label === label ? { ...e, excluded: !e.excluded } : e
        );
        setData((prev) => ({ ...prev, entries: newEntries }));
        setModalOrder((prev) => prev.map((e) => (e.label === label ? { ...e, excluded: !e.excluded } : e)));
    };

    const handleDeleteEntry = (label) => {
        setData((prev) => ({ ...prev, entries: prev.entries.filter((e) => e.label !== label) }));
        setModalOrder((prev) => prev.filter((e) => e.label !== label));
    };

    const setViewMode = (mode) => {
        emitChange({ ...data, viewMode: mode });
        if (mode === 'one' && sortedEntries.length > 0) setOneAtIndex(0);
    };

    // Clamp oneAtIndex when visible list shrinks (e.g. after excluding)
    useEffect(() => {
        if (data.viewMode === 'one' && sortedEntries.length > 0 && oneAtIndex >= sortedEntries.length) {
            setOneAtIndex(Math.max(0, sortedEntries.length - 1));
        }
    }, [data.viewMode, sortedEntries.length, oneAtIndex]);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const canPrev = data.viewMode === 'one' && sortedEntries.length > 0 && oneAtIndex > 0;
    const canNext = data.viewMode === 'one' && sortedEntries.length > 0 && oneAtIndex < sortedEntries.length - 1;

    return (
        <div className="ranking-editor">
            <div className="ranking-editor-header">
                <button type="button" className="ranking-settings-cog" onClick={openModal} title="Ranking settings">
                    ⚙
                </button>
            </div>

            {data.viewMode === 'one' ? (
                <div className="ranking-one-at-a-time">
                    {currentEntry ? (
                        <>
                            <div className="ranking-one-nav">
                                <button
                                    type="button"
                                    className="ranking-arrow"
                                    disabled={!canPrev}
                                    onClick={() => setOneAtIndex((i) => Math.max(0, i - 1))}
                                    aria-label="Previous"
                                >
                                    ‹
                                </button>
                                <span className="ranking-one-counter">
                                    {oneAtIndex + 1} / {sortedEntries.length}
                                </span>
                                <button
                                    type="button"
                                    className="ranking-arrow"
                                    disabled={!canNext}
                                    onClick={() => setOneAtIndex((i) => Math.min(sortedEntries.length - 1, i + 1))}
                                    aria-label="Next"
                                >
                                    ›
                                </button>
                            </div>
                            {currentEntry.image && (
                                <div className="ranking-one-image-wrap">
                                    <img src={currentEntry.image} alt="" className="ranking-one-image" />
                                </div>
                            )}
                            <div className="ranking-item-head">
                                <span className="ranking-item-label">{currentEntry.label}</span>
                                {currentEntry.score !== null && (
                                    <span className="ranking-item-score">{currentEntry.score}/100</span>
                                )}
                            </div>
                            <div
                                ref={oneNotesRef}
                                className="ranking-item-notes"
                                contentEditable
                                suppressContentEditableWarning
                                onInput={(e) => handleNotesChange(oneAtIndex, e.currentTarget.innerHTML)}
                                onBlur={() => handleNotesBlur(oneAtIndex)}
                                data-placeholder="Notes, bullet points…"
                            />
                        </>
                    ) : (
                        <div className="ranking-empty">No entries. Open settings (⚙) to add entries.</div>
                    )}
                </div>
            ) : (
                <div className="ranking-list">
                    {sortedEntries.length === 0 ? (
                        <div className="ranking-empty">No entries. Open settings (⚙) to add entries.</div>
                    ) : (
                        sortedEntries.map((entry, index) => (
                            <div key={`${entry.label}-${index}`} className="ranking-item">
                                {entry.image && (
                                    <div className="ranking-item-image-wrap">
                                        <img src={entry.image} alt="" className="ranking-item-image" />
                                    </div>
                                )}
                                <div className="ranking-item-head">
                                    <span className="ranking-item-label">{entry.label}</span>
                                    {entry.score !== null && (
                                        <span className="ranking-item-score">{entry.score}/100</span>
                                    )}
                                </div>
                                <div
                                    ref={(r) => { notesRefs.current[index] = r; }}
                                    className="ranking-item-notes"
                                    contentEditable
                                    suppressContentEditableWarning
                                    onInput={(e) => handleNotesChange(index, e.currentTarget.innerHTML)}
                                    onBlur={() => handleNotesBlur(index)}
                                    data-placeholder="Notes, bullet points…"
                                />
                            </div>
                        ))
                    )}
                </div>
            )}

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal ranking-modal" onClick={(e) => e.stopPropagation()}>
                        <h3>Ranking settings</h3>
                        <div className="ranking-modal-view-mode">
                            <label>Display:</label>
                            <label className="ranking-radio">
                                <input
                                    type="radio"
                                    name="viewMode"
                                    checked={data.viewMode === 'all'}
                                    onChange={() => setViewMode('all')}
                                />
                                All entries
                            </label>
                            <label className="ranking-radio">
                                <input
                                    type="radio"
                                    name="viewMode"
                                    checked={data.viewMode === 'one'}
                                    onChange={() => setViewMode('one')}
                                />
                                One at a time
                            </label>
                        </div>
                        <div className="form-group">
                            <label>Paste entries (one per line)</label>
                            <textarea
                                className="ranking-paste-textarea"
                                value={pasteText}
                                onChange={(e) => setPasteText(e.target.value)}
                                placeholder="Entry one&#10;Entry two&#10;Entry three"
                                rows={3}
                            />
                            <button type="button" className="btn-secondary btn-sm" onClick={handleUpdateFromPaste}>
                                Update entries from text
                            </button>
                        </div>
                        <div className="ranking-modal-list">
                            <label>Entries: drag to reorder (score of moved entry is set between neighbors). Edit score 0–100 manually. Toggle to exclude from list.</label>
                            {modalOrder.length === 0 ? (
                                <p className="ranking-modal-empty">Add entries using the text area above.</p>
                            ) : (
                                <DndContext
                                    sensors={sensors}
                                    collisionDetection={closestCenter}
                                    onDragEnd={handleModalDragEnd}
                                >
                                    <SortableContext
                                        items={modalOrder.map((_, i) => 'row-' + i)}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        <ul className="ranking-modal-entries">
                                            {modalOrder.map((entry, i) => (
                                                <SortableModalRow
                                                    key={'row-' + i}
                                                    entry={entry}
                                                    index={i}
                                                    onScoreChange={handleModalScoreChange}
                                                    onImageChange={handleModalImageChange}
                                                    onToggleExcluded={handleToggleExcluded}
                                                    onDelete={handleDeleteEntry}
                                                />
                                            ))}
                                        </ul>
                                    </SortableContext>
                                </DndContext>
                            )}
                        </div>
                        <div className="modal-actions">
                            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                                Cancel
                            </button>
                            <button type="button" className="btn-primary" onClick={handleModalSave}>
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SortableModalRow({ entry, index, onScoreChange, onImageChange, onToggleExcluded, onDelete }) {
    const id = 'row-' + index;
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const handleFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => onImageChange(entry.label, reader.result);
        reader.readAsDataURL(file);
    };

    return (
        <li
            ref={setNodeRef}
            style={style}
            className={`ranking-modal-row ${isDragging ? 'ranking-modal-row-dragging' : ''}`}
        >
            <span className="ranking-modal-drag-handle" {...attributes} {...listeners} title="Drag to reorder">
                ⋮⋮
            </span>
            <div className="ranking-modal-row-image">
                {entry.image ? (
                    <div className="ranking-modal-thumb-wrap">
                        <img src={entry.image} alt="" />
                        <button
                            type="button"
                            className="ranking-modal-remove-image"
                            onClick={() => onImageChange(entry.label, '')}
                            title="Remove image"
                        >
                            ×
                        </button>
                    </div>
                ) : (
                    <label className="ranking-modal-add-image">
                        <input type="file" accept="image/*" onChange={handleFile} />
                        + img
                    </label>
                )}
            </div>
            <span className={`ranking-modal-label ${entry.excluded ? 'ranking-modal-label-excluded' : ''}`}>{entry.label}</span>
            <label className="ranking-modal-exclude" title={entry.excluded ? 'Include in list' : 'Exclude from list'}>
                <input
                    type="checkbox"
                    checked={!!entry.excluded}
                    onChange={() => onToggleExcluded(entry.label)}
                />
                <span>Hide</span>
            </label>
            <input
                type="number"
                min={0}
                max={100}
                step={1}
                className="ranking-modal-score"
                value={entry.score ?? ''}
                onChange={(e) => onScoreChange(entry.label, e.target.value === '' ? null : e.target.value)}
                placeholder="—"
            />
            <span className="ranking-modal-out-of">/100</span>
            <button
                type="button"
                className="ranking-modal-delete-entry"
                onClick={() => onDelete(entry.label)}
                title="Delete entry"
                aria-label="Delete entry"
            >
                ×
            </button>
        </li>
    );
}

export default RankingEditor;
