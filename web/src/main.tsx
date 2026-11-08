import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
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

const router = createBrowserRouter([
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
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LiveProvider>
      <RouterProvider router={router} />
    </LiveProvider>
  </StrictMode>,
);
