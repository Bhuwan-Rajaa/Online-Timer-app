import { Outlet, Link, useLocation } from 'react-router-dom';

export const Layout = () => {
  const location = useLocation();

  const navLinkStyle = (path: string) => ({
    textDecoration: 'none',
    color: location.pathname === path ? 'var(--text-primary)' : 'var(--text-secondary)',
    fontWeight: location.pathname === path ? '600' : '400',
    borderBottom: location.pathname === path ? '2px solid var(--accent-primary)' : '2px solid transparent',
    padding: '0.5rem 0',
    transition: 'all 0.2s',
  });

  return (
    <div className="container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '1rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <div style={{ fontWeight: 'bold', letterSpacing: '2px', color: 'var(--text-secondary)' }}>
            TIMER<span style={{ color: 'var(--accent-primary)' }}>.IO</span>
          </div>
        </Link>
        
        <nav style={{ display: 'flex', gap: '2rem' }}>
          <Link to="/" style={navLinkStyle('/')}>Hub</Link>
          <Link to="/leaderboard" style={navLinkStyle('/leaderboard')}>Leaderboard</Link>
          <Link to="/profile" style={navLinkStyle('/profile')}>Vault</Link>
        </nav>
      </header>
      
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
    </div>
  );
};
