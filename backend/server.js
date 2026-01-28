import express from 'express';
import cors from 'cors';
import { closeAllConnections } from './db.js';
import projectsRouter from './routes/projects.js';
import pagesRouter from './routes/pages.js';
import cellsRouter from './routes/cells.js';
import searchRouter from './routes/search.js';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/projects', projectsRouter);
app.use('/api/projects', pagesRouter);
app.use('/api', cellsRouter);
app.use('/api/projects', searchRouter);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    closeAllConnections();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down gracefully...');
    closeAllConnections();
    process.exit(0);
});

app.listen(PORT, () => {
    console.log(`Mychive backend running on http://localhost:${PORT}`);
});
