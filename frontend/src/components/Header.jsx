import { Link } from 'react-router-dom';
import './Header.css';

function Header({ project, currentPage, allPages }) {
    const buildBreadcrumbs = () => {
        if (!currentPage) return [];

        const crumbs = [];
        let page = currentPage;

        // Build breadcrumb trail
        while (page) {
            crumbs.unshift(page);
            if (page.parent_id) {
                page = allPages.find(p => p.id === page.parent_id);
            } else {
                page = null;
            }
        }

        return crumbs;
    };

    const breadcrumbs = buildBreadcrumbs();

    return (
        <header className="wiki-header">
            <div className="breadcrumbs">
                <Link to="/" className="breadcrumb-item">
                    MyArchive
                </Link>
                {project && (
                    <>
                        <span className="breadcrumb-separator">›</span>
                        <Link to={`/project/${project.id}`} className="breadcrumb-item">
                            {project.display_name}
                        </Link>
                    </>
                )}
                {breadcrumbs.map((page, index) => (
                    <span key={page.id}>
                        <span className="breadcrumb-separator">›</span>
                        <Link
                            to={`/project/${project.id}/page/${page.id}`}
                            className={`breadcrumb-item ${index === breadcrumbs.length - 1 ? 'active' : ''}`}
                        >
                            {page.title}
                        </Link>
                    </span>
                ))}
            </div>
        </header>
    );
}

export default Header;
