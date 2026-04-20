import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Pencil, Play, ChevronDown, ChevronUp, ChevronsUpDown,
  BarChart2, TrendingUp, AreaChart as AreaChartIcon, PieChart as PieChartIcon,
  AlertCircle, Clock, Database, Rows, Columns,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  SlidersHorizontal, RefreshCw, FileSpreadsheet, FileText, Link2,
  Settings2, Save, RotateCcw, Search, X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { AppLayout } from '@/components/layout/AppLayout';
import AttachmentsCard from '@/components/AttachmentsCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getDashboard, executeQuery, getConfig, isAdmin, saveChartConfig, saveExtraChartConfig,
  extractSqlParams, getParamDefault,
  type QueryResult, type DashboardParam, type ChartType,
  type DashboardLink, type DashboardAction, type ChartConfig, type ExtraChart,
} from '@/services/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ── constants ────────────────────────────────────────────────────────────────
const CHART_COLORS = [
  '#2563eb','#16a34a','#d97706','#dc2626',
  '#7c3aed','#0891b2','#ea580c','#65a30d',
];

type SortDir = 'asc' | 'desc' | null;
interface SortConfig { col: string; dir: SortDir }

// ── export helpers ────────────────────────────────────────────────────────────
function exportExcel(columns: Array<{ name: string }>, rows: Record<string, unknown>[], filename: string) {
  const header = columns.map(c => c.name);
  const data   = rows.map(row => header.map(h => {
    const v = row[h];
    return v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : v;
  }));
  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dados');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function exportPdf(columns: Array<{ name: string }>, rows: Record<string, unknown>[], filename: string) {
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' });
  const head = [columns.map(c => c.name)];
  const body = rows.map(row =>
    columns.map(c => {
      const v = row[c.name];
      return v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    })
  );
  autoTable(doc, {
    head,
    body,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { top: 14 },
  });
  doc.save(`${filename}.pdf`);
}

// ── param type helpers ────────────────────────────────────────────────────────
function paramInputType(type: DashboardParam['type']): 'date' | 'number' | 'text' {
  if (type === 'date') return 'date';
  if (type === 'integer' || type === 'decimal') return 'number';
  return 'text';
}

// ── misc helpers ──────────────────────────────────────────────────────────────
function isNumericVal(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  return !isNaN(Number(value));
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// Resolve o valor de uma coluna no row, aceitando "a.codigo" mesmo quando
// a coluna no resultado está como "codigo" (sem prefixo de tabela/alias)
function resolveColValue(row: Record<string, unknown>, colName: string): unknown {
  if (colName in row) return row[colName];
  // tenta sem o prefixo: "a.codigo" → "codigo"
  const bare = colName.includes('.') ? colName.split('.').pop()! : colName;
  if (bare in row) return row[bare];
  return undefined;
}

function StatCard({ icon, label, value, color = 'text-primary' }: {
  icon: React.ReactNode; label: string; value: string | number; color?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg bg-background border">
      <div className={`p-2 rounded-md bg-primary/10 ${color}`}>{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}

// ── ChartBlock — reusable chart for extra charts (2, 3, 4) ───────────────────
interface ChartBlockProps {
  result: QueryResult;
  initialType: ChartType;
  initialConfig: ChartConfig | null;
  title: string;
  admin: boolean;
  onSave: (type: ChartType, config: ChartConfig | null) => Promise<void>;
}

function ChartBlock({ result, initialType, initialConfig, title, admin, onSave }: ChartBlockProps) {
  const [chartType,   setChartType]   = useState<ChartType>(initialType);
  const [chartConfig, setChartConfig] = useState<ChartConfig | null>(initialConfig);
  const [panelOpen,   setPanelOpen]   = useState(false);
  const [saving,      setSaving]      = useState(false);

  const cols  = result.columns.map(c => c.name);
  const first = result.rows[0] ?? {};

  const chartData = useMemo(() => {
    if (!result || result.rows.length === 0) return null;
    let labelCol: string, numCols: string[];
    if (chartConfig?.labelCol && chartConfig.valueCols?.length) {
      labelCol = chartConfig.labelCol;
      numCols  = chartConfig.valueCols.filter(c => cols.includes(c));
    } else {
      const text = cols.filter(c => !isNumericVal(first[c]));
      const nums = cols.filter(c =>  isNumericVal(first[c]));
      if (!text.length || !nums.length) return null;
      labelCol = text[0]; numCols = nums.slice(0, 5);
    }
    if (!numCols.length || !labelCol) return null;
    return {
      data: result.rows.slice(0, 50).map(row => {
        const pt: Record<string, unknown> = { [labelCol]: formatValue(row[labelCol]) };
        numCols.forEach(nc => { pt[nc] = Number(row[nc]); });
        return pt;
      }),
      labelCol, numCols,
    };
  }, [result, chartConfig, cols, first]);

  const curLabel  = chartConfig?.labelCol  ?? cols.find(c => !isNumericVal(first[c])) ?? '';
  const curValues = chartConfig?.valueCols ?? cols.filter(c => isNumericVal(first[c])).slice(0, 5);

  const TYPES = [
    { v: 'bar' as ChartType,   label: 'Barras' },
    { v: 'line' as ChartType,  label: 'Linha'  },
    { v: 'area' as ChartType,  label: 'Área'   },
    { v: 'pie' as ChartType,   label: 'Pizza'  },
    { v: 'donut' as ChartType, label: 'Rosca'  },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-0 pt-4 px-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm font-semibold">{title || 'Gráfico'}</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setPanelOpen(v => !v)}
              style={{ display:'flex',alignItems:'center',gap:'0.3rem',padding:'0.28rem 0.6rem',borderRadius:'0.35rem',fontSize:'0.72rem',fontWeight:500,cursor:'pointer',border:'1px solid #e5e7eb',background:panelOpen?'#eff6ff':'hsl(var(--background))',color:panelOpen?'#2563eb':'#6b7280' }}>
              <Settings2 style={{ width:'0.85rem',height:'0.85rem' }} />Colunas
            </button>
            <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-lg border">
              {TYPES.map(t => (
                <button key={t.v} onClick={() => setChartType(t.v)}
                  style={{ padding:'0.28rem 0.5rem',borderRadius:'0.35rem',fontSize:'0.7rem',fontWeight:500,cursor:'pointer',border:'none',background:chartType===t.v?'hsl(var(--background))':'transparent',color:chartType===t.v?'hsl(var(--foreground))':'#9ca3af',boxShadow:chartType===t.v?'0 1px 3px rgba(0,0,0,0.12)':'none' }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>

      {panelOpen && (
        <div style={{ margin:'0 1.25rem 0.75rem',padding:'1rem',background:'hsl(var(--muted)/0.5)',border:'1px solid hsl(var(--border))',borderRadius:'0.5rem' }}>
          <div style={{ display:'flex',gap:'1.5rem',flexWrap:'wrap',alignItems:'flex-start' }}>
            <div style={{ minWidth:'180px' }}>
              <p style={{ fontSize:'0.75rem',fontWeight:600,color:'hsl(var(--muted-foreground))',marginBottom:'0.375rem' }}>Coluna de categoria (eixo X)</p>
              <select value={curLabel} onChange={e => setChartConfig({ labelCol: e.target.value, valueCols: curValues })}
                style={{ width:'100%',height:'2rem',padding:'0 0.5rem',border:'1px solid hsl(var(--border))',borderRadius:'0.375rem',fontSize:'0.8125rem',background:'hsl(var(--background))',cursor:'pointer' }}>
                <option value="">-- selecione --</option>
                {cols.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex:1,minWidth:'220px' }}>
              <p style={{ fontSize:'0.75rem',fontWeight:600,color:'hsl(var(--muted-foreground))',marginBottom:'0.375rem' }}>Colunas de valores (séries)</p>
              <div style={{ display:'flex',flexWrap:'wrap',gap:'0.5rem' }}>
                {cols.filter(c => c !== curLabel).map(c => {
                  const checked = curValues.includes(c);
                  return (
                    <label key={c} style={{ display:'inline-flex',alignItems:'center',gap:'0.35rem',fontSize:'0.8rem',cursor:'pointer',padding:'0.2rem 0.5rem',borderRadius:'0.3rem',background:checked?'#eff6ff':'hsl(var(--muted))',border:`1px solid ${checked?'#2563eb':'hsl(var(--border))'}`,color:checked?'#1d4ed8':'hsl(var(--muted-foreground))' }}>
                      <input type="checkbox" checked={checked}
                        onChange={e => {
                          const next = e.target.checked ? [...curValues, c] : curValues.filter(v => v !== c);
                          setChartConfig({ labelCol: curLabel, valueCols: next });
                        }}
                        style={{ accentColor:'#2563eb',width:'0.8rem',height:'0.8rem' }} />
                      {c}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <div style={{ display:'flex',gap:'0.5rem',marginTop:'0.875rem',alignItems:'center' }}>
            {admin && (
              <button onClick={async () => { setSaving(true); try { await onSave(chartType, { labelCol: curLabel, valueCols: curValues }); } finally { setSaving(false); } }}
                disabled={saving || !curLabel || curValues.length === 0}
                style={{ display:'inline-flex',alignItems:'center',gap:'0.3rem',padding:'0.3rem 0.75rem',borderRadius:'0.375rem',fontSize:'0.8rem',fontWeight:500,background:'#2563eb',color:'#fff',border:'none',cursor:'pointer',opacity:saving||!curLabel||curValues.length===0?0.6:1 }}>
                <Save style={{ width:'0.8rem',height:'0.8rem' }} />
                {saving ? 'Salvando...' : 'Salvar configuração'}
              </button>
            )}
            <button onClick={() => setChartConfig(null)}
              style={{ display:'inline-flex',alignItems:'center',gap:'0.3rem',padding:'0.3rem 0.75rem',borderRadius:'0.375rem',fontSize:'0.8rem',fontWeight:500,background:'hsl(var(--background))',color:'#64748b',border:'1px solid hsl(var(--border))',cursor:'pointer' }}>
              <RotateCcw style={{ width:'0.8rem',height:'0.8rem' }} />Auto
            </button>
          </div>
        </div>
      )}

      <CardContent className="px-2 pt-3 pb-2">
        {!chartData && (
          <div style={{ padding:'2rem',textAlign:'center',color:'#94a3b8',fontSize:'0.875rem' }}>
            Selecione uma coluna de categoria e ao menos uma de valores.
          </div>
        )}
        {chartData && (chartType === 'bar' || chartType === 'line' || chartType === 'area') && (
          <ResponsiveContainer width="100%" height={280}>
            {chartType === 'bar' ? (
              <BarChart data={chartData.data} margin={{top:8,right:16,left:4,bottom:60}} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="4 4" stroke="#e5e7eb" vertical={false}/>
                <XAxis dataKey={chartData.labelCol} tick={{fontSize:10,fill:'#6b7280'}} angle={-35} textAnchor="end" interval={0} height={60} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:'#6b7280'}} axisLine={false} tickLine={false} tickFormatter={(v:number)=>v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(0)}k`:String(v)}/>
                <Tooltip contentStyle={{background:'hsl(var(--background))',border:'1px solid hsl(var(--border))',borderRadius:'8px',fontSize:'12px'}} formatter={(v:number,n:string)=>[v.toLocaleString('pt-BR'),n]}/>
                {chartData.numCols.length>1&&<Legend wrapperStyle={{fontSize:'11px'}} iconType="circle" iconSize={7}/>}
                {chartData.numCols.map((col,i)=><Bar key={col} dataKey={col} fill={CHART_COLORS[i%CHART_COLORS.length]} radius={[5,5,0,0]} maxBarSize={50}/>)}
              </BarChart>
            ) : chartType === 'line' ? (
              <LineChart data={chartData.data} margin={{top:8,right:16,left:4,bottom:60}}>
                <CartesianGrid strokeDasharray="4 4" stroke="#e5e7eb" vertical={false}/>
                <XAxis dataKey={chartData.labelCol} tick={{fontSize:10,fill:'#6b7280'}} angle={-35} textAnchor="end" interval={0} height={60} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:'#6b7280'}} axisLine={false} tickLine={false} tickFormatter={(v:number)=>v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(0)}k`:String(v)}/>
                <Tooltip contentStyle={{background:'hsl(var(--background))',border:'1px solid hsl(var(--border))',borderRadius:'8px',fontSize:'12px'}} formatter={(v:number,n:string)=>[v.toLocaleString('pt-BR'),n]}/>
                {chartData.numCols.length>1&&<Legend wrapperStyle={{fontSize:'11px'}} iconType="circle" iconSize={7}/>}
                {chartData.numCols.map((col,i)=><Line key={col} type="monotone" dataKey={col} stroke={CHART_COLORS[i%CHART_COLORS.length]} strokeWidth={2.5} dot={false} activeDot={{r:4}}/>)}
              </LineChart>
            ) : (
              <AreaChart data={chartData.data} margin={{top:8,right:16,left:4,bottom:60}}>
                <defs>{chartData.numCols.map((col,i)=>(<linearGradient key={col} id={`xga-${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={CHART_COLORS[i%CHART_COLORS.length]} stopOpacity={0.3}/><stop offset="95%" stopColor={CHART_COLORS[i%CHART_COLORS.length]} stopOpacity={0.02}/></linearGradient>))}</defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#e5e7eb" vertical={false}/>
                <XAxis dataKey={chartData.labelCol} tick={{fontSize:10,fill:'#6b7280'}} angle={-35} textAnchor="end" interval={0} height={60} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:'#6b7280'}} axisLine={false} tickLine={false} tickFormatter={(v:number)=>v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(0)}k`:String(v)}/>
                <Tooltip contentStyle={{background:'hsl(var(--background))',border:'1px solid hsl(var(--border))',borderRadius:'8px',fontSize:'12px'}} formatter={(v:number,n:string)=>[v.toLocaleString('pt-BR'),n]}/>
                {chartData.numCols.length>1&&<Legend wrapperStyle={{fontSize:'11px'}} iconType="circle" iconSize={7}/>}
                {chartData.numCols.map((col,i)=><Area key={col} type="monotone" dataKey={col} stroke={CHART_COLORS[i%CHART_COLORS.length]} strokeWidth={2.5} fill={`url(#xga-${i})`} dot={false} activeDot={{r:4}}/>)}
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
        {chartData && (chartType === 'pie' || chartType === 'donut') && (() => {
          const pieData = chartData.data.map(row => ({ name: String(row[chartData.labelCol]??''), value: Number(row[chartData.numCols[0]]??0) }));
          return (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="75%" innerRadius={chartType==='donut'?'50%':'0%'} paddingAngle={chartType==='donut'?3:1} label={({name,percent})=>`${name} ${(percent*100).toFixed(1)}%`} labelLine={true}>
                  {pieData.map((_,i)=><Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]} stroke="#fff" strokeWidth={2}/>)}
                </Pie>
                <Tooltip contentStyle={{background:'hsl(var(--background))',border:'1px solid hsl(var(--border))',borderRadius:'8px',fontSize:'12px'}} formatter={(v:number)=>[v.toLocaleString('pt-BR')]}/>
                <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:'11px'}}/>
              </PieChart>
            </ResponsiveContainer>
          );
        })()}
      </CardContent>
    </Card>
  );
}

// ── component ─────────────────────────────────────────────────────────────────
// ── drill-down modal state ────────────────────────────────────────────────────
interface DrillState {
  title: string;
  baseSql: string;                      // SQL original do link
  fixedParams: Record<string, string>;  // parâmetro fixo vindo do clique
  extraParams: Record<string, string>;  // demais @params preenchíveis pelo usuário
  result: QueryResult | null;
  error: string | null;
  loading: boolean;
}

export default function DashboardView() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [queryResult,   setQueryResult]   = useState<QueryResult | null>(null);
  const [chartResult,   setChartResult]   = useState<QueryResult | null>(null);
  const [drillState,    setDrillState]    = useState<DrillState | null>(null);
  const [queryError,    setQueryError]    = useState<string | null>(null);
  const [executing,     setExecuting]     = useState(false);
  const [sqlExpanded,   setSqlExpanded]   = useState(false);
  const [chartType,     setChartType]     = useState<ChartType>('bar');
  const [sortConfig,    setSortConfig]    = useState<SortConfig>({ col: '', dir: null });
  const [currentPage,   setCurrentPage]   = useState(1);
  const [params,        setParams]        = useState<Record<string, string>>({});
  const [countdown,     setCountdown]     = useState(0);
  const [chartConfig,   setChartConfig]   = useState<ChartConfig | null>(null);
  const [chartPanelOpen, setChartPanelOpen] = useState(false);
  const [savingChart,   setSavingChart]   = useState(false);
  const [tableFilter,   setTableFilter]   = useState('');
  const [extraChartResults, setExtraChartResults] = useState<(QueryResult | null)[]>([null, null, null]);

  // Config from backend .env
  const { data: appConfig } = useQuery({
    queryKey: ['app-config'],
    queryFn: getConfig,
    staleTime: Infinity,
  });
  const PAGE_SIZE    = appConfig?.pageSize    ?? 50;
  const DASH_REFRESH = appConfig?.dashRefresh ?? 0;

  const admin = isAdmin();

  // set chart type from stored dashboard preference
  const { data: dashboard, isLoading: loadingDashboard } = useQuery({
    queryKey: ['dashboard', id],
    queryFn: () => getDashboard(Number(id)),
    enabled: !!id,
  });

  // ── core executor ────────────────────────────────────────────────────────
  // C2 — SQL template + params enviados separados; backend usa prepared statements
  const runQuery = useCallback(async (sql: string, queryParams: Record<string, string>, chartSql?: string, extraSqls?: string[]) => {
    setExecuting(true);
    setQueryError(null);
    setQueryResult(null);
    setChartResult(null);
    setExtraChartResults([null, null, null]);
    setSortConfig({ col: '', dir: null });
    setCurrentPage(1);
    setTableFilter('');
    try {
      const extraPromises = (extraSqls ?? []).map(s =>
        s.trim() ? executeQuery(s, queryParams, Number(id)) : Promise.resolve(null)
      );
      const [result, chartRes, ...extraRes] = await Promise.all([
        executeQuery(sql, queryParams, Number(id)),
        chartSql ? executeQuery(chartSql, queryParams, Number(id)) : Promise.resolve(null),
        ...extraPromises,
      ]);
      setQueryResult(result);
      setChartResult(chartRes);
      setExtraChartResults([extraRes[0] ?? null, extraRes[1] ?? null, extraRes[2] ?? null]);
    } catch (err: unknown) {
      setQueryError(err instanceof Error ? err.message : 'Erro ao executar a query');
    } finally {
      setExecuting(false);
    }
  }, [id]);

  // C2 — passa SQL template + params; backend substitui via prepared statement
  const handleExecute = useCallback(() => {
    if (!dashboard?.sql_query) return;
    const extraSqls = (dashboard.extra_charts ?? []).map(c => c.sql_query);
    runQuery(dashboard.sql_query, params, dashboard.chart_sql_query ?? undefined, extraSqls);
  }, [dashboard?.sql_query, dashboard?.chart_sql_query, dashboard?.extra_charts, params, runQuery]);

  // stable ref so intervals always call latest version
  const handleExecuteRef = useRef(handleExecute);
  useEffect(() => { handleExecuteRef.current = handleExecute; }, [handleExecute]);

  useEffect(() => {
    if (dashboard?.chart_type) setChartType(dashboard.chart_type as ChartType);
    if (dashboard?.chart_config) setChartConfig(dashboard.chart_config);
  }, [dashboard?.chart_type, dashboard?.chart_config]);

  // ── initialise params + first run when dashboard loads ───────────────────
  useEffect(() => {
    if (!dashboard?.sql_query) return;
    const initial: Record<string, string> = {};
    if (dashboard.params && dashboard.params.length > 0) {
      // use stored typed params with their saved default values
      dashboard.params.forEach(p => { initial[p.name] = p.defaultValue ?? ''; });
    } else {
      // fall back: auto-detect @names from SQL
      extractSqlParams(dashboard.sql_query).forEach(n => {
        initial[n] = getParamDefault(n, 'string');
      });
    }
    // override com parâmetros vindos por URL (botões de navegação de outro dash)
    searchParams.forEach((value, key) => { if (key in initial) initial[key] = value; });
    if ([...searchParams.keys()].length > 0) setSearchParams({}, { replace: true });

    setParams(initial);
    const extraSqls = (dashboard.extra_charts ?? []).map(c => c.sql_query);
    runQuery(dashboard.sql_query, initial, dashboard.chart_sql_query ?? undefined, extraSqls);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard?.id]);

  // #7 — effective refresh: per-dashboard > 0 overrides global
  const effectiveRefresh = (dashboard?.refresh_interval ?? 0) > 0
    ? (dashboard!.refresh_interval as number)
    : DASH_REFRESH;

  // ── auto-refresh ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (effectiveRefresh <= 0 || !dashboard?.sql_query) return;
    setCountdown(effectiveRefresh);
    const timer = setInterval(() => {
      handleExecuteRef.current();
      setCountdown(effectiveRefresh);
    }, effectiveRefresh * 1000);
    return () => clearInterval(timer);
  }, [dashboard?.sql_query, effectiveRefresh]);

  // countdown ticker
  useEffect(() => {
    if (effectiveRefresh <= 0) return;
    setCountdown(effectiveRefresh);
    const ticker = setInterval(() => setCountdown(p => Math.max(0, p - 1)), 1000);
    return () => clearInterval(ticker);
  }, [effectiveRefresh]);

  // ── reset page on sort ───────────────────────────────────────────────────
  useEffect(() => { setCurrentPage(1); }, [sortConfig]);

  // ── derived data ─────────────────────────────────────────────────────────
  // use stored typed params when defined, otherwise auto-detect from SQL
  const typedParams = useMemo<DashboardParam[]>(() => {
    if (!dashboard) return [];
    if (dashboard.params && dashboard.params.length > 0) return dashboard.params;
    // auto-detect fallback
    return extractSqlParams(dashboard.sql_query ?? '').map(name => ({
      name,
      label: name,
      type: 'string' as const,
      defaultValue: '',
    }));
  }, [dashboard]);

  // map clickColumn → link config for quick lookup in table cells
  const linkMap = useMemo<Map<string, DashboardLink>>(() => {
    const m = new Map<string, DashboardLink>();
    (dashboard?.links || []).forEach(l => m.set(l.clickColumn, l));
    return m;
  }, [dashboard?.links]);

  // list of navigation action buttons
  const actionList = useMemo<DashboardAction[]>(() => dashboard?.actions || [], [dashboard?.actions]);

  // map colName (lowercase) → hint text for case-insensitive lookup
  const hintMap = useMemo<Record<string, string>>(() => {
    const raw = dashboard?.column_hints || {};
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v]));
  }, [dashboard?.column_hints]);

  // ── drill-down opener ─────────────────────────────────────────────────────
  const openDrill = useCallback((link: DashboardLink, cellValue: string) => {
    const fixedParams: Record<string, string> = { [link.paramName]: cellValue };

    // detect extra @params and pre-fill from the parent dashboard's current params
    const allParamNames = extractSqlParams(link.sql);
    const extraParams: Record<string, string> = {};
    allParamNames.forEach(name => {
      if (name === link.paramName) return;
      // use parent param if it exists, else smart default
      const parentVal = params[name];
      extraParams[name] = parentVal !== undefined ? parentVal : getParamDefault(name, 'string');
    });

    const title = link.label ? `${link.label} — ${cellValue}` : cellValue;
    const newState: DrillState = { title, baseSql: link.sql, fixedParams, extraParams, result: null, error: null, loading: false };
    setDrillState(newState);
    // always execute immediately — all params already filled
    runDrillWith(link.sql, fixedParams, extraParams);
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const runDrillWith = useCallback(async (baseSql: string, fixedParams: Record<string, string>, extraParams: Record<string, string>) => {
    const allParams = { ...extraParams, ...fixedParams }; // fixed overrides extra
    setDrillState(s => s ? { ...s, loading: true, error: null, result: null } : null);
    try {
      // C2 — SQL template + params separados; sem substituição no frontend
      const result = await executeQuery(baseSql, allParams);
      setDrillState(s => s ? { ...s, result, loading: false } : null);
    } catch (err: unknown) {
      setDrillState(s => s ? { ...s, error: err instanceof Error ? err.message : 'Erro ao executar', loading: false } : null);
    }
  }, []);

  const runDrill = useCallback((state: DrillState) => {
    runDrillWith(state.baseSql, state.fixedParams, state.extraParams);
  }, [runDrillWith]);

  const numericCols = useMemo(() => {
    if (!queryResult || queryResult.rows.length === 0) return new Set<string>();
    const first = queryResult.rows[0];
    return new Set(queryResult.columns.map(c => c.name).filter(n => isNumericVal(first[n])));
  }, [queryResult]);

  const chartData = useMemo(() => {
    // usa o resultado do SQL do gráfico se disponível, senão usa o principal
    const source = chartResult ?? queryResult;
    if (!source || source.rows.length === 0) return null;
    const cols  = source.columns.map(c => c.name);
    const first = source.rows[0];

    let labelCol: string;
    let numCols: string[];

    if (chartConfig && chartConfig.labelCol && chartConfig.valueCols?.length) {
      // usar configuração salva
      labelCol = chartConfig.labelCol;
      numCols  = chartConfig.valueCols.filter(c => cols.includes(c));
    } else {
      // auto-detectar
      const textCols = cols.filter(c => !isNumericVal(first[c]));
      const autoCols = cols.filter(c =>  isNumericVal(first[c]));
      if (!autoCols.length || !textCols.length) return null;
      labelCol = textCols[0];
      numCols  = autoCols.slice(0, 5);
    }

    if (!numCols.length || !labelCol) return null;

    return {
      data: source.rows.slice(0, 50).map(row => {
        const pt: Record<string, unknown> = { [labelCol]: formatValue(row[labelCol]) };
        numCols.forEach(nc => { pt[nc] = Number(row[nc]); });
        return pt;
      }),
      labelCol,
      numCols,
    };
  }, [queryResult, chartResult, chartConfig]);

  const handleSort = (col: string) => {
    setSortConfig(prev => {
      if (prev.col === col) {
        const next: SortDir = prev.dir === 'asc' ? 'desc' : prev.dir === 'desc' ? null : 'asc';
        return { col, dir: next };
      }
      return { col, dir: 'asc' };
    });
  };

  // #4 — client-side quick filter
  const filteredRows = useMemo(() => {
    if (!queryResult) return [];
    if (!tableFilter.trim()) return queryResult.rows;
    const needle = tableFilter.trim().toLowerCase();
    return queryResult.rows.filter(row =>
      Object.values(row).some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(needle))
    );
  }, [queryResult, tableFilter]);

  const sortedRows = useMemo(() => {
    if (!filteredRows.length) return filteredRows;
    if (!sortConfig.col || !sortConfig.dir) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const av = a[sortConfig.col], bv = b[sortConfig.col];
      const an = Number(av),        bn = Number(bv);
      const cmp = (!isNaN(an) && !isNaN(bn))
        ? an - bn
        : String(av ?? '').localeCompare(String(bv ?? ''), 'pt-BR');
      return sortConfig.dir === 'desc' ? -cmp : cmp;
    });
  }, [filteredRows, sortConfig]);

  const totalPages    = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const safePage      = Math.min(currentPage, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, safePage]);

  // ── render guards ─────────────────────────────────────────────────────────
  if (loadingDashboard) {
    return (
      <AppLayout title="Carregando...">
        <div className="flex items-center justify-center py-20">
          <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </AppLayout>
    );
  }

  if (!dashboard) {
    return (
      <AppLayout title="Não encontrado">
        <div className="text-center py-20">
          <p className="text-muted-foreground">Dashboard não encontrado.</p>
          <Button className="mt-4" onClick={() => navigate('/dashboards')}>Voltar</Button>
        </div>
      </AppLayout>
    );
  }

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <AppLayout title={dashboard.nome}>
      {/* #3 — thin animated progress bar at top during execution */}
      {executing && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, height: '3px' }}>
          <div style={{
            height: '100%', background: 'hsl(var(--primary))',
            animation: 'progressBar 2s ease-in-out infinite',
            transformOrigin: 'left center',
          }} />
          <style>{`@keyframes progressBar { 0%{width:0%} 60%{width:85%} 100%{width:95%} }`}</style>
        </div>
      )}
      <div className="space-y-5">

        {/* ── header ────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => navigate('/dashboards')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold leading-tight">{dashboard.nome}</h1>
              {dashboard.descricao && (
                <p className="text-sm text-muted-foreground mt-0.5">{dashboard.descricao}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {effectiveRefresh > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground border rounded-md px-2.5 py-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                {countdown}s
              </span>
            )}
            {admin && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(`/dashboards/${id}/edit`)}>
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            )}
            <Button size="sm" className="gap-2" disabled={executing} onClick={handleExecute}>
              {executing ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Executando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Executar
                </>
              )}
            </Button>
          </div>
        </div>

        {/* ── parameters card ───────────────────────────────────────────── */}
        {typedParams.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                Parâmetros
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                {typedParams.map(p => {
                  const inputType = paramInputType(p.type);
                  const step = p.type === 'decimal' ? '0.01' : undefined;
                  return (
                    <div key={p.name}>
                      <label
                        htmlFor={`param-${p.name}`}
                        style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.8125rem', fontWeight: 500, color: '#374151' }}
                      >
                        {p.label && p.label !== p.name
                          ? <>{p.label} <span style={{ fontFamily: 'monospace', color: '#6b7280', fontSize: '0.75rem' }}>(@{p.name})</span></>
                          : <span style={{ fontFamily: 'monospace', color: '#2563eb' }}>@{p.name}</span>}
                      </label>
                      <input
                        id={`param-${p.name}`}
                        type={inputType}
                        step={step}
                        value={params[p.name] ?? ''}
                        onChange={e => setParams(prev => ({ ...prev, [p.name]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') handleExecute(); }}
                        style={{
                          width: '100%',
                          height: '2.25rem',
                          padding: '0 0.625rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          color: '#111827',
                          backgroundColor: '#ffffff',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <Button size="sm" className="gap-2" disabled={executing} onClick={handleExecute}>
                <Play className="h-4 w-4" />
                Executar Query
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── SQL block (admin only) ─────────────────────────────────── */}
        {admin && (
          <Card>
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left hover:bg-muted/50 transition-colors rounded-lg"
              onClick={() => setSqlExpanded(!sqlExpanded)}
            >
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                <span>Query SQL</span>
                <Badge variant="secondary" className="text-xs">SELECT</Badge>
                {typedParams.length > 0 && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <SlidersHorizontal className="h-3 w-3" />
                    {typedParams.length} parâmetro{typedParams.length > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
              {sqlExpanded
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {sqlExpanded && (
              <div className="px-4 pb-4">
                <pre className="p-4 rounded-md bg-slate-950 text-green-400 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed border border-slate-800">
                  {dashboard.sql_query}
                </pre>
              </div>
            )}
          </Card>
        )}

        {/* ── error ─────────────────────────────────────────────────────── */}
        {queryError && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3 text-destructive">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">Erro ao executar a query</p>
                  <pre className="text-xs mt-1 whitespace-pre-wrap font-mono opacity-80">{queryError}</pre>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── executing spinner ──────────────────────────────────────────── */}
        {executing && (
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-sm">Executando query...</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── results ───────────────────────────────────────────────────── */}
        {!executing && queryResult && (
          <>
            {/* stats — admin only */}
            {admin && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard icon={<Rows    className="h-4 w-4" />} label="Total de linhas"   value={queryResult.rowCount.toLocaleString('pt-BR')} />
                <StatCard icon={<Columns className="h-4 w-4" />} label="Colunas"           value={queryResult.columns.length} />
                <StatCard icon={<Clock   className="h-4 w-4" />} label="Tempo de execução" value={`${queryResult.executionTime}ms`} />
                <StatCard icon={<Database className="h-4 w-4" />} label="Página"           value={`${safePage} / ${totalPages}`} />
              </div>
            )}

            {/* chart */}
            {chartType !== 'none' && queryResult && (
              <Card className="overflow-hidden">
                <CardHeader className="pb-0 pt-4 px-5">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      {admin && (
                        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          Visualização
                          {dashboard.chart_sql_query && (
                            <span style={{ fontSize: '0.68rem', fontWeight: 500, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '0.1rem 0.45rem', borderRadius: '0.3rem' }}>
                              SQL próprio
                            </span>
                          )}
                        </CardTitle>
                      )}
                      {admin && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {chartData ? `${chartData.data.length} registros · ${chartData.numCols.length} série${chartData.numCols.length > 1 ? 's' : ''}` : 'Configure as colunas para exibir o gráfico'}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* config button */}
                      <button
                        onClick={() => setChartPanelOpen(v => !v)}
                        title="Configurar colunas do gráfico"
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.3rem',
                          padding: '0.28rem 0.6rem', borderRadius: '0.35rem',
                          fontSize: '0.72rem', fontWeight: 500, cursor: 'pointer', border: '1px solid #e5e7eb',
                          background: chartPanelOpen ? '#eff6ff' : '#fff',
                          color: chartPanelOpen ? '#2563eb' : '#6b7280',
                          transition: 'all 0.15s',
                        }}
                      >
                        <Settings2 style={{ width: '0.85rem', height: '0.85rem' }} />
                        Colunas
                      </button>
                      {/* chart type switcher */}
                      <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-lg border flex-wrap">
                      {([
                        { v: 'bar',   label: 'Barras',  icon: <BarChart2       style={{width:'0.85rem',height:'0.85rem'}}/> },
                        { v: 'line',  label: 'Linha',   icon: <TrendingUp      style={{width:'0.85rem',height:'0.85rem'}}/> },
                        { v: 'area',  label: 'Área',    icon: <AreaChartIcon   style={{width:'0.85rem',height:'0.85rem'}}/> },
                        { v: 'pie',   label: 'Pizza',   icon: <PieChartIcon    style={{width:'0.85rem',height:'0.85rem'}}/> },
                        { v: 'donut', label: 'Rosca',   icon: <PieChartIcon    style={{width:'0.85rem',height:'0.85rem'}}/> },
                      ] as { v: ChartType; label: string; icon: React.ReactNode }[]).map(t => (
                        <button key={t.v} onClick={() => setChartType(t.v)} style={{
                          display:'flex',alignItems:'center',gap:'0.3rem',
                          padding:'0.28rem 0.6rem',borderRadius:'0.35rem',
                          fontSize:'0.72rem',fontWeight:500,cursor:'pointer',border:'none',
                          transition:'all 0.15s',
                          background: chartType===t.v ? '#fff' : 'transparent',
                          color:      chartType===t.v ? '#111827' : '#9ca3af',
                          boxShadow:  chartType===t.v ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                        }}>
                          {t.icon}{t.label}
                        </button>
                      ))}
                      </div>
                    </div>{/* end flex-wrap buttons */}
                  </div>
                </CardHeader>

                {/* ── painel de configuração de colunas ── */}
                {chartPanelOpen && (() => {
                  const src     = chartResult ?? queryResult;
                  const allCols = src.columns.map(c => c.name);
                  const first   = src.rows[0] ?? {};
                  const curLabel  = chartConfig?.labelCol  ?? allCols.find(c => !isNumericVal(first[c])) ?? '';
                  const curValues = chartConfig?.valueCols ?? allCols.filter(c => isNumericVal(first[c])).slice(0, 5);
                  return (
                    <div style={{ margin: '0 1.25rem 0.75rem', padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}>
                      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        {/* label col */}
                        <div style={{ minWidth: '180px' }}>
                          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>Coluna de categoria (eixo X)</p>
                          <select
                            value={curLabel}
                            onChange={e => setChartConfig({ labelCol: e.target.value, valueCols: curValues })}
                            style={{ width: '100%', height: '2rem', padding: '0 0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.8125rem', background: '#fff', cursor: 'pointer' }}
                          >
                            <option value="">-- selecione --</option>
                            {allCols.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        {/* value cols */}
                        <div style={{ flex: 1, minWidth: '220px' }}>
                          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>Colunas de valores (séries)</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {allCols.filter(c => c !== curLabel).map(c => {
                              const checked = curValues.includes(c);
                              return (
                                <label key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer', padding: '0.2rem 0.5rem', borderRadius: '0.3rem', background: checked ? '#eff6ff' : '#f1f5f9', border: `1px solid ${checked ? '#2563eb' : '#e2e8f0'}`, color: checked ? '#1d4ed8' : '#64748b' }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={e => {
                                      const next = e.target.checked ? [...curValues, c] : curValues.filter(v => v !== c);
                                      setChartConfig({ labelCol: curLabel, valueCols: next });
                                    }}
                                    style={{ accentColor: '#2563eb', width: '0.8rem', height: '0.8rem' }}
                                  />
                                  {c}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      {/* actions */}
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.875rem', alignItems: 'center' }}>
                        {admin && (
                          <button
                            onClick={async () => {
                              if (!dashboard) return;
                              setSavingChart(true);
                              try {
                                await saveChartConfig(dashboard.id, { labelCol: curLabel, valueCols: curValues });
                              } finally { setSavingChart(false); }
                            }}
                            disabled={savingChart || !curLabel || curValues.length === 0}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.8rem', fontWeight: 500, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', opacity: savingChart || !curLabel || curValues.length === 0 ? 0.6 : 1 }}
                          >
                            <Save style={{ width: '0.8rem', height: '0.8rem' }} />
                            {savingChart ? 'Salvando...' : 'Salvar configuração'}
                          </button>
                        )}
                        <button
                          onClick={() => setChartConfig(null)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.8rem', fontWeight: 500, background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer' }}
                          title="Voltar para detecção automática"
                        >
                          <RotateCcw style={{ width: '0.8rem', height: '0.8rem' }} />
                          Auto-detectar
                        </button>
                        {!admin && <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Configuração aplicada nesta sessão</span>}
                      </div>
                    </div>
                  );
                })()}

                <CardContent className="px-2 pt-4 pb-2">
                  {!chartData && (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>
                      Selecione uma coluna de categoria e pelo menos uma de valores para exibir o gráfico.
                    </div>
                  )}
                  {/* ── axis-based charts ── */}
                  {chartData && (chartType === 'bar' || chartType === 'line' || chartType === 'area') && (
                    <ResponsiveContainer width="100%" height={340}>
                      {chartType === 'bar' ? (
                        <BarChart data={chartData.data} margin={{top:10,right:24,left:10,bottom:70}} barCategoryGap="30%">
                          <defs>{chartData.numCols.map((col,i)=>(
                            <linearGradient key={col} id={`gb-${i}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%"   stopColor={CHART_COLORS[i%CHART_COLORS.length]} stopOpacity={1}/>
                              <stop offset="100%" stopColor={CHART_COLORS[i%CHART_COLORS.length]} stopOpacity={0.65}/>
                            </linearGradient>
                          ))}</defs>
                          <CartesianGrid strokeDasharray="4 4" stroke="#e5e7eb" vertical={false}/>
                          <XAxis dataKey={chartData.labelCol} tick={{fontSize:11,fill:'#6b7280'}} angle={-40} textAnchor="end" interval={0} height={70} axisLine={false} tickLine={false}/>
                          <YAxis tick={{fontSize:11,fill:'#6b7280'}} axisLine={false} tickLine={false} tickFormatter={(v:number)=>v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(0)}k`:String(v)}/>
                          <Tooltip cursor={{fill:'rgba(37,99,235,0.05)'}} contentStyle={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:'10px',fontSize:'12px',boxShadow:'0 4px 16px rgba(0,0,0,0.10)',padding:'10px 14px'}} formatter={(v:number,n:string)=>[v.toLocaleString('pt-BR'),n]}/>
                          {chartData.numCols.length>1&&<Legend wrapperStyle={{fontSize:'12px',paddingTop:'8px'}} iconType="circle" iconSize={8}/>}
                          {chartData.numCols.map((col,i)=><Bar key={col} dataKey={col} fill={`url(#gb-${i})`} radius={[6,6,0,0]} maxBarSize={56}/>)}
                        </BarChart>
                      ) : chartType === 'line' ? (
                        <LineChart data={chartData.data} margin={{top:10,right:24,left:10,bottom:70}}>
                          <CartesianGrid strokeDasharray="4 4" stroke="#e5e7eb" vertical={false}/>
                          <XAxis dataKey={chartData.labelCol} tick={{fontSize:11,fill:'#6b7280'}} angle={-40} textAnchor="end" interval={0} height={70} axisLine={false} tickLine={false}/>
                          <YAxis tick={{fontSize:11,fill:'#6b7280'}} axisLine={false} tickLine={false} tickFormatter={(v:number)=>v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(0)}k`:String(v)}/>
                          <Tooltip contentStyle={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:'10px',fontSize:'12px',boxShadow:'0 4px 16px rgba(0,0,0,0.10)',padding:'10px 14px'}} formatter={(v:number,n:string)=>[v.toLocaleString('pt-BR'),n]}/>
                          {chartData.numCols.length>1&&<Legend wrapperStyle={{fontSize:'12px',paddingTop:'8px'}} iconType="circle" iconSize={8}/>}
                          {chartData.numCols.map((col,i)=><Line key={col} type="monotone" dataKey={col} stroke={CHART_COLORS[i%CHART_COLORS.length]} strokeWidth={2.5} dot={false} activeDot={{r:5,strokeWidth:0}}/>)}
                        </LineChart>
                      ) : (
                        <AreaChart data={chartData.data} margin={{top:10,right:24,left:10,bottom:70}}>
                          <defs>{chartData.numCols.map((col,i)=>(
                            <linearGradient key={col} id={`ga-${i}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"   stopColor={CHART_COLORS[i%CHART_COLORS.length]} stopOpacity={0.3}/>
                              <stop offset="95%"  stopColor={CHART_COLORS[i%CHART_COLORS.length]} stopOpacity={0.02}/>
                            </linearGradient>
                          ))}</defs>
                          <CartesianGrid strokeDasharray="4 4" stroke="#e5e7eb" vertical={false}/>
                          <XAxis dataKey={chartData.labelCol} tick={{fontSize:11,fill:'#6b7280'}} angle={-40} textAnchor="end" interval={0} height={70} axisLine={false} tickLine={false}/>
                          <YAxis tick={{fontSize:11,fill:'#6b7280'}} axisLine={false} tickLine={false} tickFormatter={(v:number)=>v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(0)}k`:String(v)}/>
                          <Tooltip contentStyle={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:'10px',fontSize:'12px',boxShadow:'0 4px 16px rgba(0,0,0,0.10)',padding:'10px 14px'}} formatter={(v:number,n:string)=>[v.toLocaleString('pt-BR'),n]}/>
                          {chartData.numCols.length>1&&<Legend wrapperStyle={{fontSize:'12px',paddingTop:'8px'}} iconType="circle" iconSize={8}/>}
                          {chartData.numCols.map((col,i)=>(
                            <Area key={col} type="monotone" dataKey={col}
                              stroke={CHART_COLORS[i%CHART_COLORS.length]} strokeWidth={2.5}
                              fill={`url(#ga-${i})`} dot={false} activeDot={{r:5,strokeWidth:0}}/>
                          ))}
                        </AreaChart>
                      )}
                    </ResponsiveContainer>
                  )}

                  {/* ── pie / donut ── */}
                  {chartData && (chartType === 'pie' || chartType === 'donut') && (() => {
                    const pieData = chartData.data.map(row => ({
                      name: String(row[chartData.labelCol] ?? ''),
                      value: Number(row[chartData.numCols[0]] ?? 0),
                    }));
                    const inner = chartType === 'donut' ? '55%' : '0%';
                    return (
                      <ResponsiveContainer width="100%" height={340}>
                        <PieChart>
                          <Pie data={pieData} dataKey="value" nameKey="name"
                            cx="50%" cy="50%" outerRadius="75%"
                            innerRadius={inner}
                            paddingAngle={chartType==='donut'?3:1}
                            label={({name,percent})=>`${name} ${(percent*100).toFixed(1)}%`}
                            labelLine={true}
                          >
                            {pieData.map((_,i)=>(
                              <Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]}
                                stroke="#fff" strokeWidth={2}/>
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:'10px',fontSize:'12px',boxShadow:'0 4px 16px rgba(0,0,0,0.10)',padding:'10px 14px'}} formatter={(v:number)=>[v.toLocaleString('pt-BR')]}/>
                          <Legend iconType="circle" iconSize={9} wrapperStyle={{fontSize:'12px'}}/>
                        </PieChart>
                      </ResponsiveContainer>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

            {/* extra charts grid (gráficos 2, 3, 4) */}
            {(() => {
              const activeExtras = (dashboard.extra_charts ?? [])
                .map((ec, idx) => ({ ec, idx, result: extraChartResults[idx] }))
                .filter(x => x.result !== null);
              if (activeExtras.length === 0) return null;
              const gridCols = activeExtras.length === 1
                ? 'grid-cols-1'
                : activeExtras.length === 2
                ? 'grid-cols-1 md:grid-cols-2'
                : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
              return (
                <div className={`grid gap-4 ${gridCols}`}>
                  {activeExtras.map(({ ec, idx, result }) => (
                    <ChartBlock
                      key={idx}
                      result={result!}
                      initialType={ec.chart_type}
                      initialConfig={ec.chart_config}
                      title={ec.title || `Gráfico ${idx + 2}`}
                      admin={admin}
                      onSave={async (type, config) => {
                        const updated = (dashboard.extra_charts ?? []).map((c, i) =>
                          i === idx ? { ...c, chart_type: type, chart_config: config } : c
                        );
                        await saveExtraChartConfig(Number(id), updated);
                      }}
                    />
                  ))}
                </div>
              );
            })()}

            {/* data table */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base">Dados</CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* #4 — quick filter */}
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <Search style={{ position: 'absolute', left: '0.5rem', width: '0.875rem', height: '0.875rem', color: '#9ca3af', pointerEvents: 'none' }} />
                      <input
                        value={tableFilter}
                        onChange={e => { setTableFilter(e.target.value); setCurrentPage(1); }}
                        placeholder="Filtrar dados..."
                        style={{
                          paddingLeft: '1.75rem', paddingRight: tableFilter ? '1.75rem' : '0.5rem',
                          height: '1.875rem', borderRadius: '0.375rem',
                          border: '1px solid hsl(var(--border))',
                          background: 'hsl(var(--background))', color: 'hsl(var(--foreground))',
                          fontSize: '0.8125rem', outline: 'none', width: '180px',
                        }}
                      />
                      {tableFilter && (
                        <button onClick={() => setTableFilter('')} style={{ position: 'absolute', right: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                          <X style={{ width: '0.75rem', height: '0.75rem', color: '#9ca3af' }} />
                        </button>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {sortedRows.length.toLocaleString('pt-BR')}{tableFilter ? ` / ${(queryResult.rowCount).toLocaleString('pt-BR')}` : ''} linhas &middot; {queryResult.columns.length} colunas
                    </span>
                    <button
                      onClick={() => exportExcel(queryResult.columns, sortedRows, dashboard.nome)}
                      title="Exportar Excel"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.375rem',
                        padding: '0.3rem 0.7rem', borderRadius: '0.375rem',
                        border: '1px solid #d1d5db', backgroundColor: '#fff',
                        fontSize: '0.75rem', fontWeight: 500, color: '#166534',
                        cursor: 'pointer', transition: 'background 0.15s',
                      }}
                      onMouseOver={e => (e.currentTarget.style.backgroundColor = '#f0fdf4')}
                      onMouseOut={e => (e.currentTarget.style.backgroundColor = '#fff')}
                    >
                      <FileSpreadsheet style={{ width: '0.875rem', height: '0.875rem' }} />
                      Excel
                    </button>
                    <button
                      onClick={() => exportPdf(queryResult.columns, sortedRows, dashboard.nome)}
                      title="Exportar PDF"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.375rem',
                        padding: '0.3rem 0.7rem', borderRadius: '0.375rem',
                        border: '1px solid #d1d5db', backgroundColor: '#fff',
                        fontSize: '0.75rem', fontWeight: 500, color: '#991b1b',
                        cursor: 'pointer', transition: 'background 0.15s',
                      }}
                      onMouseOver={e => (e.currentTarget.style.backgroundColor = '#fff1f2')}
                      onMouseOut={e => (e.currentTarget.style.backgroundColor = '#fff')}
                    >
                      <FileText style={{ width: '0.875rem', height: '0.875rem' }} />
                      PDF
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto w-full" style={{ maxHeight: '70vh' }}>
                  <table className="min-w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        {actionList.length > 0 && (
                          <th
                            style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--muted)/0.4)', backdropFilter: 'blur(4px)', zIndex: 1 }}
                            className="px-3 py-3 font-semibold text-muted-foreground whitespace-nowrap text-left"
                          >
                            Ações
                          </th>
                        )}
                        {queryResult.columns.map(col => {
                          const isNum    = numericCols.has(col.name);
                          const hasLink  = linkMap.has(col.name);
                          const hint     = hintMap[col.name.toLowerCase()];
                          return (
                            <th
                              key={col.name}
                              onClick={() => handleSort(col.name)}
                              className={`px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap cursor-pointer hover:bg-muted/80 select-none transition-colors group ${isNum ? 'text-right' : 'text-left'}`}
                              style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--muted)/0.4)', backdropFilter: 'blur(4px)', zIndex: 1 }}
                            >
                              <div className={`flex items-center gap-1.5 ${isNum ? 'flex-row-reverse justify-start' : ''}`}>
                                <span>{col.name}</span>
                                {hint && (
                                  <span
                                    title={hint}
                                    onClick={e => e.stopPropagation()}
                                    style={{ cursor: 'help', display: 'inline-flex', alignItems: 'center' }}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '0.8rem', height: '0.8rem', color: '#6b7280', flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
                                    </svg>
                                  </span>
                                )}
                                {hasLink && (
                                  <span title="Coluna com drill-down"><Link2 style={{ width: '0.75rem', height: '0.75rem', color: '#2563eb', flexShrink: 0 }} /></span>
                                )}
                                <span className="text-muted-foreground/50 shrink-0">
                                  {sortConfig.col === col.name
                                    ? sortConfig.dir === 'asc'
                                      ? <ChevronUp   className="h-3.5 w-3.5 text-primary" />
                                      : sortConfig.dir === 'desc'
                                        ? <ChevronDown className="h-3.5 w-3.5 text-primary" />
                                        : <ChevronsUpDown className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100" />
                                    : <ChevronsUpDown className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100" />}
                                </span>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRows.map((row, idx) => (
                        <tr key={idx} className={`border-b hover:bg-muted/40 transition-colors ${idx % 2 === 1 ? 'bg-muted/20' : ''}`}>
                          {actionList.length > 0 && (
                            <td className="px-3 py-2 whitespace-nowrap">
                              <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                                {actionList.map((act, ai) => {
                                  const val = formatValue(row[act.sourceColumn]);
                                  const disabled = !val;
                                  return (
                                    <button
                                      key={ai}
                                      disabled={disabled}
                                      onClick={() => {
                                        const p = new URLSearchParams({ [act.targetParam]: val });
                                        navigate(`/dashboards/${act.targetDashboardId}?${p.toString()}`);
                                      }}
                                      style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                        padding: '0.2rem 0.6rem', borderRadius: '0.375rem',
                                        fontSize: '0.75rem', fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer',
                                        border: '1px solid #2563eb',
                                        background: disabled ? '#f3f4f6' : '#eff6ff',
                                        color: disabled ? '#9ca3af' : '#1d4ed8',
                                        transition: 'all 0.15s',
                                        opacity: disabled ? 0.5 : 1,
                                      }}
                                      onMouseOver={e => { if (!disabled) e.currentTarget.style.background = '#dbeafe'; }}
                                      onMouseOut={e => { if (!disabled) e.currentTarget.style.background = '#eff6ff'; }}
                                      title={disabled ? 'Valor não disponível' : `${act.label}: ${val}`}
                                    >
                                      {act.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                          )}
                          {queryResult.columns.map(col => {
                            const val        = row[col.name];
                            const displayVal = formatValue(val);
                            const isNull     = val === null || val === undefined;
                            const isNum      = numericCols.has(col.name);
                            const link       = linkMap.get(col.name);
                            const clickable  = link && !isNull;
                            return (
                              <td
                                key={col.name}
                                title={clickable ? `Drill-down → ${link!.label || ''} (${link!.paramName}=${formatValue(resolveColValue(row, link!.valueColumn))})` : displayVal}
                                className={`px-4 py-2.5 whitespace-nowrap ${isNum ? 'text-right font-mono' : 'text-left'}`}
                              >
                                {isNull ? (
                                  <span className="text-muted-foreground/40 italic text-xs">NULL</span>
                                ) : clickable ? (
                                  <button
                                    onClick={() => {
                                      const paramVal = formatValue(resolveColValue(row, link!.valueColumn));
                                      openDrill(link!, paramVal);
                                    }}
                                    style={{
                                      fontFamily: isNum ? 'monospace' : undefined,
                                      color: '#2563eb', textDecoration: 'underline',
                                      textDecorationStyle: 'dotted', background: 'none',
                                      border: 'none', padding: 0, cursor: 'pointer',
                                      fontSize: 'inherit', textAlign: isNum ? 'right' : 'left',
                                    }}
                                  >
                                    {displayVal}
                                  </button>
                                ) : (
                                  <span>{displayVal}</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {sortedRows.length === 0 && (
                    <div className="py-12 text-center text-muted-foreground text-sm">
                      Nenhum dado retornado pela query.
                    </div>
                  )}
                </div>

                {/* pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 flex-wrap gap-2">
                    <span className="text-xs text-muted-foreground">
                      Exibindo {((safePage - 1) * PAGE_SIZE + 1).toLocaleString('pt-BR')}–{Math.min(safePage * PAGE_SIZE, sortedRows.length).toLocaleString('pt-BR')} de {sortedRows.length.toLocaleString('pt-BR')} linhas
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setCurrentPage(1)} disabled={safePage === 1} className="p-1.5 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors" title="Primeira"><ChevronsLeft  className="h-4 w-4" /></button>
                      <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1} className="p-1.5 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors" title="Anterior"><ChevronLeft   className="h-4 w-4" /></button>

                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const page = totalPages <= 5 ? i + 1
                          : safePage <= 3 ? i + 1
                          : safePage >= totalPages - 2 ? totalPages - 4 + i
                          : safePage - 2 + i;
                        return (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`min-w-[2rem] h-8 px-2 rounded text-xs font-medium transition-colors ${
                              page === safePage ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      })}

                      <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="p-1.5 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors" title="Próxima"><ChevronRight  className="h-4 w-4" /></button>
                      <button onClick={() => setCurrentPage(totalPages)} disabled={safePage === totalPages} className="p-1.5 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors" title="Última"><ChevronsRight className="h-4 w-4" /></button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* attachments */}
            <AttachmentsCard dashboardId={Number(id)} readOnly={!admin} />
          </>
        )}
      </div>

      {/* ── drill-down modal ────────────────────────────────────────────── */}
      <Dialog open={!!drillState} onOpenChange={open => { if (!open) setDrillState(null); }}>
        <DialogContent style={{ maxWidth: '90vw', width: '960px', height: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '1.25rem' }}>
          <DialogHeader style={{ flexShrink: 0 }}>
            <DialogTitle style={{ fontSize: '1rem' }}>
              {drillState?.title || 'Detalhe'}
            </DialogTitle>
          </DialogHeader>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

            {/* inputs para parâmetros extras */}
            {drillState && Object.keys(drillState.extraParams).length > 0 && (
              <div className="bg-muted/50 border rounded-lg" style={{ padding: '0.875rem', flexShrink: 0 }}>
                <p className="text-muted-foreground" style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.625rem' }}>
                  Parâmetros <span style={{ fontWeight: 400 }}>(Enter para re-executar)</span>
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  {Object.entries(drillState.extraParams).map(([name, value]) => {
                    const isDate = /dt|data|date|ini|fim|start|end|from|to/.test(name.toLowerCase());
                    return (
                      <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '160px' }}>
                        <label className="text-muted-foreground" style={{ fontSize: '0.75rem', fontWeight: 500, fontFamily: 'monospace' }}>@{name}</label>
                        <input
                          type={isDate ? 'date' : 'text'}
                          value={value}
                          onChange={e => setDrillState(s => s ? { ...s, extraParams: { ...s.extraParams, [name]: e.target.value } } : null)}
                          onKeyDown={e => { if (e.key === 'Enter' && drillState) runDrill({ ...drillState, extraParams: { ...drillState.extraParams, [name]: (e.target as HTMLInputElement).value } }); }}
                          className="bg-background text-foreground border border-input"
                          style={{ height: '2rem', padding: '0 0.5rem', borderRadius: '0.375rem', fontSize: '0.8125rem', outline: 'none', boxSizing: 'border-box' }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {drillState?.loading && (
              <div className="text-muted-foreground" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '0.75rem' }}>
                <svg className="animate-spin" style={{ width: '1.5rem', height: '1.5rem' }} viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span style={{ fontSize: '0.875rem' }}>Executando...</span>
              </div>
            )}

            {drillState?.error && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '1rem', background: 'hsl(0 84.2% 60.2% / 0.1)', borderRadius: '0.5rem', color: 'hsl(var(--destructive))' }}>
                <AlertCircle style={{ width: '1.25rem', height: '1.25rem', flexShrink: 0, marginTop: '0.125rem' }} />
                <div>
                  <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>Erro ao executar</p>
                  <pre style={{ fontSize: '0.75rem', marginTop: '0.25rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace', opacity: 0.8 }}>{drillState.error}</pre>
                </div>
              </div>
            )}

            {drillState?.result && !drillState.loading && (() => {
              const r = drillState.result;
              const drillNumCols = new Set(
                r.columns.map(c => c.name).filter(n => r.rows.length > 0 && isNumericVal(r.rows[0][n]))
              );
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1, minHeight: 0 }}>
                  <div className="text-muted-foreground" style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', flexShrink: 0, alignItems: 'center' }}>
                    <span>{r.rowCount.toLocaleString('pt-BR')} linhas</span>
                    <span>·</span>
                    <span>{r.columns.length} colunas</span>
                    <span>·</span>
                    <span>{r.executionTime}ms</span>
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => exportExcel(r.columns, r.rows, drillState.title)}
                        className="bg-background text-foreground border border-input hover:bg-muted"
                        style={{ display:'flex',alignItems:'center',gap:'0.3rem',padding:'0.2rem 0.6rem',borderRadius:'0.35rem',fontSize:'0.75rem',fontWeight:500,cursor:'pointer' }}
                      >
                        <FileSpreadsheet style={{ width: '0.8rem', height: '0.8rem' }} />Excel
                      </button>
                      <button
                        onClick={() => exportPdf(r.columns, r.rows, drillState.title)}
                        className="bg-background text-foreground border border-input hover:bg-muted"
                        style={{ display:'flex',alignItems:'center',gap:'0.3rem',padding:'0.2rem 0.6rem',borderRadius:'0.35rem',fontSize:'0.75rem',fontWeight:500,cursor:'pointer' }}
                      >
                        <FileText style={{ width: '0.8rem', height: '0.8rem' }} />PDF
                      </button>
                    </span>
                  </div>
                  <div className="border" style={{ overflow: 'auto', flex: 1, minHeight: 0, borderRadius: '0.5rem' }}>
                    <table style={{ width: '100%', fontSize: '0.8125rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr className="bg-muted/60 border-b">
                          {r.columns.map(col => (
                            <th
                              key={col.name}
                              className="text-muted-foreground bg-muted/60"
                              style={{
                                padding: '0.5rem 0.75rem', fontWeight: 600,
                                whiteSpace: 'nowrap', textAlign: drillNumCols.has(col.name) ? 'right' : 'left',
                                position: 'sticky', top: 0, zIndex: 1,
                              }}
                            >
                              {col.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {r.rows.map((row, ridx) => (
                          <tr key={ridx} className={`border-b ${ridx % 2 === 1 ? 'bg-muted/20' : 'bg-background'}`}>
                            {r.columns.map(col => {
                              const val = row[col.name];
                              const isNull = val === null || val === undefined;
                              const isNum  = drillNumCols.has(col.name);
                              return (
                                <td
                                  key={col.name}
                                  className="text-foreground"
                                  style={{
                                    padding: '0.4rem 0.75rem', whiteSpace: 'nowrap',
                                    textAlign: isNum ? 'right' : 'left',
                                    fontFamily: isNum ? 'monospace' : undefined,
                                  }}
                                >
                                  {isNull
                                    ? <span className="text-muted-foreground" style={{ fontStyle: 'italic', fontSize: '0.75rem' }}>NULL</span>
                                    : formatValue(val)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {r.rows.length === 0 && (
                      <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>
                        Nenhum dado retornado.
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
