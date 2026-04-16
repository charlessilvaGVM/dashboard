const BASE_URL = '/api';

// ── Token ────────────────────────────────────────────────────────────────────
export type UserNivel = 'admin' | 'usuario';

export function getToken(): string | null  { return localStorage.getItem('gvm_token'); }
export function setToken(t: string): void  { localStorage.setItem('gvm_token', t); }
export function removeToken(): void {
  localStorage.removeItem('gvm_token');
  localStorage.removeItem('gvm_user');
}
export function getUser(): { id: number; usuario: string; nome?: string; nivel: UserNivel } | null {
  try { return JSON.parse(localStorage.getItem('gvm_user') || ''); } catch { return null; }
}
export function setUser(u: { id: number; usuario: string; nome?: string; nivel: UserNivel }): void {
  localStorage.setItem('gvm_user', JSON.stringify(u));
}
export function isAdmin(): boolean { return getUser()?.nivel === 'admin'; }

// ── Core request ──────────────────────────────────────────────────────────────
let _redirecting = false;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    if (response.status === 401 && !_redirecting) {
      _redirecting = true;
      removeToken();
      window.location.href = '/login';
    }
    throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
  }
  return data as T;
}

// ── App config (from backend .env) ────────────────────────────────────────────
export interface AppConfig { pageSize: number; dashRefresh: number; }

export async function getConfig(): Promise<AppConfig> {
  try {
    const r = await fetch(`${BASE_URL}/config`);
    if (!r.ok) throw new Error();
    return r.json();
  } catch {
    return { pageSize: 50, dashRefresh: 0 };
  }
}

// ── Dashboard param types ─────────────────────────────────────────────────────
export type ParamType = 'date' | 'string' | 'integer' | 'decimal';

export interface DashboardParam {
  name: string;
  label: string;
  type: ParamType;
  defaultValue: string;
}

export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'none';

export interface DashboardLink {
  clickColumn: string;   // coluna que fica clicável (exibe o link)
  valueColumn: string;   // coluna cujo valor é passado para o @param
  label: string;         // título do painel de detalhe
  sql: string;           // SQL do detalhe com @param
  paramName: string;     // nome do @param que recebe o valor
}

export interface ChartConfig {
  labelCol: string;    // coluna do eixo X / categoria
  valueCols: string[]; // colunas das séries (eixo Y)
}

export interface DashboardAction {
  label: string;             // texto do botão
  sourceColumn: string;      // coluna cujo valor vira parâmetro
  targetDashboardId: number; // dashboard destino
  targetParam: string;       // @param no dashboard destino
}

export interface Dashboard {
  id: number;
  nome: string;
  descricao: string | null;
  sql_query: string;
  chart_sql_query: string | null;
  params: DashboardParam[] | null;
  chart_type: ChartType;
  links: DashboardLink[] | null;
  actions: DashboardAction[] | null;
  chart_config: ChartConfig | null;
  created_at: string;
  updated_at: string;
}

// ── Param helpers (shared by Create and View) ─────────────────────────────────
export function extractSqlParams(sql: string): string[] {
  const matches = sql.match(/@[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
  return [...new Set(matches)].map(p => p.slice(1));
}

export function guessParamType(name: string): ParamType {
  const l = name.toLowerCase();
  if (l.includes('dt') || l.includes('data') || l.includes('date')) return 'date';
  if (l.includes('valor') || l.includes('preco') || l.includes('total') || l.includes('pct') || l.includes('perc')) return 'decimal';
  if (l.includes('qtd') || l.includes('num') || l === 'id' || l.endsWith('_id') || l.includes('cod')) return 'integer';
  return 'string';
}

export function getParamDefault(name: string, type: ParamType): string {
  if (type === 'date') {
    const l = name.toLowerCase();
    if (l.includes('ini') || l.includes('inicio') || l.includes('start') || l.includes('from') || l.includes('de'))
      return `${new Date().getFullYear()}-01-01`;
    return new Date().toISOString().split('T')[0];
  }
  return '';
}

// Normaliza data para YYYY-MM-DD (aceita DD/MM/YYYY, DD-MM-YYYY, YYYY/MM/DD, YYYY-MM-DD)
function normalizeDate(v: string): string {
  // DD/MM/YYYY ou DD-MM-YYYY
  const dmy = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
  // YYYY/MM/DD
  const ymd = v.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2,'0')}-${ymd[3].padStart(2,'0')}`;
  // já está no formato correto YYYY-MM-DD
  return v;
}

function isDateLike(v: string): boolean {
  return /^\d{1,4}[\-\/]\d{1,2}[\-\/]\d{1,4}$/.test(v.trim());
}

export function applyParamsToSql(sql: string, params: Record<string, string>): string {
  let result = sql;
  for (const [key, value] of Object.entries(params)) {
    const v = value.trim();
    let formatted: string;
    if (v === '') {
      formatted = 'NULL';
    } else if (/^-?\d+(\.\d+)?$/.test(v)) {
      formatted = v;                              // numérico — sem aspas
    } else if (isDateLike(v)) {
      formatted = `'${normalizeDate(v)}'`;        // data — normaliza para YYYY-MM-DD
    } else {
      formatted = `'${v.replace(/'/g, "''")}'`;  // texto genérico
    }
    result = result.replace(new RegExp(`@${key}(?![a-zA-Z0-9_])`, 'gi'), formatted);
  }
  return result;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function login(usuario: string, senha: string) {
  const data = await request<{ token: string; user: { id: number; usuario: string; nome?: string; nivel: UserNivel } }>(
    'POST', '/auth/login', { usuario, senha }
  );
  // clear React Query cache before storing new session so stale data from
  // a previous user never leaks into the new session
  const { queryClient: qc } = await import('@/lib/queryClient');
  qc.clear();
  setToken(data.token);
  setUser(data.user);
  return data;
}

// ── Users ─────────────────────────────────────────────────────────────────────
export interface UserRecord {
  id: number;
  usuario: string;
  nome: string | null;
  nivel: UserNivel;
  ativo: number;
  created_at?: string;
}

export async function getUsers(): Promise<UserRecord[]> {
  return request<UserRecord[]>('GET', '/users');
}
export async function getUser2(id: number): Promise<UserRecord> {
  return request<UserRecord>('GET', `/users/${id}`);
}
export async function createUser(data: { usuario: string; nome?: string; senha: string; nivel: UserNivel; ativo?: boolean }): Promise<UserRecord> {
  return request<UserRecord>('POST', '/users', data);
}
export async function updateUser(id: number, data: { usuario: string; nome?: string; senha?: string; nivel: UserNivel; ativo?: boolean }): Promise<UserRecord> {
  return request<UserRecord>('PUT', `/users/${id}`, data);
}
export async function deleteUser(id: number): Promise<{ message: string }> {
  return request<{ message: string }>('DELETE', `/users/${id}`);
}
export async function getUserPermissions(id: number): Promise<number[]> {
  return request<number[]>('GET', `/users/${id}/permissions`);
}
export async function setUserPermissions(id: number, dashboard_ids: number[]): Promise<number[]> {
  return request<number[]>('PUT', `/users/${id}/permissions`, { dashboard_ids });
}

// ── Dashboards ────────────────────────────────────────────────────────────────
export async function getDashboards(): Promise<Dashboard[]> {
  return request<Dashboard[]>('GET', '/dashboards');
}
export async function getDashboard(id: number): Promise<Dashboard> {
  return request<Dashboard>('GET', `/dashboards/${id}`);
}
export async function createDashboard(data: { nome: string; descricao?: string; sql_query: string; chart_sql_query?: string | null; params?: DashboardParam[]; chart_type?: ChartType; links?: DashboardLink[]; actions?: DashboardAction[] }): Promise<Dashboard> {
  return request<Dashboard>('POST', '/dashboards', data);
}
export async function updateDashboard(id: number, data: { nome: string; descricao?: string; sql_query: string; chart_sql_query?: string | null; params?: DashboardParam[]; chart_type?: ChartType; links?: DashboardLink[]; actions?: DashboardAction[] }): Promise<Dashboard> {
  return request<Dashboard>('PUT', `/dashboards/${id}`, data);
}
export async function deleteDashboard(id: number): Promise<{ message: string }> {
  return request<{ message: string }>('DELETE', `/dashboards/${id}`);
}
export async function saveChartConfig(id: number, chart_config: ChartConfig | null): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('PATCH', `/dashboards/${id}/chart-config`, { chart_config });
}

// ── Attachments ───────────────────────────────────────────────────────────────
export interface Attachment {
  id: number;
  filename: string;
  original_name: string;
  size: number;
  created_at: string;
}

export async function getAttachments(dashboardId: number): Promise<Attachment[]> {
  return request<Attachment[]>('GET', `/attachments/${dashboardId}`);
}

export async function uploadAttachment(dashboardId: number, file: File): Promise<Attachment> {
  const token = getToken();
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${BASE_URL}/attachments/${dashboardId}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Erro ao enviar arquivo');
  return data as Attachment;
}

export async function deleteAttachment(id: number): Promise<void> {
  await request('DELETE', `/attachments/file/${id}`);
}

export async function downloadAttachment(id: number, originalName: string): Promise<void> {
  const token = getToken();
  const response = await fetch(`${BASE_URL}/attachments/file/${id}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error('Erro ao baixar arquivo');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = originalName;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Query ─────────────────────────────────────────────────────────────────────
export interface QueryResult {
  columns: Array<{ name: string; type: string }>;
  rows: Record<string, unknown>[];
  rowCount: number;
  returnedRows: number;
  truncated: boolean;
  executionTime: number;
}
// C2 — params enviados separados; backend usa prepared statements
export async function executeQuery(sql: string, params?: Record<string, string>, dashboard_id?: number): Promise<QueryResult> {
  return request<QueryResult>('POST', '/query/execute', { sql, params: params ?? {}, dashboard_id });
}

// M3 — logout revoga o token no backend
export async function logoutApi(): Promise<void> {
  await request('POST', '/auth/logout', {});
}
export async function testQuery(sql: string): Promise<{ valid: boolean; error?: string }> {
  return request<{ valid: boolean; error?: string }>('POST', '/query/test', { sql });
}
