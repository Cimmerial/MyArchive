# Mychive - Startup Instructions

## Starting the Application

Mychive consists of two parts that need to be running simultaneously:

### 1. Start the Backend Server

Open a terminal and run:

```bash
cd /[YOUR PATH]/backend
npm run dev
```

The backend will start on **http://localhost:3001**

You should see:
```
Mychive backend running on http://localhost:3001
```

### 2. Start the Frontend Application

Open a **second terminal** and run:

```bash
cd /[YOUR PATH]/frontend 
npm run dev
```

The frontend will start on **http://localhost:5173**

You should see:
```
VITE v7.3.1  ready in XXXms

➜  Local:   http://localhost:5173/
```

### 3. Access Mychive

Open your web browser and navigate to:

**http://localhost:5173**

---

## Quick Start Guide

1. **Create a Project**: Enter a project name and click "Create Project"
2. **Create Pages**: Click "+ New Page" to add pages to your wiki
3. **Organize Hierarchy**: Use the parent dropdown when creating pages to nest them
4. **Edit Content**: Click on cells to edit, they auto-save when you click away
5. **Create Links**: 
   - Type page names in ALL CAPS for automatic linking
   - Or highlight text, right-click, and select a page
6. **Search**: Use the search bar in the sidebar to find pages

---

## Stopping the Application

To stop Mychive:

1. Go to the terminal running the frontend and press **Ctrl+C**
2. Go to the terminal running the backend and press **Ctrl+C**
