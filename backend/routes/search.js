import express from 'express';
import Fuse from 'fuse.js';
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
 * GET /api/projects/:projectId/search?q=query - Search pages by title and content
 */
router.get('/:projectId/search', validateProject, (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.trim() === '') {
            return res.json({ titleResults: [], contentResults: [] });
        }

        const query = q.trim().toLowerCase();

        // Search by title
        const pages = req.projectDb.prepare('SELECT * FROM pages').all();
        const titleFuse = new Fuse(pages, {
            keys: ['title'],
            threshold: 0.3,
            includeScore: true
        });
        const titleResults = titleFuse.search(query).map(result => result.item);

        // Search by content
        const cells = req.projectDb.prepare(`
      SELECT c.*, p.id as page_id, p.title as page_title, p.path
      FROM cells c
      JOIN pages p ON c.page_id = p.id
      WHERE c.content LIKE ?
    `).all(`%${query}%`);

        // Group by page and deduplicate
        const contentResultsMap = new Map();
        cells.forEach(cell => {
            if (!contentResultsMap.has(cell.page_id)) {
                contentResultsMap.set(cell.page_id, {
                    id: cell.page_id,
                    title: cell.page_title,
                    path: cell.path,
                    matchedContent: cell.content.substring(0, 100) + '...'
                });
            }
        });

        const contentResults = Array.from(contentResultsMap.values())
            .filter(page => !titleResults.some(tr => tr.id === page.id));

        res.json({ titleResults, contentResults });
    } catch (error) {
        console.error('Error searching:', error);
        res.status(500).json({ error: 'Failed to search' });
    }
});

/**
 * POST /api/projects/:projectId/suggest-links - Get link suggestions for text
 */
router.post('/:projectId/suggest-links', validateProject, (req, res) => {
    try {
        const { text, currentPageId } = req.body;

        if (!text || text.trim() === '') {
            return res.json([]);
        }

        const pages = req.projectDb.prepare('SELECT * FROM pages WHERE id != ?').all(currentPageId || -1);

        const fuse = new Fuse(pages, {
            keys: ['title'],
            threshold: 0.4,
            includeScore: true
        });

        const results = fuse.search(text.trim())
            .slice(0, 10)
            .map(result => ({
                ...result.item,
                score: result.score
            }));

        res.json(results);
    } catch (error) {
        console.error('Error suggesting links:', error);
        res.status(500).json({ error: 'Failed to suggest links' });
    }
});

export default router;
