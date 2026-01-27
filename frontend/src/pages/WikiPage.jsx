import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import PageContent from '../components/PageContent';
import './WikiPage.css';

function WikiPage() {
    const { projectId, pageId } = useParams();
    const [project, setProject] = useState(null);
    const [currentPage, setCurrentPage] = useState(null);
    const [allPages, setAllPages] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadProject();
        loadPages();
    }, [projectId]);

    useEffect(() => {
        if (projectId) {
            loadPage(pageId || 'main');
        }
    }, [projectId, pageId]);

    const loadProject = async () => {
        try {
            const response = await axios.get('/api/projects');
            const proj = response.data.find(p => p.id === parseInt(projectId));
            setProject(proj);
        } catch (error) {
            console.error('Failed to load project:', error);
        }
    };

    const loadPages = async () => {
        try {
            const response = await axios.get(`/api/projects/${projectId}/pages`);
            setAllPages(response.data);
        } catch (error) {
            console.error('Failed to load pages:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadPage = async (id) => {
        try {
            const response = await axios.get(`/api/projects/${projectId}/pages/${id}`);
            setCurrentPage(response.data);
        } catch (error) {
            console.error('Failed to load page:', error);
        }
    };

    const createPage = async (title, parentId = null) => {
        try {
            const response = await axios.post(`/api/projects/${projectId}/pages`, {
                title,
                parentId
            });
            setAllPages([...allPages, response.data]);
            return response.data;
        } catch (error) {
            console.error('Failed to create page:', error);
            throw error;
        }
    };

    const updatePage = async (id, updates) => {
        try {
            const response = await axios.put(`/api/projects/${projectId}/pages/${id}`, updates);
            setAllPages(allPages.map(p => p.id === id ? response.data : p));
            if (currentPage?.id === id) {
                setCurrentPage({ ...currentPage, ...response.data });
            }
        } catch (error) {
            console.error('Failed to update page:', error);
        }
    };

    const deletePage = async (id) => {
        try {
            await axios.delete(`/api/projects/${projectId}/pages/${id}`);
            setAllPages(allPages.filter(p => p.id !== id));
            if (currentPage?.id === id) {
                setCurrentPage(null);
            }
        } catch (error) {
            console.error('Failed to delete page:', error);
        }
    };

    if (loading) {
        return <div className="wiki-page loading">Loading...</div>;
    }

    return (
        <div className="wiki-page">
            <Header project={project} currentPage={currentPage} allPages={allPages} />
            <div className="wiki-content">
                <Sidebar
                    projectId={projectId}
                    project={project}
                    allPages={allPages}
                    currentPage={currentPage}
                    onCreatePage={createPage}
                    onDeletePage={deletePage}
                    onUpdatePage={updatePage}
                />
                <PageContent
                    projectId={projectId}
                    page={currentPage}
                    allPages={allPages}
                    onPageUpdate={(updates) => currentPage && updatePage(currentPage.id, updates)}
                    onCellsChange={() => currentPage && loadPage(currentPage.id)}
                    onCreatePage={createPage}
                />
            </div>
        </div>
    );
}

export default WikiPage;
