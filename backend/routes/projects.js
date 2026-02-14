import express from 'express';
import { getMetaDb, getProjectDb } from '../db.js';

const router = express.Router();

/**
 * GET /api/projects - List all projects
 */
router.get('/', (req, res) => {
    try {
        const db = getMetaDb();
        const projects = db.prepare('SELECT * FROM projects').all();

        const projectsWithStats = projects.map(project => {
            try {
                const projectDb = getProjectDb(project.name);

                // Calculate page word counts
                const pageStats = projectDb.prepare(`
                    SELECT 
                        COUNT(DISTINCT p.id) as page_count,
                        SUM(LENGTH(c.content) - LENGTH(REPLACE(c.content, ' ', '')) + 1) as word_count
                    FROM pages p
                    LEFT JOIN cells c ON p.id = c.page_id
                    WHERE p.id != 0
                `).get();

                // Calculate todo stats
                const todoStats = projectDb.prepare(`
                    SELECT 
                        COUNT(*) as total_todos,
                        SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed_todos,
                        SUM(
                            (LENGTH(title) - LENGTH(REPLACE(title, ' ', '')) + 1) +
                            (LENGTH(COALESCE(description, '')) - LENGTH(REPLACE(COALESCE(description, ''), ' ', '')) + 1)
                        ) as word_count
                    FROM kanban_items
                    WHERE is_archived = 0
                `).get();

                // Calculate devlog stats
                const devlogStats = projectDb.prepare(`
                    SELECT 
                        SUM(LENGTH(content) - LENGTH(REPLACE(content, ' ', '')) + 1) as word_count
                    FROM devlog_cells
                `).get();

                const totalWordCount = (pageStats.word_count || 0) + (todoStats.word_count || 0) + (devlogStats.word_count || 0);

                return {
                    ...project,
                    stats: {
                        pageCount: pageStats.page_count || 0,
                        totalTodos: todoStats.total_todos || 0,
                        completedTodos: todoStats.completed_todos || 0,
                        totalWordCount: totalWordCount
                    }
                };
            } catch (err) {
                console.error(`Error fetching stats for project ${project.name}:`, err);
                return {
                    ...project,
                    stats: {
                        pageCount: 0,
                        totalTodos: 0,
                        completedTodos: 0,
                        totalWordCount: 0
                    }
                };
            }
        });

        // Sort by total word count descending
        projectsWithStats.sort((a, b) => b.stats.totalWordCount - a.stats.totalWordCount);

        res.json(projectsWithStats);
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
