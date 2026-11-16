import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router-dom';
import './styles.css';
import { LiveProvider } from './lib/live';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Applications } from './pages/Applications';
import { JobWorkspace } from './pages/JobWorkspace';
import { ProfilePage } from './pages/Profile';
import { Resumes } from './pages/Resumes';
import { PrintResume } from './pages/PrintResume';
import { SettingsPage } from './pages/Settings';
import { KeyHelpPage } from './pages/KeyHelp';
import { startSession } from './lib/session';
import { applyTheme } from './lib/theme';
import { LoginPage } from './pages/Login';
import { SignupPage } from './pages/Signup';
import { HomePage } from './pages/Home';
import { AuthLinkPage } from './pages/AuthLink';
import { NotFoundPage } from './pages/NotFound';
import { auth, type AuthUser } from './lib/auth';
import { AuthContext } from './lib/useAuth';

startSession();
applyTheme();

/** Everything inside needs a signed-in user; otherwise go to sign-in and come back afterwards. */
function RequireAuth() {
  const loc = useLocation();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  useEffect(() => {
    auth.me().then(setUser).catch(() => setUser(null));
  }, []);
  if (user === undefined) return null; // checking; a blank frame is shorter than a flash of the sign-in page
  // signed-out visitors to the root see the public home page; anywhere else goes to sign-in
  if (!user && loc.pathname === '/') return <HomePage />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return (
    <AuthContext.Provider value={user}>
      <LiveProvider>
        <Outlet />
      </LiveProvider>
    </AuthContext.Provider>
  );
}

const router = createBrowserRouter([
  {
    errorElement: <NotFoundPage />,
    children: [
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/auth/link', element: <AuthLinkPage /> },
  {
    element: <RequireAuth />,
    children: [
  { path: '/print/:file', element: <PrintResume /> },
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/applications', element: <Applications /> },
      { path: '/jobs/:id', element: <JobWorkspace /> },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/resumes', element: <Resumes /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/help/api-keys', element: <KeyHelpPage /> },
    ],
  },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
