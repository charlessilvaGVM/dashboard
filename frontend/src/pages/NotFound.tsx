import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="text-center px-4">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/20 mb-6">
          <AlertTriangle className="h-10 w-10 text-amber-500" />
        </div>
        <h1 className="text-7xl font-black text-white mb-2">404</h1>
        <h2 className="text-2xl font-semibold text-slate-300 mb-3">Página não encontrada</h2>
        <p className="text-slate-500 mb-8 max-w-md mx-auto">
          A página que você está procurando não existe ou foi movida.
        </p>
        <Button
          onClick={() => navigate('/dashboards')}
          className="gap-2"
          size="lg"
        >
          <Home className="h-4 w-4" />
          Voltar ao início
        </Button>
      </div>
    </div>
  );
}
