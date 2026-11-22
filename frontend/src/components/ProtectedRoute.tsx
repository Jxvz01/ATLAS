import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore, UserRole } from '../store/authStore';

export interface ProtectedRouteProps {
  allowedRoles: UserRole[];
  redirectPath?: string;
  children?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  allowedRoles, 
  redirectPath = '/', 
  children 
}) => {
  const { role, isAuthenticated } = useAuthStore();

  if (!isAuthenticated || !role || !allowedRoles.includes(role)) {
    return <Navigate to={redirectPath} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default ProtectedRoute;
