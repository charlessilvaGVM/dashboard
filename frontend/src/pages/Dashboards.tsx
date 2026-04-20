import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Eye, Pencil, Trash2, LayoutDashboard, Calendar, Clock, AlertCircle,
  Search, ArrowUpAZ, ArrowDownAZ, ArrowUpDown, X,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { getDashboards, deleteDashboard, isAdmin, type Dashboard } from '@/services/api';
import { toast } from '@/hooks/use-toast';

function SkeletonCard() {
  return (
    <Card className="animate-pulse">
      <CardHeader>
        <div className="h-5 bg-muted rounded w-3/4" />
        <div className="h-4 bg-muted rounded w-1/2 mt-2" />
      </CardHeader>
      <CardContent>
        <div className="h-4 bg-muted rounded w-full mb-2" />
        <div className="h-4 bg-muted rounded w-2/3" />
      </CardContent>
    </Card>
  );
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export default function Dashboards() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const admin    = isAdmin();
  const [deleteTarget, setDeleteTarget] = useState<Dashboard | null>(null);
  const [search,    setSearch]    = useState('');
  type SortKey = 'name_asc' | 'name_desc' | 'date_desc' | 'date_asc';
  const [sortKey, setSortKey] = useState<SortKey>('date_desc');

  const { data: dashboards, isLoading, error } = useQuery({
    queryKey: ['dashboards'],
    queryFn: getDashboards,
  });

  const filteredDashboards = useMemo(() => {
    if (!dashboards) return [];
    let list = dashboards;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        d.nome.toLowerCase().includes(q) ||
        (d.descricao || '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (sortKey === 'name_asc')   return a.nome.localeCompare(b.nome, 'pt-BR');
      if (sortKey === 'name_desc')  return b.nome.localeCompare(a.nome, 'pt-BR');
      if (sortKey === 'date_asc')   return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [dashboards, search, sortKey]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteDashboard(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      toast({ title: 'Dashboard excluído', description: 'O dashboard foi removido com sucesso.' });
      setDeleteTarget(null);
    },
    onError: (err: Error) => {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    },
  });

  const handleDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget.id);
    }
  };

  return (
    <AppLayout title="Meus Dashboards">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Meus Dashboards</h1>
            <p className="text-muted-foreground mt-1">
              {filteredDashboards.length !== (dashboards?.length ?? 0)
                ? `${filteredDashboards.length} de ${dashboards?.length ?? 0} dashboards`
                : `${dashboards?.length ?? 0} dashboard${dashboards?.length !== 1 ? 's' : ''} cadastrado${dashboards?.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          {admin && (
            <Button asChild className="gap-2 shadow-sm">
              <Link to="/dashboards/new">
                <Plus className="h-4 w-4" />
                Novo Dashboard
              </Link>
            </Button>
          )}
        </div>

        {/* Search + Sort */}
        {!isLoading && !error && (dashboards?.length ?? 0) > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: '360px' }}>
              <Search style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', width: '0.875rem', height: '0.875rem', color: '#9ca3af', pointerEvents: 'none' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar dashboards..."
                style={{
                  width: '100%', paddingLeft: '2rem', paddingRight: search ? '2rem' : '0.75rem',
                  height: '2.25rem', borderRadius: '0.5rem',
                  border: '1px solid hsl(var(--border))',
                  background: 'hsl(var(--background))', color: 'hsl(var(--foreground))',
                  fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
                }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                  <X style={{ width: '0.75rem', height: '0.75rem', color: '#9ca3af' }} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 border rounded-lg p-1 bg-muted/30">
              {([
                { key: 'name_asc',   icon: <ArrowUpAZ   className="h-3.5 w-3.5" />, label: 'A-Z' },
                { key: 'name_desc',  icon: <ArrowDownAZ className="h-3.5 w-3.5" />, label: 'Z-A' },
                { key: 'date_desc',  icon: <ArrowUpDown className="h-3.5 w-3.5" />, label: 'Recentes' },
                { key: 'date_asc',   icon: <ArrowUpDown className="h-3.5 w-3.5" style={{ transform: 'scaleY(-1)' }} />, label: 'Antigos' },
              ] as { key: SortKey; icon: React.ReactNode; label: string }[]).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setSortKey(opt.key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                    sortKey === opt.key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.icon}{opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="font-medium">Erro ao carregar dashboards</p>
              <p className="text-sm opacity-80">{(error as Error).message}</p>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* No results from filter */}
        {!isLoading && !error && (dashboards?.length ?? 0) > 0 && filteredDashboards.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="font-medium text-foreground">Nenhum resultado para "{search}"</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setSearch('')}>Limpar busca</Button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && dashboards?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted mb-4">
              <LayoutDashboard className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum dashboard ainda</h3>
            <p className="text-muted-foreground mb-6 max-w-sm">
              Crie seu primeiro dashboard para começar a visualizar seus dados.
            </p>
            <Button asChild className="gap-2">
              <Link to="/dashboards/new">
                <Plus className="h-4 w-4" />
                Criar Dashboard
              </Link>
            </Button>
          </div>
        )}

        {/* Dashboard grid */}
        {!isLoading && !error && filteredDashboards.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredDashboards.map((dashboard) => (
              <Card
                key={dashboard.id}
                className="group hover:shadow-md transition-shadow cursor-pointer border hover:border-primary/30"
                onClick={() => navigate(`/dashboards/${dashboard.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base font-semibold truncate group-hover:text-primary transition-colors">
                        {dashboard.nome}
                      </CardTitle>
                    </div>
                    <Badge variant="secondary" className="text-xs flex-shrink-0">
                      SQL
                    </Badge>
                  </div>
                  {dashboard.descricao && (
                    <CardDescription className="line-clamp-2 mt-1">
                      {dashboard.descricao}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent className="pt-0">
                  {/* SQL preview */}
                  <div className="p-2 rounded bg-muted/60 mb-3">
                    <code className="text-xs text-muted-foreground font-mono line-clamp-2 break-all">
                      {dashboard.sql_query}
                    </code>
                  </div>

                  {/* Dates */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(dashboard.created_at)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Atualizado {formatDate(dashboard.updated_at)}
                    </span>
                  </div>

                  {/* Actions */}
                  <div
                    className="flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1 gap-1.5 h-8 text-xs"
                      onClick={() => navigate(`/dashboards/${dashboard.id}`)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Visualizar
                    </Button>
                    {admin && (
                      <>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => navigate(`/dashboards/${dashboard.id}/edit`)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                          onClick={() => setDeleteTarget(dashboard)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Dashboard</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o dashboard{' '}
              <strong>"{deleteTarget?.nome}"</strong>? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
