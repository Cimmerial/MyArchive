import express from 'express';
import { getMetaDb } from '../db.js';

const router = express.Router();

/**
 * GET /api/projects - List all projects
 */
router.get('/', (req, res) => {
    try {
        const db = getMetaDb();
        const projects = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all();
        res.json(projects);
    } catch (error) {
        console.error('Error fetching projects:', error);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

/**
 * POST /api/projects - Create new project
 */
router.post('/', (req, res) => {
    try {
        const { displayName } = req.body;

        if (!displayName || displayName.trim() === '') {
            return res.status(400).json({ error: 'Project name is required' });
        }

        // Create URL-safe name
        const name = displayName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

        const db = getMetaDb();

        try {
            const result = db.prepare(
                'INSERT INTO projects (name, display_name) VALUES (?, ?)'
            ).run(name, displayName);

            const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);

            res.status(201).json(project);
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return res.status(409).json({ error: 'Project with this name already exists' });
            }
            throw error;
        }
    } catch (error) {
        console.error('Error creating project:', error);
        res.status(500).json({ error: 'Failed to create project' });
    }
});

/**
 * DELETE /api/projects/:id - Delete project
 */
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const db = getMetaDb();

        const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        res.status(204).send();
    } catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

export default router;
