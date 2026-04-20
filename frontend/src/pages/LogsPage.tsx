import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Trash2, RefreshCw, Activity, Clock, Database, User } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getLogs, clearLogs, type ExecutionLog } from '@/services/api';
import { toast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

function fmt(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtDate(s: string): string {
  try {
    return new Date(s).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return s; }
}

const PAGE_LIMIT = 50;

export default function LogsPage() {
  const qc = useQueryClient();
  const [dashboard, setDashboard] = useState('');
  const [usuario,   setUsuario]   = useState('');
  const [dtIni,     setDtIni]     = useState('');
  const [dtFim,     setDtFim]     = useState('');
  const [page,      setPage]      = useState(1);
  const [clearOpen, setClearOpen] = useState(false);

  const [appliedFilters, setAppliedFilters] = useState({ dashboard: '', usuario: '', dt_ini: '', dt_fim: '' });

  const { data, isLoading, error } = useQuery({
    queryKey: ['logs', appliedFilters, page],
    queryFn: () => getLogs({ ...appliedFilters, page, limit: PAGE_LIMIT }),
  });

  const clearMutation = useMutation({
    mutationFn: clearLogs,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['logs'] });
      toast({ title: 'Logs apagados', description: 'Todos os logs foram removidos.' });
      setClearOpen(false);
    },
    onError: (err: Error) => toast({ variant: 'destructive', title: 'Erro', description: err.message }),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setAppliedFilters({ dashboard, usuario, dt_ini: dtIni, dt_fim: dtFim });
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_LIMIT)) : 1;

  const inputSt: React.CSSProperties = {
    padding: '0.35rem 0.6rem', borderRadius: '0.375rem',
    border: '1px solid hsl(var(--border))', fontSize: '0.875rem',
    background: 'hsl(var(--background))', color: 'hsl(var(--foreground))',
    outline: 'none', height: '2.25rem',
  };

  return (
    <AppLayout title="Logs de Execução">
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Logs de Execução</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {data ? `${data.total.toLocaleString('pt-BR')} execuções registradas` : 'Carregando...'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => qc.invalidateQueries({ queryKey: ['logs'] })}>
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar
            </Button>
            <Button variant="destructive" size="sm" className="gap-2" onClick={() => setClearOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              Limpar tudo
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '180px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 500, color: 'hsl(var(--muted-foreground))' }}>Dashboard</label>
                <input style={inputSt} value={dashboard} onChange={e => setDashboard(e.target.value)} placeholder="Filtrar por dashboard..." />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '150px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 500, color: 'hsl(var(--muted-foreground))' }}>Usuário</label>
                <input style={inputSt} value={usuario} onChange={e => setUsuario(e.target.value)} placeholder="Filtrar por usuário..." />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 500, color: 'hsl(var(--muted-foreground))' }}>De</label>
                <input style={inputSt} type="date" value={dtIni} onChange={e => setDtIni(e.target.value)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 500, color: 'hsl(var(--muted-foreground))' }}>Até</label>
                <input style={inputSt} type="date" value={dtFim} onChange={e => setDtFim(e.target.value)} />
              </div>
              <Button type="submit" size="sm" className="gap-2" style={{ height: '2.25rem' }}>
                <Search className="h-3.5 w-3.5" />
                Buscar
              </Button>
              <Button type="button" variant="outline" size="sm" style={{ height: '2.25rem' }}
                onClick={() => { setDashboard(''); setUsuario(''); setDtIni(''); setDtFim(''); setPage(1); setAppliedFilters({ dashboard: '', usuario: '', dt_ini: '', dt_fim: '' }); }}>
                Limpar
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />
              Execuções
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <svg className="animate-spin h-6 w-6 text-primary mr-2" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Carregando...
              </div>
            )}
            {error && (
              <div className="p-4 text-destructive text-sm">
                Erro ao carregar logs: {(error as Error).message}
              </div>
            )}
            {!isLoading && data && (
              <>
                <div className="overflow-auto">
                  <table className="min-w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">
                          <div className="flex items-center gap-1.5"><Database className="h-3.5 w-3.5" />Dashboard</div>
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">
                          <div className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />Usuário</div>
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">
                          <div className="flex items-center gap-1.5 justify-end"><Clock className="h-3.5 w-3.5" />Tempo</div>
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">Linhas</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Data/Hora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((log: ExecutionLog, idx: number) => (
                        <tr key={log.id} className={`border-b hover:bg-muted/30 transition-colors ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}>
                          <td className="px-4 py-2.5 text-foreground">
                            {log.dashboard_nome
                              ? <span className="font-medium">{log.dashboard_nome}</span>
                              : <span className="text-muted-foreground italic text-xs">—</span>}
                            {log.dashboard_id && <span className="text-muted-foreground text-xs ml-1.5">#{log.dashboard_id}</span>}
                          </td>
                          <td className="px-4 py-2.5 text-foreground">
                            {log.usuario || <span className="text-muted-foreground italic text-xs">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono">
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                              log.execution_time_ms > 5000 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              : log.execution_time_ms > 1000 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                              : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            }`}>
                              {fmt(log.execution_time_ms)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-sm">
                            {log.row_count.toLocaleString('pt-BR')}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                            {fmtDate(log.executed_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.rows.length === 0 && (
                    <div className="py-12 text-center text-muted-foreground text-sm">
                      Nenhum log encontrado.
                    </div>
                  )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 flex-wrap gap-2">
                    <span className="text-xs text-muted-foreground">
                      Página {page} de {totalPages} · {data.total.toLocaleString('pt-BR')} total
                    </span>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(1)}>«</Button>
                      <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</Button>
                      <span className="px-3 text-sm font-medium">{page}</span>
                      <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</Button>
                      <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(totalPages)}>»</Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Clear confirm */}
      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Limpar todos os logs</DialogTitle>
            <DialogDescription>
              Todos os logs de execução serão apagados permanentemente. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearOpen(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={clearMutation.isPending} onClick={() => clearMutation.mutate()}>
              {clearMutation.isPending ? 'Apagando...' : 'Limpar tudo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
