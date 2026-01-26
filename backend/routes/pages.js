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
        const pages = req.projectDb.prepare('SELECT * FROM pages ORDER BY title').all();
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

        const page = req.projectDb.prepare('SELECT * FROM pages WHERE id = ?').get(pageId);

        if (!page) {
            return res.status(404).json({ error: 'Page not found' });
        }

        const cells = req.projectDb.prepare(
            'SELECT * FROM cells WHERE page_id = ? ORDER BY order_index'
        ).all(pageId);

        res.json({ ...page, cells });
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
        const { title } = req.body;

        if (!title || title.trim() === '') {
            return res.status(400).json({ error: 'Page title is required' });
        }

        const page = req.projectDb.prepare('SELECT * FROM pages WHERE id = ?').get(pageId);

        if (!page) {
            return res.status(404).json({ error: 'Page not found' });
        }

        const path = buildPath(req.projectDb, page.parent_id) + (page.parent_id ? ' > ' : '') + title;

        req.projectDb.prepare(
            'UPDATE pages SET title = ?, path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(title, path, pageId);

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
