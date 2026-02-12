import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ProjectSelection from './pages/ProjectSelection';
import WikiPage from './pages/WikiPage';
import KanbanBoard from './pages/KanbanBoard';
import Devlog from './pages/Devlog';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProjectSelection />} />
        <Route path="/project/:projectId" element={<WikiPage />} />
        <Route path="/project/:projectId/page/:pageId" element={<WikiPage />} />
        <Route path="/project/:projectId/todo" element={<KanbanBoard />} />
        <Route path="/project/:projectId/devlog" element={<Devlog />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
