import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ProjectSelection from './pages/ProjectSelection';
import WikiPage from './pages/WikiPage';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProjectSelection />} />
        <Route path="/project/:projectId" element={<WikiPage />} />
        <Route path="/project/:projectId/page/:pageId" element={<WikiPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
