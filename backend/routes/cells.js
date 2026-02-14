import express from 'express';
import { getProjectDb, getMetaDb } from '../db.js';

const router = express.Router();

/**
 * Helper to log activity
 */
function logActivity(db, entityType, entityId, action, details) {
    try {
        // Use local time YYYY-MM-DD
        const today = new Date().toLocaleDateString('en-CA');
        db.prepare(
            'INSERT INTO activity_log (entity_type, entity_id, action, details, day_date) VALUES (?, ?, ?, ?, ?)'
        ).run(entityType, entityId, action, JSON.stringify(details), today);

        // Ensure day exists in devlog_days
        db.prepare('INSERT OR IGNORE INTO devlog_days (date) VALUES (?)').run(today);
    } catch (e) {
        console.error('Failed to log activity:', e);
    }
}

/**
 * Middleware to get project database from page ID
 */
function getDbFromPage(req, res, next) {
    const { projectId, pageId } = req.params;

    if (pageId === 'main') {
        const metaDb = getMetaDb();
        const project = metaDb.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
        if (project) {
            req.projectDb = getProjectDb(project.name);
            req.page = { id: 0 };
            return next();
        }
        return res.status(404).json({ error: 'Project not found' });
    }

    const metaDb = getMetaDb();
    const project = metaDb.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);

    if (!project) {
        return res.status(404).json({ error: 'Project not found' });
    }

    req.projectDb = getProjectDb(project.name);
    const page = req.projectDb.prepare('SELECT * FROM pages WHERE id = ?').get(pageId);

    if (page) {
        req.page = page;
        return next();
    }

    res.status(404).json({ error: 'Page not found' });
}

/**
 * Middleware to get project database from cell ID
 */
function getDbFromCell(req, res, next) {
    const { projectId, cellId } = req.params;

    const metaDb = getMetaDb();
    const project = metaDb.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);

    if (!project) {
        return res.status(404).json({ error: 'Project not found' });
    }

    req.projectDb = getProjectDb(project.name);
    const cell = req.projectDb.prepare('SELECT * FROM cells WHERE id = ?').get(cellId);

    if (cell) {
        req.cell = cell;
        return next();
    }

    res.status(404).json({ error: 'Cell not found' });
}

/**
 * POST /api/projects/:projectId/pages/:pageId/cells - Create new cell
 */
router.post('/:projectId/pages/:pageId/cells', getDbFromPage, (req, res) => {
    try {
        const { pageId } = req.params;
        const { type, content, orderIndex } = req.body;

        if (!type || !['header', 'subheader', 'text', 'table', 'ranking'].includes(type)) {
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
 * PUT /api/projects/:projectId/cells/:cellId - Update cell content
 */
router.put('/:projectId/cells/:cellId', getDbFromCell, (req, res) => {
    try {
        const { cellId } = req.params;
        const { type, content } = req.body;

        const updates = [];
        const values = [];

        if (type !== undefined) {
            if (!['header', 'subheader', 'text', 'table', 'ranking'].includes(type)) {
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

        // Log activity for page update
        if (cell.page_id !== null) {
            const page = req.projectDb.prepare('SELECT id, title FROM pages WHERE id = ?').get(cell.page_id);
            if (page) {
                logActivity(req.projectDb, 'page', page.id, 'updated', { title: page.title });
            }
        }

        res.json(cell);
    } catch (error) {
        console.error('Error updating cell:', error);
        res.status(500).json({ error: 'Failed to update cell' });
    }
});

/**
 * DELETE /api/projects/:projectId/cells/:cellId - Delete cell
 */
router.delete('/:projectId/cells/:cellId', getDbFromCell, (req, res) => {
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
 * PUT /api/projects/:projectId/pages/:pageId/cells/reorder - Reorder cells
 */
router.put('/:projectId/pages/:pageId/cells/reorder', getDbFromPage, (req, res) => {
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
