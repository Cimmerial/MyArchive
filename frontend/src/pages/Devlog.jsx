import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import DevlogDay from '../components/DevlogDay';
import './Devlog.css';

function Devlog() {
    const { projectId } = useParams();
    const [project, setProject] = useState(null);
    const [allPages, setAllPages] = useState([]);
    const [days, setDays] = useState([]);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);
    const [offset, setOffset] = useState(0);
    const observer = useRef();

    // Load Project and Pages Data
    useEffect(() => {
        const loadData = async () => {
            try {
                const [projRes, pagesRes] = await Promise.all([
                    axios.get('/api/projects'),
                    axios.get(`/api/projects/${projectId}/pages`)
                ]);
                const proj = projRes.data.find(p => p.id === parseInt(projectId));
                setProject(proj);
                setAllPages(pagesRes.data);
            } catch (error) {
                console.error('Failed to load project data:', error);
            } finally {
                setInitialLoading(false);
            }
        };
        loadData();
    }, [projectId]);

    const fetchDays = useCallback(async (currentOffset) => {
        if (loading) return;
        setLoading(true);
        try {
            const limit = 7;
            const res = await axios.get(`/api/projects/${projectId}/devlog?limit=${limit}&offset=${currentOffset}`);

            if (res.data.length < limit) {
                setHasMore(false);
            }

            setDays(prev => {
                const existingIds = new Set(prev.map(d => d.id));
                const newDays = res.data.filter(d => !existingIds.has(d.id));
                return [...prev, ...newDays];
            });
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [projectId, loading]);

    // Initial Day Load
    useEffect(() => {
        setDays([]);
        setOffset(0);
        setHasMore(true);

        const loadInitialDays = async () => {
            setLoading(true);
            try {
                const limit = 7;
                const res = await axios.get(`/api/projects/${projectId}/devlog?limit=${limit}&offset=0`);
                let fetchedDays = res.data;

                if (fetchedDays.length < limit) setHasMore(false);

                // Check if today exists
                const todayDate = new Date().toLocaleDateString('en-CA');
                const todayExists = fetchedDays.some(d => d.date === todayDate);

                if (!todayExists) {
                    const tempToday = {
                        id: 'temp-today',
                        date: todayDate,
                        cells: [],
                        activity: [],
                        isTemp: true
                    };
                    fetchedDays = [tempToday, ...fetchedDays];
                }

                setDays(fetchedDays);
                setOffset(limit);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadInitialDays();
    }, [projectId]);

    const lastDayElementRef = useCallback(node => {
        if (loading) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore) {
                const limit = 7;
                const nextOffset = offset;
                setOffset(prev => prev + limit);
                fetchDays(nextOffset);
            }
        });
        if (node) observer.current.observe(node);
    }, [loading, hasMore, offset, fetchDays]);

    const handleDayUpdate = (updatedDay) => {
        setDays(prev => prev.map(d => d.id === updatedDay.id ? updatedDay : d));
    };

    // Placeholder functions for Sidebar
    const createPage = async () => { };
    const deletePage = async () => { };
    const updatePage = async () => { };

    if (initialLoading) return <div className="devlog-page loading">Loading...</div>;

    return (
        <div className="devlog-page">
            <Header project={project} currentPage={{ id: 'devlog', title: 'Developer Log' }} allPages={allPages} />
            <div className="wiki-content">
                <Sidebar
                    projectId={projectId}
                    project={project}
                    allPages={allPages}
                    currentPage={{ id: 'devlog' }}
                    onCreatePage={createPage}
                    onDeletePage={deletePage}
                    onUpdatePage={updatePage}
                />

                <div className="devlog-container">
                    <h1 className="devlog-title">Developer Log</h1>
                    <div className="devlog-feed">
                        {days.map((day, index) => {
                            const isLast = days.length === index + 1;
                            return (
                                <div ref={isLast ? lastDayElementRef : null} key={day.id}>
                                    <DevlogDay
                                        day={day}
                                        projectId={projectId}
                                        allPages={allPages}
                                        onDayUpdate={handleDayUpdate}
                                    />
                                </div>
                            );
                        })}
                        {loading && <div className="loading-spinner">Loading...</div>}
                        {!hasMore && days.length > 0 && <div className="end-of-log">End of log</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Devlog;
