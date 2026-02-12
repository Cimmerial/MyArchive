import express from 'express';
import { getProjectDb, getMetaDb } from '../db.js';

const router = express.Router();

/**
 * Middleware to validate project exists
 */
function validateProject(req, res, next) {
    const { projectId } = req.params;
    const db = getMetaDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);

    if (!project) {
        return res.status(404).json({ error: 'Project not found' });
    }

    req.project = project;
    req.projectDb = getProjectDb(project.name);
    next();
}

/**
 * GET /api/projects/:projectId/devlog
 * Fetch devlog days with their content and activity
 * Query params: limit (default 7), offset (default 0)
 */
router.get('/:projectId/devlog', validateProject, (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 7;
        const offset = parseInt(req.query.offset) || 0;

        // Ensure today exists - REMOVED to prevent empty days
        // const today = new Date().toLocaleDateString('en-CA');
        // req.projectDb.prepare('INSERT OR IGNORE INTO devlog_days (date) VALUES (?)').run(today);

        const days = req.projectDb.prepare(
            'SELECT * FROM devlog_days ORDER BY date DESC LIMIT ? OFFSET ?'
        ).all(limit, offset);

        const result = days.map(day => {
            const cells = req.projectDb.prepare(
                'SELECT * FROM devlog_cells WHERE day_id = ? ORDER BY order_index'
            ).all(day.id);

            const activity = req.projectDb.prepare(
                'SELECT * FROM activity_log WHERE day_date = ? ORDER BY timestamp DESC'
            ).all(day.date);

            return { ...day, cells, activity };
        });

        res.json(result);
    } catch (error) {
        console.error('Error fetching devlog:', error);
        res.status(500).json({ error: 'Failed to fetch devlog' });
    }
});

/**
 * POST /api/projects/:projectId/devlog/cells
 * Create a new cell for a specific day
 */
router.post('/:projectId/devlog/cells', validateProject, (req, res) => {
    try {
        let { dayId, date, type, content, orderIndex } = req.body;

        if (!dayId && !date) {
            return res.status(400).json({ error: 'Day ID or Date is required' });
        }

        // If dayId is missing but date is provided, find or create the day
        if (!dayId && date) {
            try {
                // Ensure date is valid? simpler to just trust it or basic regex
                req.projectDb.prepare('INSERT OR IGNORE INTO devlog_days (date) VALUES (?)').run(date);
                const day = req.projectDb.prepare('SELECT id FROM devlog_days WHERE date = ?').get(date);
                if (day) dayId = day.id;
            } catch (e) {
                console.error('Error finding/creating day by date:', e);
            }
        }

        if (!dayId) {
            return res.status(400).json({ error: 'Could not resolve Day ID' });
        }

        // Check if day exists, if not... wait, dayId is required, so it must exist?
        // Actually, if the frontend sends a dayId that matches "today" but it wasn't created yet...
        // The frontend usually sends an integer ID. If "today" hasn't been created, frontend might not have an ID.
        // It's better for frontend to ask to create the day explicitly OR for us to handle "timestamp" -> "day_id".
        // Current design: frontend passes dayId. So frontend must create the day first if it doesn't exist?
        // Or we should allow creating a cell by "date" instead of "dayId"?
        // Let's stick to dayId for now, assuming activity logging creates the day, OR user manually clicks "Start Entry".
        // If the user wants to "type in it", they likely clicked a button that should ensure the day exists.

        // However, if we removed the auto-create in GET, the frontend won't have an ID for "today" if there's no activity yet.
        // We probably need a customized endpoint to "get or create today", OR allow creating a cell with a date.
        // Let's modify this to ALSO accept a 'date' to find/create the day if dayId is missing?
        // actually, let's keep it simple: reliable way is for frontend to call a "ensure day" endpoint or we restore a specific "ensure day" endpoint.
        // But simpler: just use the activity log side-effect for now, and if user wants to type, we ADD an endpoint to create the day.


        let finalOrderIndex = orderIndex;
        if (finalOrderIndex === undefined) {
            const maxOrder = req.projectDb.prepare(
                'SELECT MAX(order_index) as max FROM devlog_cells WHERE day_id = ?'
            ).get(dayId);
            finalOrderIndex = (maxOrder.max || -1) + 1;
        }

        const result = req.projectDb.prepare(
            'INSERT INTO devlog_cells (day_id, type, content, order_index) VALUES (?, ?, ?, ?)'
        ).run(dayId, type || 'text', content || '', finalOrderIndex);

        const newCell = req.projectDb.prepare('SELECT * FROM devlog_cells WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json(newCell);
    } catch (error) {
        console.error('Error creating devlog cell:', error);
        res.status(500).json({ error: 'Failed to create cell' });
    }
});

/**
 * PUT /api/projects/:projectId/devlog/cells/:cellId
 * Update a cell
 */
router.put('/:projectId/devlog/cells/:cellId', validateProject, (req, res) => {
    try {
        const { cellId } = req.params;
        const { content, type } = req.body;

        const cell = req.projectDb.prepare('SELECT * FROM devlog_cells WHERE id = ?').get(cellId);
        if (!cell) return res.status(404).json({ error: 'Cell not found' });

        if (content !== undefined) {
            req.projectDb.prepare('UPDATE devlog_cells SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(content, cellId);
        }
        if (type !== undefined) {
            req.projectDb.prepare('UPDATE devlog_cells SET type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(type, cellId);
        }

        const updatedCell = req.projectDb.prepare('SELECT * FROM devlog_cells WHERE id = ?').get(cellId);
        res.json(updatedCell);

    } catch (error) {
        console.error('Error updating devlog cell:', error);
        res.status(500).json({ error: 'Failed to update cell' });
    }
});

/**
 * DELETE /api/projects/:projectId/devlog/cells/:cellId
 * Delete a cell
 */
router.delete('/:projectId/devlog/cells/:cellId', validateProject, (req, res) => {
    try {
        const { cellId } = req.params;
        req.projectDb.prepare('DELETE FROM devlog_cells WHERE id = ?').run(cellId);
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting devlog cell:', error);
        res.status(500).json({ error: 'Failed to delete cell' });
    }
});

/**
 * PUT /api/projects/:projectId/devlog/cells/reorder
 * Reorder cells for a day
 */
router.post('/:projectId/devlog/cells/reorder', validateProject, (req, res) => {
    try {
        const { cellIds } = req.body;

        if (!Array.isArray(cellIds)) {
            return res.status(400).json({ error: 'cellIds array required' });
        }

        const updateStmt = req.projectDb.prepare('UPDATE devlog_cells SET order_index = ? WHERE id = ?');

        const transaction = req.projectDb.transaction((ids) => {
            ids.forEach((id, index) => {
                updateStmt.run(index, id);
            });
        });

        transaction(cellIds);
        res.json({ success: true });
    } catch (error) {
        console.error('Error reordering devlog cells:', error);
        res.status(500).json({ error: 'Failed to reorder cells' });
    }
});

export default router;
