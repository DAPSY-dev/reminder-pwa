import { NavLink, Outlet } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { InstallButton } from '../components/InstallButton';
import { useAppSelector } from '../store';
import { useOnline } from '../hooks/useOnline';

export function AppLayout() {
  const user = useAppSelector((state) => state.auth.user);
  const profile = useAppSelector((state) => state.auth.profile);
  const online = useOnline();
  const username =
    profile?.username ??
    (typeof user?.user_metadata.username === 'string'
      ? user.user_metadata.username
      : (user?.email?.split('@')[0] ?? 'You'));
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <NavLink className="brand" to="/">
          <span className="brand-icon">
            <Icon name="bell" size={23} />
          </span>
          reminder<span className="brand-dot">.</span>
        </NavLink>
        <p className="nav-label">YOUR SPACE</p>
        <nav aria-label="Main navigation">
          <NavLink to="/" end>
            <Icon name="grid" />
            Reminders
          </NavLink>
          <NavLink to="/profile">
            <Icon name="user" />
            Profile
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <InstallButton />
          <div className="sidebar-note">
            <span className="little-spark">✳</span>
            <p>
              A little less to
              <br />
              keep in mind.
            </p>
          </div>
          <NavLink to="/profile" className="account">
            <span className="avatar">{username.slice(0, 1).toUpperCase()}</span>
            <span>
              <strong>{username}</strong>
              <small>Your personal space</small>
            </span>
            <Icon name="chevron" size={15} />
          </NavLink>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <span>Your day, a little lighter.</span>
          <div>
            <span className={`connection-dot ${online ? '' : 'offline'}`} />
            {online ? 'Connected to your account' : 'You’re offline'}
          </div>
        </header>
        {!online && (
          <div className="offline-banner" role="status">
            <Icon name="wifi" />
            You’re offline. Connect to load or change your reminders. Push delivery needs a
            connection.
          </div>
        )}
        <main className="page-container">
          <Outlet key={user?.id} />
        </main>
        <footer className="page-footer">
          <span>Made for a little peace of mind.</span>
          <span>REMINDER · V1</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <NavLink to="/" end>
          <Icon name="grid" />
          Reminders
        </NavLink>
        <NavLink to="/reminders/new">
          <Icon name="plus" />
          Add reminder
        </NavLink>
        <NavLink to="/profile">
          <Icon name="user" />
          Profile
        </NavLink>
      </nav>
    </div>
  );
}
