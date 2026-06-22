import type { ReactNode } from 'react';
import { Spin } from 'antd';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../api/auth';

interface AuthGuardProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
}

export default function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const location = useLocation();
  const { currentUser, loading } = useAuth();
  const token = localStorage.getItem('token');

  if (loading) {
    return <Spin fullscreen tip="正在验证登录状态..." />;
  }

  if (!token || !currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
