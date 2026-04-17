import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Database, SlidersHorizontal, Plus, RefreshCw, Trash2, BarChart2, TrendingUp, AreaChart, PieChart, Donut, Ban, Link2, MousePointerClick, FlaskConical, CheckCircle2, XCircle, Info, FileText } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import AttachmentsCard from '@/components/AttachmentsCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  createDashboard, updateDashboard, getDashboard, getDashboards, testQuery,
  extractSqlParams, guessParamType, getParamDefault,
  type DashboardParam, type ParamType, type ChartType, type DashboardLink, type DashboardAction,
} from '@/services/api';
import { toast } from '@/hooks/use-toast';

interface ParamRow   extends DashboardParam   { _id: string; }
interface LinkRow    extends DashboardLink    { _id: string; }
interface ActionRow  extends DashboardAction  { _id: string; }

type TabId = 'sql' | 'grafico' | 'interativo' | 'docs';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'sql',        label: 'SQL & Parâmetros',  icon: <Database className="h-4 w-4" /> },
  { id: 'grafico',    label: 'Gráfico',            icon: <BarChart2 className="h-4 w-4" /> },
  { id: 'interativo', label: 'Drill-down & Hints', icon: <Link2 className="h-4 w-4" /> },
  { id: 'docs',       label: 'Documentação',       icon: <FileText className="h-4 w-4" /> },
];

const CHART_OPTIONS: { value: ChartType; label: string; icon: React.ReactNode; preview: React.ReactNode }[] = [
  {
    value: 'bar', label: 'Barras',
    icon: <BarChart2 style={{ width: '1.25rem', height: '1.25rem' }} />,
    preview: (
      <svg viewBox="0 0 60 40" style={{ width: '100%', height: '100%' }}>
        {[{x:4,h:28},{x:16,h:18},{x:28,h:34},{x:40,h:14},{x:52,h:24}].map((b,i) => (
          <rect key={i} x={b.x} y={40-b.h} width={10} height={b.h} rx={2} fill={i===2?'#2563eb':'#93c5fd'} />
        ))}
      </svg>
    ),
  },
  {
    value: 'line', label: 'Linha',
    icon: <TrendingUp style={{ width: '1.25rem', height: '1.25rem' }} />,
    preview: (
      <svg viewBox="0 0 60 40" style={{ width: '100%', height: '100%' }}>
        <polyline points="4,32 16,20 28,26 40,10 52,18" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {[4,16,28,40,52].map((x,i)=>(<circle key={i} cx={x} cy={[32,20,26,10,18][i]} r={2.5} fill="#2563eb"/>))}
      </svg>
    ),
  },
  {
    value: 'area', label: 'Área',
    icon: <AreaChart style={{ width: '1.25rem', height: '1.25rem' }} />,
    preview: (
      <svg viewBox="0 0 60 40" style={{ width: '100%', height: '100%' }}>
        <defs>
          <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.4"/>
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02"/>
          </linearGradient>
        </defs>
        <polygon points="4,40 4,30 16,18 28,24 40,8 52,16 52,40" fill="url(#ag)" />
        <polyline points="4,30 16,18 28,24 40,8 52,16" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    value: 'pie', label: 'Pizza',
    icon: <PieChart style={{ width: '1.25rem', height: '1.25rem' }} />,
    preview: (
      <svg viewBox="0 0 60 40" style={{ width: '100%', height: '100%' }}>
        <g transform="translate(30,20)">
          <path d="M0,0 L0,-18 A18,18 0 0,1 17,6 Z" fill="#2563eb"/>
          <path d="M0,0 L17,6 A18,18 0 0,1 -14,12 Z" fill="#60a5fa"/>
          <path d="M0,0 L-14,12 A18,18 0 0,1 0,-18 Z" fill="#93c5fd"/>
        </g>
      </svg>
    ),
  },
  {
    value: 'donut', label: 'Rosca',
    icon: <Donut style={{ width: '1.25rem', height: '1.25rem' }} />,
    preview: (
      <svg viewBox="0 0 60 40" style={{ width: '100%', height: '100%' }}>
        <g transform="translate(30,20)">
          <path d="M0,0 L0,-18 A18,18 0 0,1 17,6 Z" fill="#2563eb"/>
          <path d="M0,0 L17,6 A18,18 0 0,1 -14,12 Z" fill="#60a5fa"/>
          <path d="M0,0 L-14,12 A18,18 0 0,1 0,-18 Z" fill="#93c5fd"/>
          <circle cx="0" cy="0" r="9" fill="white"/>
        </g>
      </svg>
    ),
  },
  {
    value: 'none', label: 'Sem gráfico',
    icon: <Ban style={{ width: '1.25rem', height: '1.25rem' }} />,
    preview: (
      <svg viewBox="0 0 60 40" style={{ width: '100%', height: '100%' }}>
        <line x1="8" y1="8" x2="52" y2="32" stroke="#d1d5db" strokeWidth="3" strokeLinecap="round"/>
        <line x1="52" y1="8" x2="8" y2="32" stroke="#d1d5db" strokeWidth="3" strokeLinecap="round"/>
      </svg>
    ),
  },
];

const PARAM_TYPE_LABELS: Record<ParamType, string> = {
  date: 'Data', string: 'Texto', integer: 'Inteiro', decimal: 'Decimal',
};

function inputTypeFor(type: ParamType): string {
  if (type === 'date') return 'date';
  if (type === 'integer' || type === 'decimal') return 'number';
  return 'text';
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.25rem 0.5rem',
  border: '1px solid #d1d5db', borderRadius: '0.375rem',
  fontSize: '0.875rem', color: '#111827', backgroundColor: '#fff',
  outline: 'none', boxSizing: 'border-box',
};

interface FormErrors { nome?: string; sql_query?: string; }

function validate(nome: string, sql_query: string): FormErrors {
  const e: FormErrors = {};
  if (!nome.trim()) e.nome = 'Nome é obrigatório';
  else if (nome.length > 255) e.nome = 'Nome muito longo';
  if (!sql_query.trim()) e.sql_query = 'Query SQL é obrigatória';
  else if (!/^\s*SELECT\s+/i.test(sql_query)) e.sql_query = 'Apenas consultas SELECT são permitidas';
  return e;
}

export default function DashboardCreate() {
  const navigate    = useNavigate();
  const { id }      = useParams<{ id?: string }>();
  const isEdit      = !!id;
  const queryClient = useQueryClient();

  const [activeTab,       setActiveTab]       = useState<TabId>('sql');
  const [nome,            setNome]            = useState('');
  const [descricao,       setDescricao]       = useState('');
  const [sqlQuery,        setSqlQuery]        = useState('');
  const [chartSqlEnabled, setChartSqlEnabled] = useState(false);
  const [chartSqlQuery,   setChartSqlQuery]   = useState('');
  const [chartType,       setChartType]       = useState<ChartType>('bar');
  const [paramRows,       setParamRows]       = useState<ParamRow[]>([]);
  const [linkRows,        setLinkRows]        = useState<LinkRow[]>([]);
  const [actionRows,      setActionRows]      = useState<ActionRow[]>([]);
  const [hintRows,        setHintRows]        = useState<{ _id: string; col: string; text: string }[]>([]);
  const [errors,          setErrors]          = useState<FormErrors>({});
  const [touched,         setTouched]         = useState(false);
  const [confirmOpen,     setConfirmOpen]     = useState(false);
  const [pendingPayload,  setPendingPayload]  = useState<ReturnType<typeof buildPayload> | null>(null);
  const [sqlTest,         setSqlTest]         = useState<{ status: 'idle' | 'testing' | 'ok' | 'error'; message?: string }>({ status: 'idle' });
  const [chartSqlTest,    setChartSqlTest]    = useState<{ status: 'idle' | 'testing' | 'ok' | 'error'; message?: string }>({ status: 'idle' });

  const { data: existing, isLoading: loadingDashboard } = useQuery({
    queryKey: ['dashboard', id],
    queryFn: () => getDashboard(Number(id)),
    enabled: isEdit,
  });

  const { data: allDashboards = [] } = useQuery({
    queryKey: ['dashboards'],
    queryFn: getDashboards,
  });

  useEffect(() => {
    if (existing) {
      setNome(existing.nome);
      setDescricao(existing.descricao || '');
      setSqlQuery(existing.sql_query);
      if (existing.chart_sql_query) {
        setChartSqlEnabled(true);
        setChartSqlQuery(existing.chart_sql_query);
      }
      setChartType((existing.chart_type as ChartType) || 'bar');
      setParamRows((existing.params || []).map(p => ({ ...p, _id: Math.random().toString(36).slice(2) })));
      setLinkRows((existing.links || []).map(l => ({ ...l, _id: Math.random().toString(36).slice(2) })));
      setActionRows((existing.actions || []).map(a => ({ ...a, _id: Math.random().toString(36).slice(2) })));
      setHintRows(Object.entries(existing.column_hints || {}).map(([col, text]) => ({
        _id: Math.random().toString(36).slice(2), col, text,
      })));
    }
  }, [existing]);

  // ── test sql ──────────────────────────────────────────────────────────
  const handleTestSql = async () => {
    if (!sqlQuery.trim()) return;
    setSqlTest({ status: 'testing' });
    try {
      const result = await testQuery(sqlQuery.trim());
      setSqlTest(result.valid ? { status: 'ok', message: 'Sintaxe válida' } : { status: 'error', message: result.error || 'Erro de sintaxe' });
    } catch (err: unknown) {
      setSqlTest({ status: 'error', message: err instanceof Error ? err.message : 'Erro ao testar' });
    }
  };

  const handleTestChartSql = async () => {
    if (!chartSqlQuery.trim()) return;
    setChartSqlTest({ status: 'testing' });
    try {
      const result = await testQuery(chartSqlQuery.trim());
      setChartSqlTest(result.valid ? { status: 'ok', message: 'Sintaxe válida' } : { status: 'error', message: result.error || 'Erro de sintaxe' });
    } catch (err: unknown) {
      setChartSqlTest({ status: 'error', message: err instanceof Error ? err.message : 'Erro ao testar' });
    }
  };

  // ── param helpers ─────────────────────────────────────────────────────
  const syncParamsFromSql = () => {
    const detected = extractSqlParams(sqlQuery);
    const existingNames = new Set(paramRows.map(p => p.name));
    const toAdd = detected.filter(n => !existingNames.has(n));
    if (toAdd.length === 0) {
      toast({ title: 'Nenhum parâmetro novo', description: 'Todos os @params do SQL já estão na lista.' });
      return;
    }
    setParamRows(prev => [...prev, ...toAdd.map(name => {
      const type = guessParamType(name);
      return { _id: Math.random().toString(36).slice(2), name, label: name.replace(/_/g, ' '), type, defaultValue: getParamDefault(name, type) };
    })]);
  };

  const addParam    = () => setParamRows(prev => [...prev, { _id: Math.random().toString(36).slice(2), name: '', label: '', type: 'string', defaultValue: '' }]);
  const removeParam = (_id: string) => setParamRows(prev => prev.filter(p => p._id !== _id));
  const updateParam = (_id: string, field: keyof ParamRow, value: string) => {
    setParamRows(prev => prev.map(p => {
      if (p._id !== _id) return p;
      const updated = { ...p, [field]: value };
      if (field === 'type') updated.defaultValue = getParamDefault(p.name, value as ParamType);
      return updated;
    }));
  };

  // ── link helpers ──────────────────────────────────────────────────────
  const addLink    = () => setLinkRows(prev => [...prev, { _id: Math.random().toString(36).slice(2), clickColumn: '', valueColumn: '', label: '', sql: '', paramName: '' }]);
  const removeLink = (_id: string) => setLinkRows(prev => prev.filter(l => l._id !== _id));
  const updateLink = (_id: string, field: keyof LinkRow, value: string) =>
    setLinkRows(prev => prev.map(l => l._id !== _id ? l : { ...l, [field]: value }));

  // ── hint helpers ──────────────────────────────────────────────────────
  const addHint    = () => setHintRows(prev => [...prev, { _id: Math.random().toString(36).slice(2), col: '', text: '' }]);
  const removeHint = (_id: string) => setHintRows(prev => prev.filter(h => h._id !== _id));
  const updateHint = (_id: string, field: 'col' | 'text', value: string) =>
    setHintRows(prev => prev.map(h => h._id !== _id ? h : { ...h, [field]: value }));

  // ── action helpers ────────────────────────────────────────────────────
  const addAction    = () => setActionRows(prev => [...prev, { _id: Math.random().toString(36).slice(2), label: '', sourceColumn: '', targetDashboardId: 0, targetParam: '' }]);
  const removeAction = (_id: string) => setActionRows(prev => prev.filter(a => a._id !== _id));
  const updateAction = (_id: string, field: keyof ActionRow, value: string | number) =>
    setActionRows(prev => prev.map(a => a._id !== _id ? a : { ...a, [field]: value }));

  // ── save ──────────────────────────────────────────────────────────────
  const buildPayload = () => ({
    nome: nome.trim(),
    descricao: descricao.trim() || undefined,
    sql_query: sqlQuery.trim(),
    chart_sql_query: chartSqlEnabled && chartSqlQuery.trim() ? chartSqlQuery.trim() : null,
    chart_type: chartType,
    params: paramRows.filter(p => p.name.trim()).map(({ _id: _, ...p }) => p) as DashboardParam[],
    links: linkRows
      .filter(l => l.clickColumn.trim() && l.valueColumn.trim() && l.sql.trim() && l.paramName.trim())
      .map(({ _id: _, ...l }) => l) as DashboardLink[],
    actions: actionRows
      .filter(a => a.label.trim() && a.sourceColumn.trim() && a.targetDashboardId && a.targetParam.trim())
      .map(({ _id: _, ...a }) => a) as DashboardAction[],
    column_hints: hintRows.filter(h => h.col.trim() && h.text.trim()).length > 0
      ? Object.fromEntries(hintRows.filter(h => h.col.trim() && h.text.trim()).map(h => [h.col.trim(), h.text.trim()]))
      : null,
  });

  const createMutation = useMutation({
    mutationFn: createDashboard,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      toast({ title: 'Dashboard criado!', description: `"${data.nome}" salvo com sucesso.` });
      setConfirmOpen(false);
      setPendingPayload(null);
    },
    onError: (err: Error) => toast({ variant: 'destructive', title: 'Erro ao criar', description: err.message }),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof buildPayload>) => updateDashboard(Number(id), payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
      toast({ title: 'Dashboard salvo!', description: `"${data.nome}" atualizado com sucesso.` });
      setConfirmOpen(false);
      setPendingPayload(null);
    },
    onError: (err: Error) => toast({ variant: 'destructive', title: 'Erro ao salvar', description: err.message }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    const errs = validate(nome, sqlQuery);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      if (errs.sql_query) setActiveTab('sql');
      return;
    }
    setPendingPayload(buildPayload());
    setConfirmOpen(true);
  };

  const handleConfirmSave = () => {
    if (!pendingPayload) return;
    isEdit ? updateMutation.mutate(pendingPayload) : createMutation.mutate(pendingPayload);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isEdit && loadingDashboard) {
    return (
      <AppLayout title="Editar Dashboard">
        <div className="flex items-center justify-center py-20">
          <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </AppLayout>
    );
  }

  // ── tab button style ──────────────────────────────────────────────────
  const tabBtn = (tab: TabId): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.5rem 1rem', borderRadius: '0.5rem 0.5rem 0 0',
    fontSize: '0.875rem', fontWeight: activeTab === tab ? 600 : 400,
    cursor: 'pointer', border: 'none', outline: 'none',
    borderBottom: activeTab === tab ? '2px solid #2563eb' : '2px solid transparent',
    color: activeTab === tab ? '#2563eb' : '#6b7280',
    background: activeTab === tab ? '#eff6ff' : 'transparent',
    transition: 'all 0.15s',
  });

  return (
    <AppLayout title={isEdit ? 'Editar Dashboard' : 'Novo Dashboard'}>
      <div className="max-w-4xl mx-auto space-y-5">

        {/* header */}
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" type="button" onClick={() => navigate('/dashboards')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{isEdit ? 'Editar Dashboard' : 'Novo Dashboard'}</h1>
            <p className="text-muted-foreground text-sm">
              {isEdit ? 'Atualize as informações do dashboard' : 'Configure um novo dashboard de dados'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── informações básicas (fora das abas) ─────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informações Básicas</CardTitle>
              <CardDescription>Nome e descrição do dashboard</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="nome" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500 }}>
                  Nome <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="nome" type="text" autoComplete="off"
                  placeholder="Ex: Vendas por mês"
                  value={nome}
                  onChange={e => { setNome(e.target.value); if (touched) setErrors(p => ({ ...p, nome: undefined })); }}
                  style={{ ...inputStyle, borderColor: errors.nome ? '#ef4444' : '#d1d5db', height: '2.5rem' }}
                />
                {errors.nome && <p style={{ color: '#ef4444', fontSize: '0.75rem' }}>{errors.nome}</p>}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="descricao" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500 }}>Descrição</label>
                <textarea
                  id="descricao" rows={2} placeholder="Descreva o que este dashboard exibe..."
                  value={descricao} onChange={e => setDescricao(e.target.value)}
                  style={{ ...inputStyle, padding: '0.5rem 0.75rem', resize: 'vertical' }}
                />
              </div>
            </CardContent>
          </Card>

          {/* ── abas ────────────────────────────────────────────────────── */}
          <div>
            {/* tab bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', gap: '0.25rem', overflowX: 'auto' }}>
              {TABS.map(t => (
                (t.id === 'docs' && !isEdit) ? null : (
                  <button key={t.id} type="button" style={tabBtn(t.id)} onClick={() => setActiveTab(t.id)}>
                    {t.icon}{t.label}
                  </button>
                )
              ))}
            </div>

            {/* tab content */}
            <div style={{ paddingTop: '1.25rem' }} className="space-y-5">

              {/* ── aba 1: SQL & Parâmetros ───────────────────────────── */}
              {activeTab === 'sql' && <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Database className="h-4 w-4 text-primary" />
                      Query SQL
                    </CardTitle>
                    <CardDescription>
                      Escreva uma consulta SELECT. Use <code className="bg-muted px-1 rounded text-xs">@nome_param</code> para parâmetros dinâmicos.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1.5">
                      <label htmlFor="sql_query" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500 }}>
                        SQL <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <textarea
                        id="sql_query" rows={12}
                        placeholder="SELECT * FROM tabela WHERE data BETWEEN @dt_ini AND @dt_fim"
                        value={sqlQuery}
                        onChange={e => { setSqlQuery(e.target.value); if (touched) setErrors(p => ({ ...p, sql_query: undefined })); setSqlTest({ status: 'idle' }); }}
                        style={{
                          ...inputStyle, padding: '0.75rem', resize: 'vertical',
                          fontFamily: 'monospace', fontSize: '0.875rem',
                          backgroundColor: '#020617', color: '#4ade80',
                          borderColor: errors.sql_query ? '#ef4444' : '#374151',
                        }}
                      />
                      {errors.sql_query && <p style={{ color: '#ef4444', fontSize: '0.75rem' }}>{errors.sql_query}</p>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button
                          type="button" onClick={handleTestSql}
                          disabled={sqlTest.status === 'testing' || !sqlQuery.trim()}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                            padding: '0.35rem 0.85rem', borderRadius: '0.375rem',
                            fontSize: '0.8125rem', fontWeight: 500,
                            cursor: sqlTest.status === 'testing' || !sqlQuery.trim() ? 'not-allowed' : 'pointer',
                            border: '1px solid #d1d5db', background: '#fff', color: '#374151',
                            opacity: !sqlQuery.trim() ? 0.5 : 1, transition: 'all 0.15s',
                          }}
                          onMouseOver={e => { if (sqlQuery.trim()) e.currentTarget.style.background = '#f9fafb'; }}
                          onMouseOut={e => { e.currentTarget.style.background = '#fff'; }}
                        >
                          {sqlTest.status === 'testing'
                            ? <svg className="animate-spin" style={{ width: '0.875rem', height: '0.875rem' }} viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            : <FlaskConical style={{ width: '0.875rem', height: '0.875rem' }} />}
                          {sqlTest.status === 'testing' ? 'Testando...' : 'Testar SQL'}
                        </button>
                        {sqlTest.status === 'ok' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#16a34a', fontSize: '0.8125rem', fontWeight: 500 }}><CheckCircle2 style={{ width: '0.875rem', height: '0.875rem' }} />{sqlTest.message}</span>}
                        {sqlTest.status === 'error' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#dc2626', fontSize: '0.8125rem', fontWeight: 500 }}><XCircle style={{ width: '0.875rem', height: '0.875rem' }} />{sqlTest.message}</span>}
                        {sqlTest.status === 'idle' && <p className="text-xs text-muted-foreground">Apenas SELECT. Use @param_nome para parâmetros dinâmicos.</p>}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <SlidersHorizontal className="h-4 w-4 text-primary" />
                          Parâmetros
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Defina os parâmetros @nome usados na query. O usuário poderá alterá-los no dashboard.
                        </CardDescription>
                      </div>
                      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={syncParamsFromSql}>
                        <RefreshCw className="h-3.5 w-3.5" />
                        Sincronizar do SQL
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {paramRows.length > 0 && (
                      <div className="rounded-lg border overflow-hidden mb-4">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted/40 border-b">
                              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-36">Parâmetro</th>
                              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Label</th>
                              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-32">Tipo</th>
                              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-40">Valor Padrão</th>
                              <th className="w-10" />
                            </tr>
                          </thead>
                          <tbody>
                            {paramRows.map((p, idx) => (
                              <tr key={p._id} className={`border-b last:border-0 ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}>
                                <td className="px-3 py-2">
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                    <span style={{ fontFamily: 'monospace', color: '#2563eb', fontSize: '0.875rem' }}>@</span>
                                    <input type="text" value={p.name} placeholder="nome"
                                      onChange={e => updateParam(p._id, 'name', e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                                      style={{ ...inputStyle, fontFamily: 'monospace', width: '100%' }} />
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <input type="text" placeholder="Ex: Data Inicial" value={p.label}
                                    onChange={e => updateParam(p._id, 'label', e.target.value)} style={inputStyle} />
                                </td>
                                <td className="px-3 py-2">
                                  <select value={p.type} onChange={e => updateParam(p._id, 'type', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                                    {(Object.entries(PARAM_TYPE_LABELS) as [ParamType, string][]).map(([v, l]) => (
                                      <option key={v} value={v}>{l}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-3 py-2">
                                  <input type={inputTypeFor(p.type)} step={p.type === 'decimal' ? '0.01' : p.type === 'integer' ? '1' : undefined}
                                    value={p.defaultValue} onChange={e => updateParam(p._id, 'defaultValue', e.target.value)} style={inputStyle} />
                                </td>
                                <td className="px-2 py-2 text-center">
                                  <button type="button" onClick={() => removeParam(p._id)} className="text-muted-foreground hover:text-destructive transition-colors">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {paramRows.length === 0 && (
                      <p className="text-sm text-muted-foreground mb-4">
                        Nenhum parâmetro definido. Clique em "Sincronizar do SQL" para detectar automaticamente ou adicione manualmente.
                      </p>
                    )}
                    <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addParam}>
                      <Plus className="h-4 w-4" />Adicionar Parâmetro
                    </Button>
                  </CardContent>
                </Card>
              </>}

              {/* ── aba 2: Gráfico ────────────────────────────────────── */}
              {activeTab === 'grafico' && <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Tipo de Gráfico Padrão</CardTitle>
                    <CardDescription>Selecione como os dados serão visualizados por padrão.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.75rem' }}>
                      {CHART_OPTIONS.map(opt => (
                        <button key={opt.value} type="button" onClick={() => setChartType(opt.value)}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            gap: '0.5rem', padding: '0.75rem 0.5rem', borderRadius: '0.625rem',
                            cursor: 'pointer', transition: 'all 0.15s',
                            border: `2px solid ${chartType === opt.value ? '#2563eb' : '#e5e7eb'}`,
                            backgroundColor: chartType === opt.value ? '#eff6ff' : '#fff', outline: 'none',
                          }}>
                          <div style={{ width: '60px', height: '40px' }}>{opt.preview}</div>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.3rem',
                            fontSize: '0.75rem', fontWeight: chartType === opt.value ? 600 : 400,
                            color: chartType === opt.value ? '#2563eb' : '#6b7280',
                          }}>
                            {opt.icon}{opt.label}
                          </div>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <BarChart2 className="h-4 w-4 text-primary" />
                          SQL do Gráfico
                          <span style={{ fontSize: '0.7rem', fontWeight: 400, color: '#6b7280', background: '#f3f4f6', padding: '0.1rem 0.45rem', borderRadius: '0.3rem' }}>opcional</span>
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Se preenchido, o gráfico usará este SQL em vez do principal. A tabela continuará usando o SQL principal.
                        </CardDescription>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none', fontSize: '0.875rem', fontWeight: 500 }}>
                        <input type="checkbox" checked={chartSqlEnabled}
                          onChange={e => { setChartSqlEnabled(e.target.checked); if (!e.target.checked) setChartSqlTest({ status: 'idle' }); }}
                          style={{ width: '1rem', height: '1rem', accentColor: '#2563eb', cursor: 'pointer' }} />
                        Usar SQL separado para o gráfico
                      </label>
                    </div>
                  </CardHeader>
                  {chartSqlEnabled && (
                    <CardContent>
                      <div className="space-y-1.5">
                        <textarea rows={10}
                          placeholder="SELECT categoria, SUM(valor) as total FROM tabela WHERE data BETWEEN @dt_ini AND @dt_fim GROUP BY categoria"
                          value={chartSqlQuery}
                          onChange={e => { setChartSqlQuery(e.target.value); setChartSqlTest({ status: 'idle' }); }}
                          style={{
                            ...inputStyle, padding: '0.75rem', resize: 'vertical',
                            fontFamily: 'monospace', fontSize: '0.875rem',
                            backgroundColor: '#020617', color: '#4ade80', borderColor: '#374151',
                          }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <button type="button" onClick={handleTestChartSql}
                            disabled={chartSqlTest.status === 'testing' || !chartSqlQuery.trim()}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                              padding: '0.35rem 0.85rem', borderRadius: '0.375rem',
                              fontSize: '0.8125rem', fontWeight: 500,
                              cursor: chartSqlTest.status === 'testing' || !chartSqlQuery.trim() ? 'not-allowed' : 'pointer',
                              border: '1px solid #d1d5db', background: '#fff', color: '#374151',
                              opacity: !chartSqlQuery.trim() ? 0.5 : 1, transition: 'all 0.15s',
                            }}
                            onMouseOver={e => { if (chartSqlQuery.trim()) e.currentTarget.style.background = '#f9fafb'; }}
                            onMouseOut={e => { e.currentTarget.style.background = '#fff'; }}>
                            {chartSqlTest.status === 'testing'
                              ? <svg className="animate-spin" style={{ width: '0.875rem', height: '0.875rem' }} viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                              : <FlaskConical style={{ width: '0.875rem', height: '0.875rem' }} />}
                            {chartSqlTest.status === 'testing' ? 'Testando...' : 'Testar SQL'}
                          </button>
                          {chartSqlTest.status === 'ok' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#16a34a', fontSize: '0.8125rem', fontWeight: 500 }}><CheckCircle2 style={{ width: '0.875rem', height: '0.875rem' }} />{chartSqlTest.message}</span>}
                          {chartSqlTest.status === 'error' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#dc2626', fontSize: '0.8125rem', fontWeight: 500 }}><XCircle style={{ width: '0.875rem', height: '0.875rem' }} />{chartSqlTest.message}</span>}
                          {chartSqlTest.status === 'idle' && <p className="text-xs text-muted-foreground">Os mesmos @params do SQL principal podem ser usados aqui.</p>}
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              </>}

              {/* ── aba 3: Drill-down & Hints ─────────────────────────── */}
              {activeTab === 'interativo' && <>
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Link2 className="h-4 w-4 text-primary" />
                          Links de Drill-Down
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Torna colunas clicáveis. Ao clicar num valor, executa um SQL com esse valor como parâmetro.
                        </CardDescription>
                      </div>
                      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addLink}>
                        <Plus className="h-4 w-4" />Adicionar Link
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {linkRows.length === 0 && <p className="text-sm text-muted-foreground">Nenhum drill-down configurado.</p>}
                    <div className="space-y-4">
                      {linkRows.map((l, idx) => (
                        <div key={l._id} className="rounded-lg border p-4 space-y-3 relative">
                          <button type="button" onClick={() => removeLink(l._id)}
                            style={{ position: 'absolute', top: '0.75rem', right: '0.75rem' }}
                            className="text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="h-4 w-4" />
                          </button>
                          <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b7280' }}>Link #{idx + 1}</p>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                            <div className="space-y-1">
                              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500 }}>Coluna clicável</label>
                              <input type="text" value={l.clickColumn} placeholder="ex: producao"
                                onChange={e => updateLink(l._id, 'clickColumn', e.target.value)}
                                style={{ ...inputStyle, fontFamily: 'monospace', height: '2.25rem' }} />
                              <p style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Coluna onde o usuário clica</p>
                            </div>
                            <div className="space-y-1">
                              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500 }}>Coluna do valor</label>
                              <input type="text" value={l.valueColumn} placeholder="ex: codigo"
                                onChange={e => updateLink(l._id, 'valueColumn', e.target.value)}
                                style={{ ...inputStyle, fontFamily: 'monospace', height: '2.25rem' }} />
                              <p style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Coluna cujo valor vai para o @param</p>
                            </div>
                            <div className="space-y-1">
                              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500 }}>Parâmetro no SQL</label>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '2.25rem' }}>
                                <span style={{ fontFamily: 'monospace', color: '#2563eb', fontSize: '0.875rem', lineHeight: '2.25rem' }}>@</span>
                                <input type="text" value={l.paramName} placeholder="cod_produto"
                                  onChange={e => updateLink(l._id, 'paramName', e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                                  style={{ ...inputStyle, fontFamily: 'monospace', height: '2.25rem' }} />
                              </div>
                              <p style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Nome do @param no SQL abaixo</p>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500 }}>Título do Painel (opcional)</label>
                            <input type="text" value={l.label} placeholder="ex: Detalhes do Produto"
                              onChange={e => updateLink(l._id, 'label', e.target.value)}
                              style={{ ...inputStyle, height: '2.25rem' }} />
                          </div>
                          <div className="space-y-1">
                            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500 }}>
                              SQL do Detalhe <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <textarea rows={5} value={l.sql}
                              placeholder={`SELECT * FROM produtos WHERE codigo = @${l.paramName || 'cod_produto'}`}
                              onChange={e => updateLink(l._id, 'sql', e.target.value)}
                              style={{
                                ...inputStyle, padding: '0.75rem', resize: 'vertical',
                                fontFamily: 'monospace', fontSize: '0.8125rem',
                                backgroundColor: '#020617', color: '#4ade80', borderColor: '#374151',
                              }} />
                            <p style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                              Use <code style={{ background: '#f3f4f6', padding: '0 3px', borderRadius: 3 }}>@{l.paramName || 'param'}</code> onde o valor clicado será substituído.
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <MousePointerClick className="h-4 w-4 text-primary" />
                          Botões de Navegação
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Adiciona botões em cada linha que abrem outro dashboard com o valor da linha como parâmetro.
                        </CardDescription>
                      </div>
                      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addAction}>
                        <Plus className="h-4 w-4" />Adicionar Botão
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {actionRows.length === 0 && <p className="text-sm text-muted-foreground">Nenhum botão configurado.</p>}
                    {actionRows.length > 0 && (
                      <div className="rounded-lg border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted/40 border-b">
                              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-40">Label do Botão</th>
                              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-36">Coluna de Valor</th>
                              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Dashboard Destino</th>
                              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-40">Parâmetro Destino</th>
                              <th className="w-10" />
                            </tr>
                          </thead>
                          <tbody>
                            {actionRows.map((a, idx) => (
                              <tr key={a._id} className={`border-b last:border-0 ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}>
                                <td className="px-3 py-2">
                                  <input type="text" value={a.label} placeholder="ex: Ver Pedidos"
                                    onChange={e => updateAction(a._id, 'label', e.target.value)}
                                    style={{ ...inputStyle, height: '2.1rem' }} />
                                </td>
                                <td className="px-3 py-2">
                                  <input type="text" value={a.sourceColumn} placeholder="ex: codigo"
                                    onChange={e => updateAction(a._id, 'sourceColumn', e.target.value)}
                                    style={{ ...inputStyle, fontFamily: 'monospace', height: '2.1rem' }} />
                                </td>
                                <td className="px-3 py-2">
                                  <select value={a.targetDashboardId || ''}
                                    onChange={e => updateAction(a._id, 'targetDashboardId', Number(e.target.value))}
                                    style={{ ...inputStyle, cursor: 'pointer', height: '2.1rem' }}>
                                    <option value="">-- selecione --</option>
                                    {allDashboards.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                                  </select>
                                </td>
                                <td className="px-3 py-2">
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                    <span style={{ fontFamily: 'monospace', color: '#2563eb', fontSize: '0.875rem' }}>@</span>
                                    <input type="text" value={a.targetParam} placeholder="cod_produto"
                                      onChange={e => updateAction(a._id, 'targetParam', e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                                      style={{ ...inputStyle, fontFamily: 'monospace', height: '2.1rem' }} />
                                  </div>
                                </td>
                                <td className="px-2 py-2 text-center">
                                  <button type="button" onClick={() => removeAction(a._id)}
                                    className="text-muted-foreground hover:text-destructive transition-colors">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Info className="h-4 w-4 text-primary" />
                          Hints das Colunas
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Texto exibido ao passar o mouse sobre o cabeçalho de uma coluna na tabela.
                        </CardDescription>
                      </div>
                      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addHint}>
                        <Plus className="h-4 w-4" />Adicionar Hint
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {hintRows.length === 0 && <p className="text-sm text-muted-foreground">Nenhum hint configurado.</p>}
                    {hintRows.length > 0 && (
                      <div className="rounded-lg border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted/40 border-b">
                              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-48">Nome da Coluna</th>
                              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Texto do Hint</th>
                              <th className="w-10" />
                            </tr>
                          </thead>
                          <tbody>
                            {hintRows.map((h, idx) => (
                              <tr key={h._id} className={`border-b last:border-0 ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}>
                                <td className="px-3 py-2">
                                  <input type="text" value={h.col} placeholder="ex: valor_total"
                                    onChange={e => updateHint(h._id, 'col', e.target.value)}
                                    style={{ ...inputStyle, fontFamily: 'monospace', height: '2.1rem' }} />
                                </td>
                                <td className="px-3 py-2">
                                  <input type="text" value={h.text} placeholder="ex: Soma dos valores faturados no período"
                                    onChange={e => updateHint(h._id, 'text', e.target.value)}
                                    style={{ ...inputStyle, height: '2.1rem' }} />
                                </td>
                                <td className="px-2 py-2 text-center">
                                  <button type="button" onClick={() => removeHint(h._id)}
                                    className="text-muted-foreground hover:text-destructive transition-colors">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>}

              {/* ── aba 4: Documentação ───────────────────────────────── */}
              {activeTab === 'docs' && isEdit && (
                <AttachmentsCard dashboardId={Number(id)} />
              )}

            </div>
          </div>

          {/* ── actions ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 justify-end">
            <Button type="button" variant="outline" disabled={isSaving} onClick={() => navigate('/dashboards')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving} className="gap-2 min-w-[100px]">
              <Save className="h-4 w-4" />Salvar
            </Button>
          </div>

        </form>
      </div>

      {/* ── modal de confirmação ───────────────────────────────────────── */}
      {confirmOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.4)',
        }}>
          <div style={{
            background: '#fff', borderRadius: '0.75rem', padding: '1.75rem',
            width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Confirmar salvamento
            </h2>
            <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '1.5rem' }}>
              Deseja salvar as alterações em <strong>"{nome}"</strong>?
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <Button type="button" variant="outline" disabled={isSaving} onClick={() => { setConfirmOpen(false); setPendingPayload(null); }}>
                Cancelar
              </Button>
              <Button type="button" disabled={isSaving} className="gap-2" onClick={handleConfirmSave}>
                {isSaving
                  ? <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Salvando...</>
                  : <><Save className="h-4 w-4" />Sim, salvar</>}
              </Button>
            </div>
          </div>
        </div>
      )}

    </AppLayout>
  );
}
