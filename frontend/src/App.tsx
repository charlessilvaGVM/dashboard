import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import Login from '@/pages/Login';
import Dashboards from '@/pages/Dashboards';
import DashboardCreate from '@/pages/DashboardCreate';
import DashboardView from '@/pages/DashboardView';
import Users from '@/pages/Users';
import UserCreate from '@/pages/UserCreate';
import LogsPage from '@/pages/LogsPage';
import ConnectionsPage from '@/pages/ConnectionsPage';
import NotFound from '@/pages/NotFound';
import { getToken, isAdmin } from '@/services/api';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  if (!isAdmin())  return <Navigate to="/dashboards" replace />;
  return <>{children}</>;
}

function RootRedirect() {
  return <Navigate to={getToken() ? '/dashboards' : '/login'} replace />;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />

        <Route path="/dashboards" element={<PrivateRoute><Dashboards /></PrivateRoute>} />
        <Route path="/dashboards/:id" element={<PrivateRoute><DashboardView /></PrivateRoute>} />

        <Route path="/dashboards/new"      element={<AdminRoute><DashboardCreate /></AdminRoute>} />
        <Route path="/dashboards/:id/edit" element={<AdminRoute><DashboardCreate /></AdminRoute>} />

        <Route path="/users"          element={<AdminRoute><Users /></AdminRoute>} />
        <Route path="/users/new"      element={<AdminRoute><UserCreate /></AdminRoute>} />
        <Route path="/users/:id/edit" element={<AdminRoute><UserCreate /></AdminRoute>} />

        <Route path="/logs"        element={<AdminRoute><LogsPage /></AdminRoute>} />
        <Route path="/connections" element={<AdminRoute><ConnectionsPage /></AdminRoute>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </>
  );
}
