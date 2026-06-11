import { type RouteObject } from 'react-router-dom';
import AuthGuard from '../components/AuthGuard';
import LayoutRouter from '../components/LayoutRouter';
import LoginPage from '../pages/Login';
import RegisterPage from '../pages/Register';
import HomePage from '../pages/Home';
import DocsPage from '../pages/Docs';
import KnowledgeBasePage from '../pages/KnowledgeBase';
import QAPage from '../pages/QA';
import SearchErrorsPage from '../pages/SearchErrors';
import OutlineNotesPage from '../pages/OutlineNotes';
import StudyStatsPage from '../pages/StudyStats';
import AdminPage from '../pages/Admin';
import NotFoundPage from '../pages/NotFound';

const routes: RouteObject[] = [
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/',
    element: (
      <AuthGuard>
        <LayoutRouter />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'docs', element: <DocsPage /> },
      { path: 'knowledge-base', element: <KnowledgeBasePage /> },
      { path: 'qa', element: <QAPage /> },
      { path: 'search-errors', element: <SearchErrorsPage /> },
      { path: 'outline-notes', element: <OutlineNotesPage /> },
      { path: 'study-stats', element: <StudyStatsPage /> },
      { path: 'admin', element: <AdminPage /> },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
];

export default routes;
