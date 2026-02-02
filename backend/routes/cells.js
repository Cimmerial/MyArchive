import express from 'express';
import { getProjectDb, getMetaDb } from '../db.js';

const router = express.Router();

/**
 * Middleware to get project database from page ID
 */
function getDbFromPage(req, res, next) {
    const { pageId } = req.params;
    const { projectId } = req.body;

    if (pageId === 'main') {
        if (!projectId) {
            return res.status(400).json({ error: 'projectId is required for main page operations' });
        }
        const metaDb = getMetaDb();
        const project = metaDb.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
        if (project) {
            req.projectDb = getProjectDb(project.name);
            req.page = { id: 0 };
            return next();
        }
        return res.status(404).json({ error: 'Project not found' });
    }

    // Find which project this page belongs to
    const metaDb = getMetaDb();
    const projects = metaDb.prepare('SELECT * FROM projects').all();

    for (const project of projects) {
        const projectDb = getProjectDb(project.name);
        const page = projectDb.prepare('SELECT * FROM pages WHERE id = ?').get(pageId);

        if (page) {
            req.projectDb = projectDb;
            req.page = page;
            return next();
        }
    }

    res.status(404).json({ error: 'Page not found' });
}

/**
 * Middleware to get project database from cell ID
 */
function getDbFromCell(req, res, next) {
    const { cellId } = req.params;

    const metaDb = getMetaDb();
    const projects = metaDb.prepare('SELECT * FROM projects').all();

    for (const project of projects) {
        const projectDb = getProjectDb(project.name);
        const cell = projectDb.prepare('SELECT * FROM cells WHERE id = ?').get(cellId);

        if (cell) {
            req.projectDb = projectDb;
            req.cell = cell;
            return next();
        }
    }

    res.status(404).json({ error: 'Cell not found' });
}

/**
 * POST /api/pages/:pageId/cells - Create new cell
 */
router.post('/pages/:pageId/cells', getDbFromPage, (req, res) => {
    try {
        const { pageId } = req.params;
        const { type, content, orderIndex } = req.body;

        if (!type || !['header', 'subheader', 'text', 'table'].includes(type)) {
            return res.status(400).json({ error: 'Invalid cell type' });
        }

        // If no order index provided, append to end
        let finalOrderIndex = orderIndex;
        if (finalOrderIndex === undefined) {
            const maxOrder = req.projectDb.prepare(
                'SELECT MAX(order_index) as max FROM cells WHERE page_id = ?'
            ).get(pageId === 'main' ? 0 : pageId);
            finalOrderIndex = (maxOrder.max || -1) + 1;
        }

        const result = req.projectDb.prepare(
            'INSERT INTO cells (page_id, type, content, order_index) VALUES (?, ?, ?, ?)'
        ).run(pageId === 'main' ? 0 : pageId, type, content || '', finalOrderIndex);

        const cell = req.projectDb.prepare('SELECT * FROM cells WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json(cell);
    } catch (error) {
        console.error('Error creating cell:', error);
        res.status(500).json({ error: 'Failed to create cell' });
    }
});

/**
 * PUT /api/cells/:cellId - Update cell content
 */
router.put('/cells/:cellId', getDbFromCell, (req, res) => {
    try {
        const { cellId } = req.params;
        const { type, content } = req.body;

        const updates = [];
        const values = [];

        if (type !== undefined) {
            if (!['header', 'subheader', 'text', 'table'].includes(type)) {
                return res.status(400).json({ error: 'Invalid cell type' });
            }
            updates.push('type = ?');
            values.push(type);
        }

        if (content !== undefined) {
            updates.push('content = ?');
            values.push(content);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No updates provided' });
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(cellId);

        req.projectDb.prepare(
            `UPDATE cells SET ${updates.join(', ')} WHERE id = ?`
        ).run(...values);

        const cell = req.projectDb.prepare('SELECT * FROM cells WHERE id = ?').get(cellId);

        res.json(cell);
    } catch (error) {
        console.error('Error updating cell:', error);
        res.status(500).json({ error: 'Failed to update cell' });
    }
});

/**
 * DELETE /api/cells/:cellId - Delete cell
 */
router.delete('/cells/:cellId', getDbFromCell, (req, res) => {
    try {
        const { cellId } = req.params;

        const result = req.projectDb.prepare('DELETE FROM cells WHERE id = ?').run(cellId);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Cell not found' });
        }

        res.status(204).send();
    } catch (error) {
        console.error('Error deleting cell:', error);
        res.status(500).json({ error: 'Failed to delete cell' });
    }
});

/**
 * PUT /api/pages/:pageId/cells/reorder - Reorder cells
 */
router.put('/pages/:pageId/cells/reorder', getDbFromPage, (req, res) => {
    try {
        const { pageId } = req.params;
        const { cellIds } = req.body;

        if (!Array.isArray(cellIds)) {
            return res.status(400).json({ error: 'cellIds must be an array' });
        }

        // Update order_index for each cell
        const updateStmt = req.projectDb.prepare(
            'UPDATE cells SET order_index = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND page_id = ?'
        );

        const transaction = req.projectDb.transaction((ids) => {
            ids.forEach((cellId, index) => {
                // Use req.page.id if available (set by middleware), otherwise parse pageId
                // For 'main', req.page.id is 0. For others, it's the DB object.
                // Safest to just replicate the 'main' check here or use req.page.id
                const targetPageId = pageId === 'main' ? 0 : pageId;
                updateStmt.run(index, cellId, targetPageId);
            });
        });

        transaction(cellIds);

        const cells = req.projectDb.prepare(
            'SELECT * FROM cells WHERE page_id = ? ORDER BY order_index'
        ).all(pageId === 'main' ? 0 : pageId);

        res.json(cells);
    } catch (error) {
        console.error('Error reordering cells:', error);
        res.status(500).json({ error: 'Failed to reorder cells' });
    }
});

export default router;
