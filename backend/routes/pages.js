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
 * Build path string for breadcrumb navigation
 */
function buildPath(db, pageId) {
    const parts = [];
    let currentId = pageId;

    while (currentId) {
        const page = db.prepare('SELECT id, title, parent_id FROM pages WHERE id = ?').get(currentId);
        if (!page) break;
        parts.unshift(page.title);
        currentId = page.parent_id;
    }

    return parts.join(' > ');
}

/**
 * GET /api/projects/:projectId/pages - Get all pages for project
 */
router.get('/:projectId/pages', validateProject, (req, res) => {
    try {
        const pages = req.projectDb.prepare('SELECT * FROM pages WHERE id != 0 ORDER BY title').all();
        res.json(pages);
    } catch (error) {
        console.error('Error fetching pages:', error);
        res.status(500).json({ error: 'Failed to fetch pages' });
    }
});

/**
 * GET /api/projects/:projectId/pages/:pageId - Get specific page with cells
 */
router.get('/:projectId/pages/:pageId', validateProject, (req, res) => {
    try {
        const { pageId } = req.params;

        if (pageId === 'main') {
            const cells = req.projectDb.prepare(
                'SELECT * FROM cells WHERE page_id = 0 ORDER BY order_index'
            ).all();
            // Main page doesn't have a specific updated_at in DB technically, but cells do.
            // We can compute max cell update.
            return res.json({ id: 'main', title: req.project.display_name, cells, updated_at: new Date().toISOString() });
        }

        const page = req.projectDb.prepare('SELECT * FROM pages WHERE id = ?').get(pageId);

        if (!page) {
            return res.status(404).json({ error: 'Page not found' });
        }

        const cells = req.projectDb.prepare(
            'SELECT * FROM cells WHERE page_id = ? ORDER BY order_index'
        ).all(pageId);

        // Recursive function to get max updated_at for all descendants
        const getSubUpdated = (parentId) => {
            let maxDate = null;
            const children = req.projectDb.prepare('SELECT id, updated_at FROM pages WHERE parent_id = ?').all(parentId);

            for (const child of children) {
                // Check child's own update time
                if (!maxDate || new Date(child.updated_at) > new Date(maxDate)) {
                    maxDate = child.updated_at;
                }

                // Check child's cells update time (if we want that granularity, but let's stick to page/descendant pages for now as user asked for "subpage was updated")
                // User asked: "last time a subpage was updated". This implies checking the subpages themselves AND their content?
                // Usually "updated_at" on page should trigger when cells change?
                // Currently only PUT page updates `updated_at`. Cell changes should probably update parent page `updated_at` too?
                // Let's assume for now we check child pages recursively.

                const subMax = getSubUpdated(child.id);
                if (subMax && (!maxDate || new Date(subMax) > new Date(maxDate))) {
                    maxDate = subMax;
                }
            }
            return maxDate;
        };

        const subUpdatedAt = getSubUpdated(pageId);

        res.json({ ...page, cells, sub_updated_at: subUpdatedAt });
    } catch (error) {
        console.error('Error fetching page:', error);
        res.status(500).json({ error: 'Failed to fetch page' });
    }
});

/**
 * GET /api/projects/:projectId/pages/:pageId/children - Get child pages
 */
router.get('/:projectId/pages/:pageId/children', validateProject, (req, res) => {
    try {
        const { pageId } = req.params;

        const children = req.projectDb.prepare(
            'SELECT * FROM pages WHERE parent_id = ? ORDER BY title'
        ).get(pageId === 'root' ? null : pageId);

        res.json(children || []);
    } catch (error) {
        console.error('Error fetching child pages:', error);
        res.status(500).json({ error: 'Failed to fetch child pages' });
    }
});

/**
 * POST /api/projects/:projectId/pages - Create new page
 */
router.post('/:projectId/pages', validateProject, (req, res) => {
    try {
        const { title, parentId } = req.body;

        if (!title || title.trim() === '') {
            return res.status(400).json({ error: 'Page title is required' });
        }

        const path = buildPath(req.projectDb, parentId) + (parentId ? ' > ' : '') + title;

        const result = req.projectDb.prepare(
            'INSERT INTO pages (title, parent_id, path) VALUES (?, ?, ?)'
        ).run(title, parentId || null, path);

        const pageId = result.lastInsertRowid;

        // Convert title to camelCase for summary header
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

        const summaryHeader = `${toCamelCase(title)} Summary`;

        // Create default summary header cell
        req.projectDb.prepare(
            'INSERT INTO cells (page_id, type, content, order_index) VALUES (?, ?, ?, ?)'
        ).run(pageId, 'header', summaryHeader, 0);

        // Create default empty text cell
        req.projectDb.prepare(
            'INSERT INTO cells (page_id, type, content, order_index) VALUES (?, ?, ?, ?)'
        ).run(pageId, 'text', '', 1);

        const page = req.projectDb.prepare('SELECT * FROM pages WHERE id = ?').get(pageId);
        const cells = req.projectDb.prepare(
            'SELECT * FROM cells WHERE page_id = ? ORDER BY order_index'
        ).all(pageId);

        res.status(201).json({ ...page, cells });
    } catch (error) {
        console.error('Error creating page:', error);
        res.status(500).json({ error: 'Failed to create page' });
    }
});

/**
 * PUT /api/projects/:projectId/pages/:pageId - Update page
 */
router.put('/:projectId/pages/:pageId', validateProject, (req, res) => {
    try {
        const { pageId } = req.params;
        const { title, parentId } = req.body;

        const page = req.projectDb.prepare('SELECT * FROM pages WHERE id = ?').get(pageId);

        if (!page) {
            return res.status(404).json({ error: 'Page not found' });
        }

        // Handle title update or parent move
        const newTitle = title !== undefined ? title : page.title;
        const newParentId = parentId !== undefined ? (parentId === '' ? null : parentId) : page.parent_id;

        if (newTitle.trim() === '') {
            return res.status(400).json({ error: 'Page title is required' });
        }

        // Circular move check - cannot move a page to itself or its descendants
        if (parentId !== undefined && parentId !== page.parent_id) {
            if (parentId === parseInt(pageId)) {
                return res.status(400).json({ error: 'Cannot move a page to itself' });
            }

            // check if parentId is a descendant of pageId
            let currentId = parentId;
            while (currentId) {
                const parent = req.projectDb.prepare('SELECT parent_id FROM pages WHERE id = ?').get(currentId);
                if (!parent) break;
                if (parent.parent_id === parseInt(pageId)) {
                    return res.status(400).json({ error: 'Cannot move a page to its own descendant' });
                }
                currentId = parent.parent_id;
            }
        }

        const newPath = buildPath(req.projectDb, newParentId) + (newParentId ? ' > ' : '') + newTitle;

        req.projectDb.prepare(
            'UPDATE pages SET title = ?, parent_id = ?, path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(newTitle, newParentId, newPath, pageId);

        // Recursive function to update paths of all descendants
        const updateDescendantPaths = (db, parentId) => {
            const children = db.prepare('SELECT id, title FROM pages WHERE parent_id = ?').all(parentId);
            for (const child of children) {
                const childPath = buildPath(db, parentId) + ' > ' + child.title;
                db.prepare('UPDATE pages SET path = ? WHERE id = ?').run(childPath, child.id);
                updateDescendantPaths(db, child.id);
            }
        };

        if (newParentId !== page.parent_id || newTitle !== page.title) {
            updateDescendantPaths(req.projectDb, pageId);
        }

        const updatedPage = req.projectDb.prepare('SELECT * FROM pages WHERE id = ?').get(pageId);

        res.json(updatedPage);
    } catch (error) {
        console.error('Error updating page:', error);
        res.status(500).json({ error: 'Failed to update page' });
    }
});

/**
 * DELETE /api/projects/:projectId/pages/:pageId - Delete page
 */
router.delete('/:projectId/pages/:pageId', validateProject, (req, res) => {
    try {
        const { pageId } = req.params;

        const result = req.projectDb.prepare('DELETE FROM pages WHERE id = ?').run(pageId);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Page not found' });
        }

        res.status(204).send();
    } catch (error) {
        console.error('Error deleting page:', error);
        res.status(500).json({ error: 'Failed to delete page' });
    }
});

export default router;
