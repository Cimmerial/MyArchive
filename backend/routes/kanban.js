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
 * GET /api/projects/:projectId/kanban
 * Fetch all non-archived kanban items
 */
router.get('/:projectId/kanban', validateProject, (req, res) => {
    try {
        const items = req.projectDb.prepare(
            'SELECT * FROM kanban_items WHERE is_archived = 0 ORDER BY order_index ASC'
        ).all();
        res.json(items);
    } catch (error) {
        console.error('Error fetching kanban items:', error);
        res.status(500).json({ error: 'Failed to fetch items' });
    }
});

/**
 * POST /api/projects/:projectId/kanban
 * Create a new item
 */
router.post('/:projectId/kanban', validateProject, (req, res) => {
    try {
        const { column, title, description, orderIndex } = req.body;

        if (!column || !title) {
            return res.status(400).json({ error: 'Column and Title are required' });
        }

        // Determine order index if not provided
        let finalOrderIndex = orderIndex;
        if (finalOrderIndex === undefined) {
            const maxOrder = req.projectDb.prepare(
                'SELECT MAX(order_index) as max FROM kanban_items WHERE column = ? AND is_archived = 0'
            ).get(column);
            finalOrderIndex = (maxOrder.max || -1) + 1;
        }

        const result = req.projectDb.prepare(`
            INSERT INTO kanban_items (column, title, description, order_index, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(column, title, description || '', finalOrderIndex);

        const newItem = req.projectDb.prepare('SELECT * FROM kanban_items WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(newItem);
    } catch (error) {
        console.error('Error creating kanban item:', error);
        res.status(500).json({ error: 'Failed to create item' });
    }
});

/**
 * PUT /api/projects/:projectId/kanban/:itemId
 * Update an item (move columns, update text, mark completed)
 */
router.put('/:projectId/kanban/:itemId', validateProject, (req, res) => {
    try {
        const { itemId } = req.params;
        const { column, title, description, orderIndex, isCompleted } = req.body;

        const item = req.projectDb.prepare('SELECT * FROM kanban_items WHERE id = ?').get(itemId);
        if (!item) return res.status(404).json({ error: 'Item not found' });

        const updates = [];
        const values = [];

        if (column !== undefined) {
            updates.push('column = ?');
            values.push(column);
        }
        if (title !== undefined) {
            updates.push('title = ?');
            values.push(title);
        }
        if (description !== undefined) {
            updates.push('description = ?');
            values.push(description);
        }
        if (orderIndex !== undefined) {
            updates.push('order_index = ?');
            values.push(orderIndex);
        }

        // Handle completion date logic automatically based on column or explicit flag
        // Assuming 'Completed' is the completed column name
        if (column === 'Completed' && item.column !== 'Completed') {
            updates.push('completed_at = CURRENT_TIMESTAMP');
        } else if (column !== undefined && column !== 'Completed' && item.column === 'Completed') {
            // Moved out of completed? Clear date? Or keep it? keeping history might be nice.
            // User prompt said "date when ... completed"
            // If moved back, maybe clear it? strict kanban usually implies flow forward.
            // Let's leave it for now unless requested.
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');

        values.push(itemId);

        req.projectDb.prepare(
            `UPDATE kanban_items SET ${updates.join(', ')} WHERE id = ?`
        ).run(...values);

        const updatedItem = req.projectDb.prepare('SELECT * FROM kanban_items WHERE id = ?').get(itemId);
        res.json(updatedItem);
    } catch (error) {
        console.error('Error updating kanban item:', error);
        res.status(500).json({ error: 'Failed to update item' });
    }
});

/**
 * DELETE /api/projects/:projectId/kanban/:itemId
 * Permanently delete or soft delete
 */
router.delete('/:projectId/kanban/:itemId', validateProject, (req, res) => {
    try {
        const { itemId } = req.params;
        req.projectDb.prepare('DELETE FROM kanban_items WHERE id = ?').run(itemId);
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting kanban item:', error);
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

/**
 * POST /api/projects/:projectId/kanban/reorder
 * Batch update order indices for a list of items
 * Body: { items: [{ id, orderIndex, column }] }
 */
router.post('/:projectId/kanban/reorder', validateProject, (req, res) => {
    try {
        const { items } = req.body;
        if (!Array.isArray(items)) {
            return res.status(400).json({ error: 'Items array is required' });
        }

        const updateStmt = req.projectDb.prepare(
            'UPDATE kanban_items SET order_index = ?, column = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        );

        const transaction = req.projectDb.transaction((itemsToUpdate) => {
            for (const item of itemsToUpdate) {
                updateStmt.run(item.orderIndex, item.column, item.id);
            }
        });

        transaction(items);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error reordering items:', error);
        res.status(500).json({ error: 'Failed to reorder items' });
    }
});

/**
 * POST /api/projects/:projectId/kanban/archive
 * Archive all items in 'Completed' column
 */
router.post('/:projectId/kanban/archive', validateProject, (req, res) => {
    try {
        const result = req.projectDb.prepare(
            "UPDATE kanban_items SET is_archived = 1 WHERE column = 'Completed'"
        ).run();

        res.json({ archivedCount: result.changes });
    } catch (error) {
        console.error('Error archiving items:', error);
        res.status(500).json({ error: 'Failed to archive items' });
    }
});

export default router;
