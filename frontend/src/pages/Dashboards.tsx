import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Eye, Pencil, Trash2, LayoutDashboard, Calendar, Clock, AlertCircle,
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

  const { data: dashboards, isLoading, error } = useQuery({
    queryKey: ['dashboards'],
    queryFn: getDashboards,
  });

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Meus Dashboards</h1>
            <p className="text-muted-foreground mt-1">
              {dashboards?.length ?? 0} dashboard{dashboards?.length !== 1 ? 's' : ''} cadastrado{dashboards?.length !== 1 ? 's' : ''}
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
        {!isLoading && !error && dashboards && dashboards.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {dashboards.map((dashboard) => (
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
