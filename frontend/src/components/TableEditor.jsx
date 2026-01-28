
import { useState, useEffect, useRef } from 'react';
import './TableEditor.css';

function TableEditor({ content, onChange, readOnly }) {
    const [data, setData] = useState({ title: '', headers: ['Column 1', 'Column 2'], rows: [['', '']], colWidths: [] });
    const [dragState, setDragState] = useState(null);
    const [isActive, setIsActive] = useState(false);
    const [deleteCandidate, setDeleteCandidate] = useState(null);

    useEffect(() => {
        if (content) {
            try {
                const parsed = JSON.parse(content);
                // Ensure basic structure exists
                const title = parsed.title || '';
                const headers = parsed.headers || ['Column 1'];
                const rows = parsed.rows || [['']];
                const colWidths = parsed.colWidths || new Array(headers.length).fill(null);

                setData({ title, headers, rows, colWidths });
            } catch (e) {
                if (content.trim()) {
                    setData({ title: '', headers: ['Column 1'], rows: [[content]], colWidths: [null] });
                }
            }
        }
    }, [content]);

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!dragState) return;

            const delta = e.clientX - dragState.startX;
            const index = dragState.index;

            const initialLeftWidth = dragState.initialColWidths[index];
            const initialRightWidth = dragState.initialColWidths[index + 1];

            // Constrain delta to prevent columns from collapsing below 50px
            let applyDelta = delta;

            // Prevent Left Column collapse
            if (initialLeftWidth + applyDelta < 50) {
                applyDelta = 50 - initialLeftWidth;
            }

            // Prevent Right Column collapse
            if (initialRightWidth - applyDelta < 50) {
                applyDelta = initialRightWidth - 50;
            }

            const newColWidths = [...dragState.initialColWidths];
            newColWidths[index] = initialLeftWidth + applyDelta;
            newColWidths[index + 1] = initialRightWidth - applyDelta;

            // Functional update prevents need for 'data' dependency
            setData(prev => ({ ...prev, colWidths: newColWidths }));
        };

        const handleMouseUp = () => {
            if (dragState) {
                // Determine final widths (re-calculate or read from state? State is async/closure... 
                // easier to just recalculate strictly from event? No event here.
                // We rely on the fact that handleMouseMove ran? 
                // Or better, we trigger a save on the LATEST data?
                // data might be stale in this closure?
                // Actually, if we remove 'data' dependency, 'data' IS STALE here.
                // So we can't use 'data' to call updateData.

                // Solution: access latest state via functional update? 
                // setState knows it. But updateData needs to call onChange(JSON).
                // We can't do that easily without data.

                // Alternative: Use a Ref to store `data` for the cleanup save?
                // const dataRef = useRef(data); 
                // useEffect(() => { dataRef.current = data }, [data]);

                // OR: Just trigger a flag 'isDragging' -> false.
                // And have another effect that listens to 'isDragging' change to false?

                // Simplest: just grab the widths from the DOM or re-calculate using the logic?
                // NO.

                // Let's use a Ref for data.
                setDragState(null);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                // Trigger save. 'updateData' needs 'data'. 
                // We can defer save? 
                // "updateData({ ...dataRef.current })" is the way.
            }
        };

        if (dragState) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [dragState]); // Removed 'data' dependency!

    // Ref to track latest data for save on mouseup
    const dataRef = useRef(data);
    useEffect(() => {
        dataRef.current = data;
    }, [data]);

    // We need to trigger save when drag ENDS. 
    // Effect above calls setDragState(null).
    // We can have an effect that watches dragState:
    const prevDragState = useRef(null);
    useEffect(() => {
        if (prevDragState.current && !dragState) {
            // Just finished dragging. Save.
            onChange(JSON.stringify(dataRef.current));
        }
        prevDragState.current = dragState;
    }, [dragState, onChange]);

    const updateData = (newData) => {
        setData(newData);
        onChange(JSON.stringify(newData));
    };

    const handleTitleChange = (value) => {
        updateData({ ...data, title: value });
    };

    const handleHeaderChange = (index, value) => {
        const newHeaders = [...data.headers];
        newHeaders[index] = value;
        updateData({ ...data, headers: newHeaders });
    };

    const handleCellChange = (rowIndex, colIndex, value) => {
        const newRows = [...data.rows];
        newRows[rowIndex] = [...newRows[rowIndex]];
        newRows[rowIndex][colIndex] = value;
        updateData({ ...data, rows: newRows });
    };

    const addColumn = () => {
        const newHeaders = [...data.headers, `Column ${data.headers.length + 1}`];
        const newRows = data.rows.map(row => [...row, '']);
        const newColWidths = [...(data.colWidths || new Array(data.headers.length).fill(null)), null];
        updateData({ headers: newHeaders, rows: newRows, colWidths: newColWidths });
    };

    const addRow = () => {
        const newRow = new Array(data.headers.length).fill('');
        updateData({ ...data, rows: [...data.rows, newRow] });
    };

    const removeColumn = (index) => {
        if (deleteCandidate && deleteCandidate.type === 'col' && deleteCandidate.index === index) {
            // Confirmed delete
            if (data.headers.length <= 1) return;
            const newHeaders = data.headers.filter((_, i) => i !== index);
            const newRows = data.rows.map(row => row.filter((_, i) => i !== index));
            const newColWidths = (data.colWidths || new Array(data.headers.length).fill(null)).filter((_, i) => i !== index);
            updateData({ headers: newHeaders, rows: newRows, colWidths: newColWidths });
            setDeleteCandidate(null);
        } else {
            // Initiate delete confirmation
            setDeleteCandidate({ type: 'col', index });
            // Should auto-cancel after some time? Maybe. Let's stick to click-away or re-click logic handled by UI feedback.
        }
    };

    const removeRow = (index) => {
        if (deleteCandidate && deleteCandidate.type === 'row' && deleteCandidate.index === index) {
            const newRows = data.rows.filter((_, i) => i !== index);
            updateData({ ...data, rows: newRows });
            setDeleteCandidate(null);
        } else {
            setDeleteCandidate({ type: 'row', index });
        }
    };

    return (
        <div
            className={`table-editor ${isActive ? 'active' : ''}`}
            onFocus={() => setIsActive(true)}
            onBlur={(e) => {
                // Check if new focus is still within the table editor
                if (!e.currentTarget.contains(e.relatedTarget)) {
                    setIsActive(false);
                    setDeleteCandidate(null);
                }
            }}
        >
            <input
                type="text"
                className="table-title-input"
                placeholder="Table Title (Optional)"
                value={data.title || ''}
                onChange={(e) => handleTitleChange(e.target.value)}
                readOnly={readOnly}
            />
            <div className="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            {data.headers.map((header, index) => {
                                const width = (data.colWidths && data.colWidths[index]) || 'auto';
                                const isDeleteCandidate = deleteCandidate?.type === 'col' && deleteCandidate.index === index;
                                return (
                                    <th
                                        key={index}
                                        style={{ width: width === 'auto' ? undefined : width, minWidth: width === 'auto' ? undefined : width }}
                                        className={isDeleteCandidate ? 'delete-candidate' : ''}
                                    >
                                        <div className="th-content">
                                            <input
                                                type="text"
                                                value={header}
                                                onChange={(e) => handleHeaderChange(index, e.target.value)}
                                                readOnly={readOnly}
                                                className="header-input"
                                            />
                                            {!readOnly && isActive && (
                                                <>
                                                    <button
                                                        className={`remove-col-btn ${isDeleteCandidate ? 'confirm-delete' : ''}`}
                                                        onClick={() => removeColumn(index)}
                                                        title={isDeleteCandidate ? "Confirm Delete" : "Remove Column"}
                                                        tabIndex={-1}
                                                    >
                                                        ×
                                                    </button>
                                                    <div
                                                        className="col-resizer"
                                                        onMouseDown={(e) => {
                                                            const th = e.target.closest('th');
                                                            // We cannot resize if there is no next neighbor (or if next is the add-col button)
                                                            // Index is current column index. 
                                                            // Check if we are the last DATA column.
                                                            if (index >= data.headers.length - 1) return;

                                                            // Capture ALL current widths from DOM to ensure smooth transition to fixed layout
                                                            const table = th.closest('table');
                                                            const headerCells = Array.from(table.querySelectorAll('thead th'));
                                                            // Filter out the 'add-col-th' if it exists
                                                            const dataHeaderCells = headerCells.slice(0, data.headers.length);

                                                            const currentDomWidths = dataHeaderCells.map(cell => cell.getBoundingClientRect().width);

                                                            setDragState({
                                                                index,
                                                                startX: e.clientX,
                                                                // We don't need startWidth of just this col anymore, we have the array
                                                                initialColWidths: currentDomWidths
                                                            });
                                                            e.stopPropagation();
                                                        }}
                                                        // Hide resizer on lag column using inline style or conditional render? 
                                                        // Better to conditional render.
                                                        style={{ display: index >= data.headers.length - 1 ? 'none' : 'block' }}
                                                    />
                                                </>
                                            )}
                                        </div>
                                    </th>
                                );
                            })}
                            {!readOnly && isActive && (
                                <th className={`add-col-th visible`}>
                                    <button onClick={addColumn} className="add-btn" title="Add Column">+</button>
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map((row, rowIndex) => {
                            const isRowDeleteCandidate = deleteCandidate?.type === 'row' && deleteCandidate.index === rowIndex;
                            return (
                                <tr key={rowIndex} className={isRowDeleteCandidate ? 'delete-candidate' : ''}>
                                    {row.map((cell, colIndex) => {
                                        const isColDeleteCandidate = deleteCandidate?.type === 'col' && deleteCandidate.index === colIndex;
                                        return (
                                            <td key={colIndex} className={isColDeleteCandidate ? 'delete-candidate' : ''}>
                                                <textarea
                                                    value={cell}
                                                    onChange={(e) => {
                                                        e.target.style.height = 'auto';
                                                        e.target.style.height = e.target.scrollHeight + 'px';
                                                        handleCellChange(rowIndex, colIndex, e.target.value);
                                                    }}
                                                    readOnly={readOnly}
                                                    className="cell-input"
                                                    rows={1}
                                                    onFocus={(e) => {
                                                        setIsActive(true);
                                                        e.target.style.height = 'auto';
                                                        e.target.style.height = e.target.scrollHeight + 'px';
                                                    }}
                                                />
                                            </td>
                                        );
                                    })}
                                    {!readOnly && isActive && (
                                        <td className={`row-actions visible`}>
                                            <button
                                                onClick={() => removeRow(rowIndex)}
                                                className={`remove-row-btn ${isRowDeleteCandidate ? 'confirm-delete' : ''}`}
                                                title={isRowDeleteCandidate ? "Confirm Delete" : "Remove Row"}
                                            >
                                                ×
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {
                !readOnly && isActive && (
                    <button onClick={addRow} className={`add-row-btn visible`}>
                        + Add Row
                    </button>
                )
            }
        </div>
    );
}

export default TableEditor;
