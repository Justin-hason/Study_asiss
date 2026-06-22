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
import PracticePage from '../pages/Practice';
import AdminPage from '../pages/Admin';
import MyDocsPage from '../pages/MyDocs';
import KnowledgeReportsPage from '../pages/KnowledgeReports';
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
      {
        path: 'docs',
        element: (
          <AuthGuard allowedRoles={['admin', 'auditor']}>
            <DocsPage />
          </AuthGuard>
        ),
      },
      { path: 'knowledge-base', element: <KnowledgeBasePage /> },
      { path: 'my-docs', element: <MyDocsPage /> },
      { path: 'knowledge-reports', element: <KnowledgeReportsPage /> },
      { path: 'qa', element: <QAPage /> },
      { path: 'search-errors', element: <SearchErrorsPage /> },
      { path: 'outline-notes', element: <OutlineNotesPage /> },
      { path: 'study-stats', element: <StudyStatsPage /> },
      { path: 'practice', element: <PracticePage /> },
      {
        path: 'admin',
        element: (
          <AuthGuard allowedRoles={['admin']}>
            <AdminPage />
          </AuthGuard>
        ),
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
];

export default routes;
