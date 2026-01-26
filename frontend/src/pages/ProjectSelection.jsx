import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import './ProjectSelection.css';

function ProjectSelection() {
    const [projects, setProjects] = useState([]);
    const [newProjectName, setNewProjectName] = useState('');
    const [loading, setLoading] = useState(true);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        loadProjects();
    }, []);

    const loadProjects = async () => {
        try {
            const response = await axios.get('/api/projects');
            setProjects(response.data);
        } catch (error) {
            console.error('Failed to load projects:', error);
        } finally {
            setLoading(false);
        }
    };

    const createProject = async (e) => {
        e.preventDefault();
        if (!newProjectName.trim()) return;

        try {
            const response = await axios.post('/api/projects', {
                displayName: newProjectName
            });
            setProjects([response.data, ...projects]);
            setNewProjectName('');
        } catch (error) {
            console.error('Failed to create project:', error);
            alert('Failed to create project. It may already exist.');
        }
    };

    const deleteProject = async () => {
        if (deleteTarget) {
            try {
                await axios.delete(`/api/projects/${deleteTarget.id}`);
                setProjects(projects.filter(p => p.id !== deleteTarget.id));
                setDeleteTarget(null);
            } catch (error) {
                console.error('Failed to delete project:', error);
                alert('Failed to delete project.');
            }
        }
    };

    if (loading) {
        return (
            <div className="project-selection">
                <div className="loading">Loading projects...</div>
            </div>
        );
    }

    return (
        <div className="project-selection">
            <div className="project-container">
                <header className="project-header">
                    <h1>MyArchive</h1>
                    <p className="text-muted">Your personal knowledge wiki</p>
                </header>

                <form className="create-project-form" onSubmit={createProject}>
                    <input
                        type="text"
                        placeholder="New project name..."
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        autoFocus
                    />
                    <button type="submit" className="btn-primary">
                        Create Project
                    </button>
                </form>

                <div className="projects-grid">
                    {projects.length === 0 ? (
                        <div className="empty-state">
                            <p className="text-muted">No projects yet. Create one to get started!</p>
                        </div>
                    ) : (
                        projects.map(project => (
                            <div key={project.id} className="project-card card">
                                <div className="project-card-content" onClick={() => navigate(`/project/${project.id}`)}>
                                    <h2>{project.display_name}</h2>
                                    <p className="text-muted">
                                        Created {new Date(project.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <button
                                    className="delete-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteTarget({ id: project.id, name: project.display_name });
                                    }}
                                    title="Delete project"
                                >
                                    ×
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {deleteTarget && (
                <DeleteConfirmModal
                    itemType="project"
                    itemName={deleteTarget.name}
                    onConfirm={deleteProject}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
        </div>
    );
}

export default ProjectSelection;
