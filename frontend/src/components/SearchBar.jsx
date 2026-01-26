import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './SearchBar.css';

function SearchBar({ projectId }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState({ titleResults: [], contentResults: [] });
    const [showResults, setShowResults] = useState(false);
    const searchRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowResults(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (query.trim() === '') {
            setResults({ titleResults: [], contentResults: [] });
            setShowResults(false);
            return;
        }

        const timeoutId = setTimeout(async () => {
            try {
                const response = await axios.get(`/api/projects/${projectId}/search?q=${encodeURIComponent(query)}`);
                setResults(response.data);
                setShowResults(true);
            } catch (error) {
                console.error('Search failed:', error);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [query, projectId]);

    const handleResultClick = (pageId) => {
        navigate(`/project/${projectId}/page/${pageId}`);
        setQuery('');
        setShowResults(false);
    };

    const totalResults = results.titleResults.length + results.contentResults.length;

    return (
        <div className="search-bar" ref={searchRef}>
            <input
                type="text"
                placeholder="Search pages..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => query && setShowResults(true)}
            />
            {showResults && totalResults > 0 && (
                <div className="search-results">
                    {results.titleResults.length > 0 && (
                        <div className="search-section">
                            <div className="search-section-header">Title Matches</div>
                            {results.titleResults.map(page => (
                                <div
                                    key={page.id}
                                    className="search-result-item"
                                    onClick={() => handleResultClick(page.id)}
                                >
                                    <div className="search-result-title">{page.title}</div>
                                    <div className="search-result-path text-muted">{page.path}</div>
                                </div>
                            ))}
                        </div>
                    )}
                    {results.contentResults.length > 0 && (
                        <div className="search-section">
                            <div className="search-section-header">Content Matches</div>
                            {results.contentResults.map(page => (
                                <div
                                    key={page.id}
                                    className="search-result-item"
                                    onClick={() => handleResultClick(page.id)}
                                >
                                    <div className="search-result-title">{page.title}</div>
                                    <div className="search-result-path text-muted">{page.path}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default SearchBar;
