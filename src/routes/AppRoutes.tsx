import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, Link } from 'react-router-dom';
import { useAppSelector } from '../store';
import { AppLayout } from '../layouts/AppLayout';
const AuthPage = lazy(() =>
  import('../pages/AuthPage').then((module) => ({ default: module.AuthPage })),
);
const DashboardPage = lazy(() =>
  import('../pages/DashboardPage').then((module) => ({ default: module.DashboardPage })),
);
const ReminderPage = lazy(() =>
  import('../pages/ReminderPage').then((module) => ({ default: module.ReminderPage })),
);
const ProfilePage = lazy(() =>
  import('../pages/ProfilePage').then((module) => ({ default: module.ProfilePage })),
);

function ProtectedRoute() {
  const { user, ready, recovery } = useAppSelector((state) => state.auth);
  if (!ready)
    return (
      <div className="app-loading" role="status">
        <span className="spinner" />
        Opening your space…
      </div>
    );
  if (!user || recovery) return <Navigate to="/auth" replace />;
  return <Outlet />;
}
export function AppRoutes() {
  return (
    <Suspense
      fallback={
        <div className="loading-state" role="status">
          <span className="spinner" />
          Opening your space…
        </div>
      }
    >
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="reminders/new" element={<ReminderPage />} />
            <Route path="reminders/:id/edit" element={<ReminderPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route
              path="*"
              element={
                <div className="empty-state">
                  <h1>Page not found</h1>
                  <Link className="button primary" to="/">
                    Back to reminders
                  </Link>
                </div>
              }
            />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
