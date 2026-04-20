import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Server, CheckCircle2, XCircle, Loader2, PlugZap } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  getConnections, createConnection, updateConnection, deleteConnection, testConnection,
  type DbConnection,
} from '@/services/api';
import { toast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface FormState {
  nome: string; host: string; port: string;
  database: string; user: string; password: string; ativo: boolean;
}

const emptyForm = (): FormState => ({ nome: '', host: '', port: '3306', database: '', user: '', password: '', ativo: true });

const inputSt: React.CSSProperties = {
  width: '100%', padding: '0.35rem 0.6rem', borderRadius: '0.375rem',
  border: '1px solid hsl(var(--border))', fontSize: '0.875rem',
  background: 'hsl(var(--background))', color: 'hsl(var(--foreground))',
  outline: 'none', height: '2.25rem', boxSizing: 'border-box',
};

export default function ConnectionsPage() {
  const qc = useQueryClient();

  const [editTarget,   setEditTarget]   = useState<DbConnection | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DbConnection | null>(null);
  const [formOpen,     setFormOpen]     = useState(false);
  const [form,         setForm]         = useState<FormState>(emptyForm());
  const [testResult,   setTestResult]   = useState<Record<number, { ok: boolean; message: string } | null>>({});
  const [testingId,    setTestingId]    = useState<number | null>(null);

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ['connections'],
    queryFn: getConnections,
  });

  const createMut = useMutation({
    mutationFn: createConnection,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connections'] });
      toast({ title: 'Conexão criada!' });
      setFormOpen(false);
    },
    onError: (err: Error) => toast({ variant: 'destructive', title: 'Erro', description: err.message }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateConnection>[1] }) =>
      updateConnection(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connections'] });
      toast({ title: 'Conexão atualizada!' });
      setFormOpen(false);
      setEditTarget(null);
    },
    onError: (err: Error) => toast({ variant: 'destructive', title: 'Erro', description: err.message }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteConnection(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connections'] });
      toast({ title: 'Conexão excluída' });
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast({ variant: 'destructive', title: 'Erro', description: err.message }),
  });

  const openNew = () => { setForm(emptyForm()); setEditTarget(null); setFormOpen(true); };
  const openEdit = (c: DbConnection) => {
    setForm({ nome: c.nome, host: c.host, port: String(c.port), database: c.database, user: c.user, password: '', ativo: c.ativo === 1 });
    setEditTarget(c);
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!form.nome || !form.host || !form.database || !form.user)
      return toast({ variant: 'destructive', title: 'Preencha nome, host, database e user' });

    const data = {
      nome: form.nome, host: form.host,
      port: parseInt(form.port) || 3306,
      database: form.database, user: form.user,
      password: form.password, ativo: form.ativo,
    };
    if (editTarget) {
      updateMut.mutate({ id: editTarget.id, data });
    } else {
      createMut.mutate(data);
    }
  };

  const handleTest = async (id: number) => {
    setTestingId(id);
    setTestResult(r => ({ ...r, [id]: null }));
    try {
      const res = await testConnection(id);
      setTestResult(r => ({ ...r, [id]: res }));
    } catch (err: unknown) {
      setTestResult(r => ({ ...r, [id]: { ok: false, message: err instanceof Error ? err.message : 'Erro' } }));
    } finally {
      setTestingId(null);
    }
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <AppLayout title="Conexões de Banco">
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Conexões de Banco</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Gerencie conexões MySQL adicionais para os dashboards
            </p>
          </div>
          <Button className="gap-2" onClick={openNew}>
            <Plus className="h-4 w-4" />
            Nova Conexão
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />Carregando...
              </div>
            )}

            {!isLoading && connections.length === 0 && (
              <div className="py-16 text-center text-muted-foreground">
                <Server className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Nenhuma conexão cadastrada</p>
                <p className="text-sm mt-1">Adicione conexões para que os dashboards possam usar bancos de dados diferentes.</p>
              </div>
            )}

            {!isLoading && connections.length > 0 && (
              <table className="min-w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Nome</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Host / Porta</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Banco</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Usuário</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Teste</th>
                    <th className="px-4 py-3 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {connections.map((c, idx) => {
                    const tr = testResult[c.id];
                    return (
                      <tr key={c.id} className={`border-b hover:bg-muted/30 transition-colors ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}>
                        <td className="px-4 py-2.5 font-medium">{c.nome}</td>
                        <td className="px-4 py-2.5 font-mono text-xs">{c.host}:{c.port}</td>
                        <td className="px-4 py-2.5 font-mono text-xs">{c.database}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{c.user}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant={c.ativo ? 'default' : 'secondary'} className="text-xs">
                            {c.ativo ? 'Ativa' : 'Inativa'}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleTest(c.id)}
                              disabled={testingId === c.id}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                padding: '0.2rem 0.6rem', borderRadius: '0.375rem',
                                fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer',
                                border: '1px solid hsl(var(--border))',
                                background: 'hsl(var(--background))',
                                color: 'hsl(var(--foreground))',
                              }}
                            >
                              {testingId === c.id
                                ? <Loader2 style={{ width: '0.75rem', height: '0.75rem' }} className="animate-spin" />
                                : <PlugZap style={{ width: '0.75rem', height: '0.75rem' }} />}
                              Testar
                            </button>
                            {tr !== undefined && tr !== null && (
                              tr.ok
                                ? <span title={tr.message}><CheckCircle2 className="h-4 w-4 text-green-500" /></span>
                                : <span title={tr.message}><XCircle className="h-4 w-4 text-destructive" /></span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(c)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={open => { if (!open) { setFormOpen(false); setEditTarget(null); } }}>
        <DialogContent style={{ maxWidth: '500px' }}>
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar Conexão' : 'Nova Conexão'}</DialogTitle>
          </DialogHeader>
          <div style={{ display: 'grid', gap: '0.875rem', padding: '0.25rem 0' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Nome <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input style={inputSt} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: BD Produção" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  Host <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input style={inputSt} value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} placeholder="127.0.0.1" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.25rem' }}>Porta</label>
                <input style={inputSt} type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} placeholder="3306" />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Banco de Dados <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input style={inputSt} value={form.database} onChange={e => setForm(f => ({ ...f, database: e.target.value }))} placeholder="nome_do_banco" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  Usuário <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input style={inputSt} value={form.user} onChange={e => setForm(f => ({ ...f, user: e.target.value }))} placeholder="root" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  Senha {editTarget && <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 400 }}>(deixe em branco para manter)</span>}
                </label>
                <input style={inputSt} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={editTarget ? '••••••••' : 'senha'} />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>
              <input type="checkbox" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))}
                style={{ width: '1rem', height: '1rem', accentColor: '#2563eb', cursor: 'pointer' }} />
              Conexão ativa
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setFormOpen(false); setEditTarget(null); }}>Cancelar</Button>
            <Button disabled={isSaving} onClick={handleSave}>
              {isSaving ? 'Salvando...' : (editTarget ? 'Salvar' : 'Criar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Conexão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>"{deleteTarget?.nome}"</strong>? Dashboards que usam esta conexão passarão a usar a conexão padrão.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}>
              {deleteMut.isPending ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
