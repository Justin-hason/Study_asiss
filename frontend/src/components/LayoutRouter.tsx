import { useLocation } from 'react-router-dom';
import LayoutWithSidebar from './layout/LayoutWithSidebar';
import LayoutWithHeader from './layout/LayoutWithHeader';

export default function LayoutRouter() {
  const location = useLocation();

  if (location.pathname === '/admin') {
    return <LayoutWithHeader />;
  }

  return <LayoutWithSidebar />;
}
