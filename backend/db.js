import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECTS_DIR = join(__dirname, '..', 'projects');

// Ensure projects directory exists
if (!existsSync(PROJECTS_DIR)) {
  mkdirSync(PROJECTS_DIR, { recursive: true });
}

// Store active database connections
const dbConnections = new Map();

/**
 * Get or create database connection for a project
 */
export function getProjectDb(projectName) {
  if (dbConnections.has(projectName)) {
    return dbConnections.get(projectName);
  }

  const projectDir = join(PROJECTS_DIR, projectName);
  if (!existsSync(projectDir)) {
    mkdirSync(projectDir, { recursive: true });
  }

  const dbPath = join(projectDir, 'project.db');
  const db = new Database(dbPath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Initialize schema
  initializeSchema(db);

  dbConnections.set(projectName, db);
  return db;
}

/**
 * Initialize database schema
 */
function initializeSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      parent_id INTEGER,
      path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES pages(id) ON DELETE CASCADE
    );

    -- Ensure a dummy "Main Page" exists with ID 0 for project-level cells
    INSERT OR IGNORE INTO pages (id, title, path) VALUES (0, 'Main Page', 'Main Page');

    CREATE TABLE IF NOT EXISTS cells (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('header', 'subheader', 'text')),
      content TEXT NOT NULL DEFAULT '',
      order_index INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_page_id INTEGER NOT NULL,
      target_page_id INTEGER NOT NULL,
      cell_id INTEGER NOT NULL,
      link_text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_page_id) REFERENCES pages(id) ON DELETE CASCADE,
      FOREIGN KEY (target_page_id) REFERENCES pages(id) ON DELETE CASCADE,
      FOREIGN KEY (cell_id) REFERENCES cells(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pages_parent ON pages(parent_id);
    CREATE INDEX IF NOT EXISTS idx_pages_title ON pages(title);
    CREATE INDEX IF NOT EXISTS idx_cells_page ON cells(page_id);
    CREATE INDEX IF NOT EXISTS idx_cells_order ON cells(page_id, order_index);
    CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_page_id);
    CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_page_id);
  `);
}

/**
 * Get metadata database for project management
 */
export function getMetaDb() {
  const metaDbPath = join(PROJECTS_DIR, 'meta.db');
  const db = new Database(metaDbPath);

  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}

/**
 * Close all database connections
 */
export function closeAllConnections() {
  for (const [name, db] of dbConnections.entries()) {
    db.close();
    dbConnections.delete(name);
  }
}
