import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut, Menu, X, BarChart2, ChevronRight, Users, ShieldCheck, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getUser, removeToken, isAdmin, logoutApi } from '@/services/api';
import { queryClient } from '@/lib/queryClient';
import { useTheme } from '@/hooks/use-theme';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboards',     path: '/dashboards',     icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: 'Usuários',       path: '/users',          icon: <Users className="h-5 w-5" />, adminOnly: true },
];

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const location    = useLocation();
  const navigate    = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const user        = getUser();
  const admin       = isAdmin();
  const { theme, toggle } = useTheme();

  const handleLogout = async () => {
    // M3 — Revogar token no backend antes de limpar localmente
    try { await logoutApi(); } catch { /* token pode já ter expirado */ }
    removeToken();
    queryClient.clear();
    navigate('/login');
  };

  const visibleItems = navItems.filter(item => !item.adminOnly || admin);

  const Sidebar = () => (
    <div className="flex h-full flex-col bg-[hsl(222.2,84%,4.9%)] text-white">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
          <BarChart2 className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="font-bold text-base leading-tight text-white">GVM</p>
          <p className="text-xs text-white/60 leading-tight">Dashboard</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        <p className="px-3 py-2 text-xs font-semibold text-white/40 uppercase tracking-wider">Menu</p>
        {visibleItems.map(item => {
          const isActive = item.path === '/dashboards'
            ? location.pathname === '/dashboards'
            : location.pathname.startsWith(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              )}
            >
              {item.icon}
              <span>{item.label}</span>
              {isActive && <ChevronRight className="ml-auto h-4 w-4 opacity-70" />}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="px-3 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/30 text-sm font-semibold">
            {user?.usuario?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.usuario || 'Usuário'}</p>
            <div className="flex items-center gap-1 mt-0.5">
              {admin
                ? <><ShieldCheck className="h-3 w-3 text-violet-400" /><span className="text-xs text-violet-400">Admin</span></>
                : <span className="text-xs text-white/50">Conectado</span>}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="w-full justify-start gap-3 text-white/70 hover:text-white hover:bg-white/10"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-shrink-0 lg:flex-col">
        <Sidebar />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Mobile sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-60 flex-col transition-transform duration-300 lg:hidden',
        sidebarOpen ? 'flex translate-x-0' : 'flex -translate-x-full'
      )}>
        <Sidebar />
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-4 border-b bg-background px-4 lg:px-6 flex-shrink-0">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BarChart2 className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">{title || 'GVM Dashboard'}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span>{user?.usuario || 'Usuário'}</span>
              {admin && <span className="text-xs text-violet-500 font-medium">(admin)</span>}
            </div>
            <Button
              variant="ghost" size="icon"
              onClick={toggle}
              title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            >
              {theme === 'dark'
                ? <Sun className="h-4 w-4 text-yellow-400" />
                : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-muted/30 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
