import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Users as UsersIcon, ShieldCheck, User, AlertCircle } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getUsers, deleteUser, type UserRecord } from '@/services/api';
import { toast } from '@/hooks/use-toast';

export default function Users() {
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);

  const { data: users, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'Usuário excluído', description: 'O usuário foi removido com sucesso.' });
      setDeleteTarget(null);
    },
    onError: (err: Error) => {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    },
  });

  return (
    <AppLayout title="Usuários">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Usuários</h1>
            <p className="text-muted-foreground mt-1">
              {users?.length ?? 0} usuário{users?.length !== 1 ? 's' : ''} cadastrado{users?.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button className="gap-2" onClick={() => navigate('/users/new')}>
            <Plus className="h-4 w-4" />
            Novo Usuário
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <p className="font-medium">{(error as Error).message}</p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && users?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted mb-4">
              <UsersIcon className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Nenhum usuário cadastrado</h3>
            <Button className="gap-2 mt-4" onClick={() => navigate('/users/new')}>
              <Plus className="h-4 w-4" /> Criar Usuário
            </Button>
          </div>
        )}

        {/* List */}
        {!isLoading && !error && users && users.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Usuário</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Nome</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Nível</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, idx) => (
                    <tr key={u.id} className={`border-b hover:bg-muted/40 transition-colors ${idx % 2 === 1 ? 'bg-muted/20' : ''}`}>
                      <td className="px-4 py-3 font-mono font-medium">{u.usuario}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.nome || '—'}</td>
                      <td className="px-4 py-3">
                        {u.nivel === 'admin' ? (
                          <Badge className="gap-1 bg-violet-100 text-violet-700 hover:bg-violet-100 border-violet-200">
                            <ShieldCheck className="h-3 w-3" /> Admin
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <User className="h-3 w-3" /> Usuário
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.ativo ? (
                          <span className="flex items-center gap-1.5 text-green-600 text-xs font-medium">
                            <span className="h-2 w-2 rounded-full bg-green-500" /> Ativo
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
                            <span className="h-2 w-2 rounded-full bg-muted-foreground/40" /> Inativo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => navigate(`/users/${u.id}/edit`)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                            onClick={() => setDeleteTarget(u)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Usuário</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o usuário <strong>"{deleteTarget?.usuario}"</strong>?
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
