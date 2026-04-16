# Auditoria de Segurança — GVM Dashboard
**Data:** 2026-04-15  
**Avaliador:** Claude Sonnet 4.6  
**Última atualização:** 2026-04-16 — Fases 1, 2, 3 e nova auditoria implementadas

---

## Resumo Executivo

24 vulnerabilidades originais + 7 novas encontradas = 31 total. 3 críticas, 7 altas, 10 médias, 2 baixas originais + 7 novas (N1–N7).  
**Status atual:** 28 corrigidas. 3 pendentes por decisão.  
Restam pendentes (decisão do responsável): C3 (HTTPS/TLS), B1 (usuário MySQL mínimo), B2 (histórico git).

---

## CRÍTICO

### C1 — Fallback hardcoded no JWT secret ✅ CORRIGIDO
**Arquivos:** `backend/middleware/auth.js`, `backend/routes/auth.js`  
**Problema:** Se `JWT_SECRET` não estiver no `.env`, o sistema usa a string fixa `'gvmdashboard_secret_2024'`. Qualquer pessoa que conheça esse valor pode forjar tokens de administrador.
```js
// Código atual (INSEGURO)
jwt.verify(token, process.env.JWT_SECRET || 'gvmdashboard_secret_2024')
jwt.sign({ ... }, process.env.JWT_SECRET || 'gvmdashboard_secret_2024', ...)
```
**Correção:**
```js
// Em server.js — validar na inicialização
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET obrigatório e deve ter no mínimo 32 caracteres');
}
// Gerar um segredo forte: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### C2 — SQL Injection via substituição de parâmetros no frontend ✅ CORRIGIDO
**Arquivo:** `frontend/src/services/api.ts:146-163`  
**Problema:** A função `applyParamsToSql()` monta o SQL completo no frontend (substituindo `@params` pelos valores) e envia o SQL já montado ao backend. Um usuário pode manipular parâmetros para injetar SQL.
```ts
// O backend recebe o SQL já com os valores substituídos — sem prepared statements
formatted = v; // valores numéricos inseridos diretamente, sem aspas
```
**Correção:** Enviar `{ sql, params }` separados ao backend e executar com prepared statements no servidor. O frontend não deve montar SQL.

---

### C3 — HTTPS não configurado
**Arquivo:** `backend/server.js`  
**Problema:** O servidor roda apenas em HTTP. Tokens JWT, credenciais e dados trafegam em texto puro — vulnerável a MITM.  
**Correção:** Configurar TLS no servidor Express ou usar um proxy reverso (nginx/caddy) com certificado SSL em produção.

---

## ALTO

### A1 — Endpoints de dashboard sem verificação de admin ✅ CORRIGIDO
**Arquivo:** `backend/routes/dashboards.js`  
**Problema:** Qualquer usuário autenticado pode criar, editar e deletar dashboards.
```js
router.post('/', async (req, res) => { ... })       // SEM adminOnly
router.put('/:id', async (req, res) => { ... })     // SEM adminOnly
router.delete('/:id', async (req, res) => { ... })  // SEM adminOnly
router.patch('/:id/chart-config', async (req, res) => { ... }) // SEM verificação
```
**Correção:** Adicionar middleware `adminOnly` em todos os endpoints de escrita:
```js
router.post('/', adminOnly, async (req, res) => { ... })
router.put('/:id', adminOnly, async (req, res) => { ... })
router.delete('/:id', adminOnly, async (req, res) => { ... })
```

---

### A2 — Upload de arquivo sem validação de tipo nem limite de tamanho ✅ CORRIGIDO
**Arquivo:** `backend/routes/attachments.js:10-22`  
**Problema:** Aceita qualquer tipo de arquivo (`.exe`, `.php`, `.html`, etc.) sem limite de tamanho. Pode levar a execução de código (se servidor web mal configurado) ou esgotamento de disco.
```js
const upload = multer({ storage }); // SEM fileFilter e SEM limits
```
**Correção:**
```js
const ALLOWED_MIME_TYPES = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
  'image/jpeg', 'image/png',
  'application/zip', 'application/x-rar-compressed',
];
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Tipo de arquivo não permitido'));
    }
    cb(null, true);
  },
});
```

---

### A3 — Upload sem verificação de permissão no dashboard ✅ CORRIGIDO
**Arquivo:** `backend/routes/attachments.js:54-69`  
**Problema:** Qualquer usuário autenticado pode fazer upload em qualquer dashboard, mesmo sem ter acesso a ele.  
**Correção:** Verificar se o usuário tem permissão no dashboard antes de aceitar o arquivo. Se não for admin, consultar `dashboard_permissions`. Deletar o arquivo do disco se a verificação falhar.

---

### A4 — Download sem verificação de permissão ✅ CORRIGIDO
**Arquivo:** `backend/routes/attachments.js:71-86`  
**Problema:** Qualquer usuário autenticado pode baixar qualquer anexo de qualquer dashboard.  
**Correção:** Ao buscar o arquivo, também recuperar o `dashboard_id` e verificar permissão do usuário antes de servir o arquivo.

---

### A5 — Path Traversal no download de arquivo ✅ CORRIGIDO
**Arquivo:** `backend/routes/attachments.js:81`  
**Problema:** O `filename` vem do banco de dados sem sanitização. Se o banco for comprometido, poderia ler arquivos fora de `uploads/`.
```js
const filePath = path.join(UPLOADS_DIR, filename); // sem sanitização
```
**Correção:**
```js
const sanitized = path.basename(filename);
const filePath = path.join(UPLOADS_DIR, sanitized);
const resolved = path.resolve(filePath);
if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) {
  return res.status(400).json({ error: 'Caminho inválido' });
}
```

---

### A6 — Sem rate limiting ✅ CORRIGIDO
**Arquivos:** `backend/routes/auth.js`, `backend/routes/query.js`, `backend/routes/attachments.js`  
**Problema:**
- Login sem limite → força bruta de senha
- `/query/execute` sem limite → DOS com queries pesadas
- Upload sem limite → esgotamento de disco
**Correção:** Instalar `express-rate-limit` e aplicar por rota:
```js
npm install express-rate-limit

const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
const queryLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
const uploadLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });

router.post('/login', loginLimiter, async (req, res) => { ... });
router.post('/execute', queryLimiter, async (req, res) => { ... });
router.post('/:dashboardId', uploadLimiter, upload.single('file'), ...);
```

---

### A7 — Sem security headers HTTP ✅ CORRIGIDO
**Arquivo:** `backend/server.js`  
**Problema:** Faltam `X-Frame-Options`, `X-Content-Type-Options`, `Content-Security-Policy`, `X-XSS-Protection`, etc.  
**Correção:**
```js
npm install helmet

const helmet = require('helmet');
app.use(helmet()); // adicionar antes das rotas
```

---

## MÉDIO

### M1 — Mensagens de erro revelam internos do sistema ✅ CORRIGIDO
**Arquivo:** `backend/routes/auth.js:44`
```js
// INSEGURO — err.message pode expor nomes de tabelas, colunas, paths
res.status(500).json({ error: 'Erro interno ao autenticar: ' + err.message });
```
**Correção:** Logar o erro no servidor, mas enviar mensagem genérica ao cliente:
```js
console.error('[auth/login]', err);
res.status(500).json({ error: 'Erro interno ao autenticar' });
```
Aplicar o mesmo padrão em todos os outros `catch` das rotas.

---

### M2 — Validação de senha fraca ✅ CORRIGIDO
**Arquivo:** `backend/routes/users.js:72-94`  
**Problema:** Aceita senhas de 1 caractere. Nenhuma regra de complexidade.  
**Correção:** Mínimo de 8 caracteres. Considerar exigir letras maiúsculas, números e caracteres especiais conforme política da empresa.

---

### M3 — Sem revogação de token (logout) ✅ CORRIGIDO
**Arquivo:** `backend/middleware/auth.js`  
**Problema:** Fazer logout não invalida o JWT. O token continua válido por até 8h após sair.  
**Correção:** Manter uma lista de tokens revogados em memória (ou Redis) e checar em cada requisição. Reduzir o tempo de expiração para 30-60 minutos com refresh token.

---

### M4 — CORS hardcoded para localhost ✅ CORRIGIDO
**Arquivo:** `backend/server.js:7-11`  
**Problema:** Origins permitidos são fixos no código. Em produção, precisará mudar o código.  
**Correção:**
```js
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: true }));
```
E no `.env`:
```
ALLOWED_ORIGINS=http://localhost:5173,https://seu-dominio.com.br
```

---

### M5 — Parâmetros numéricos de URL não validados ✅ CORRIGIDO
**Arquivo:** `backend/routes/dashboards.js`, `backend/routes/attachments.js`  
**Problema:** `req.params.id` é string — não é validado como inteiro positivo antes de usar na query.  
**Correção:** Validar antes de usar:
```js
const id = Number(req.params.id);
if (!Number.isInteger(id) || id <= 0) {
  return res.status(400).json({ error: 'ID inválido' });
}
```

---

### M6 — Sem validação do objeto `chart_config` ✅ CORRIGIDO
**Arquivo:** `backend/routes/dashboards.js:172-186`  
**Problema:** Qualquer JSON é aceito e gravado no banco sem validar estrutura.  
**Correção:** Validar que `chart_config` tem `labelCol` (string) e `valueCols` (array de strings) antes de persistir.

---

### M7 — Sem validação de tamanho em campos de texto ✅ CORRIGIDO
**Arquivo:** `backend/routes/dashboards.js:130-148`  
**Problema:** `nome`, `descricao` e `sql_query` não têm limite de tamanho validado no backend.  
**Correção:** Validar comprimento máximo (ex: nome ≤ 255, descricao ≤ 2000) e retornar 400 se exceder.

---

### M8 — Sem validação dos IDs no bulk de permissões ✅ CORRIGIDO
**Arquivo:** `backend/routes/users.js:157-178`  
**Problema:** O array `dashboard_ids` não valida que todos os itens são inteiros positivos e que existem no banco.  
**Correção:** Filtrar e validar todos os IDs antes do INSERT. Limitar tamanho do array (ex: máx 500 itens).

---

### M9 — `LOG_SQL=true` pode expor dados sensíveis ✅ CORRIGIDO
**Arquivo:** `backend/routes/query.js:8-14`  
**Problema:** Com `LOG_SQL=true`, queries completas com dados reais dos clientes ficam nos logs do servidor.  
**Correção:** Usar `LOG_SQL=false` em produção. Se precisar de logs, mascarar valores sensíveis ou logar apenas o template sem os parâmetros.

---

### M10 — Sem audit log ✅ CORRIGIDO
**Arquivos:** Todos os routes  
**Problema:** Não há registro de quem criou, editou ou deletou dashboards, usuários ou arquivos. Impossível investigar incidentes.  
**Correção:** Criar tabela `audit_logs` e registrar ações críticas com `user_id`, `action`, `resource`, `resource_id`, `timestamp`.

---

## BAIXO

### B1 — Credenciais root no banco de dados
**Arquivo:** `backend/.env`  
**Problema:** `DB_USER=root` — a aplicação usa o usuário root do MySQL, que tem acesso irrestrito.  
**Correção:** Criar um usuário MySQL dedicado com permissões apenas nas tabelas necessárias (`SELECT`, `INSERT`, `UPDATE`, `DELETE` apenas no banco `gvmadminjuma`). Nunca usar root em produção.

---

### B2 — `.env` potencialmente commitado no git
**Arquivo:** `backend/.env`  
**Problema:** Se o `.env` estiver no repositório, todas as credenciais são expostas.  
**Verificação:** `git log --all -- .env` e `git ls-files .env`  
**Correção:** Adicionar `.env` ao `.gitignore`, remover do histórico com `git filter-branch` ou `BFG Repo-Cleaner` se já commitado. Rotacionar todas as credenciais.

---

## Nova Auditoria (2026-04-16)

### N1 — SQL injection via drill-down links ✅ CORRIGIDO
**Arquivo:** `backend/routes/dashboards.js`  
**Problema:** O campo `links[].sql` era salvo sem validar se era um SELECT ou se continha DML. Um admin poderia inserir `DROP TABLE` ou `UPDATE` em um link de drill-down.  
**Correção:** `validateLinks()` verifica `SELECT` no início e rejeita palavras-chave DML (INSERT, UPDATE, DELETE, DROP, etc.). Limite de 50 KB também aplicado.

---

### N2 — Sem limite de tamanho no SQL de drill-down e chart_sql_query ✅ CORRIGIDO
**Arquivo:** `backend/routes/dashboards.js`  
**Problema:** `links[].sql` e `chart_sql_query` não tinham validação de tamanho máximo.  
**Correção:** `MAX_SQL_LENGTH` (50 KB) aplicado a ambos.

---

### N3 — ALLOWED_ORIGINS vazio não travava o servidor ✅ CORRIGIDO
**Arquivo:** `backend/server.js`  
**Problema:** Se `ALLOWED_ORIGINS` fosse vazio, CORS ficava aberto sem configuração (ou comportamento indefinido).  
**Correção:** Validação de startup — `process.exit(1)` se `allowedOrigins.length === 0`.

---

### N4 — Username sem validação de formato ✅ CORRIGIDO
**Arquivo:** `backend/routes/users.js`  
**Problema:** Nomes de usuário podiam conter caracteres especiais, espaços ou HTML, facilitando ataques de enumeração ou XSS em UI que exiba o username sem escapar.  
**Correção:** `USUARIO_RE = /^[a-zA-Z0-9._]{3,50}$/` aplicada em POST e PUT `/api/users`.

---

### N5 — Nomes de coluna em actions/links sem validação ✅ CORRIGIDO
**Arquivo:** `backend/routes/dashboards.js`  
**Problema:** `clickColumn`, `valueColumn`, `paramName`, `sourceColumn`, `targetParam` eram usados diretamente para construir queries de drill-down sem validação.  
**Correção:** `IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_.]*$/` aplicada a todos os campos de coluna via `validateLinks()` e `validateActions()`.

---

### N6 — Alteração de permissões sem audit log ✅ CORRIGIDO
**Arquivo:** `backend/routes/users.js`  
**Problema:** Alterações nas permissões de dashboard de um usuário não eram registradas, dificultando auditoria de incidentes.  
**Correção:** `auditLog(req, 'update_permissions', 'user', userId, ...)` adicionado em `PUT /:id/permissions`.

---

### N7 — `descricao` sem typeof check antes de `.length` ✅ CORRIGIDO
**Arquivo:** `backend/routes/dashboards.js`  
**Problema:** `validateDescricao()` chamava `.length` antes de verificar o tipo, podendo lançar exceção com payload não-string.  
**Correção:** Adicionado `typeof d !== 'string'` check antes de `.length`.

---

## Plano de Implementação Sugerido

### Fase 1 — Imediato (1-2 dias) ✅ Concluída em 2026-04-16
- [x] C1: Remover fallback hardcoded do JWT secret; gerar novo segredo forte
- [x] A1: Adicionar `adminOnly` nos endpoints POST/PUT/DELETE/PATCH de dashboards
- [x] A5: Sanitizar `filename` no download (path traversal)
- [x] M1: Remover `err.message` das respostas de erro ao cliente

### Fase 2 — Curto prazo (1 semana) ✅ Concluída em 2026-04-16
- [x] A2: Adicionar `fileFilter` e `limits.fileSize` no multer
- [x] A3/A4: Verificar permissão do usuário no dashboard ao fazer upload e download
- [x] A6: Instalar e configurar `express-rate-limit`
- [x] A7: Instalar e configurar `helmet`
- [x] M2: Validar tamanho mínimo de senha (mínimo 8 caracteres)
- [x] M4: Mover origins do CORS para `.env` (`ALLOWED_ORIGINS`)
- [x] M5: Validar parâmetros numéricos de URL em todos os endpoints com `:id`
- [x] M6: Validar estrutura do `chart_config` antes de persistir
- [x] M7: Validar tamanho máximo de `nome` (≤255) e `descricao` (≤2000) em dashboards
- [x] M8: Validar `dashboard_ids` no bulk de permissões (tipos e limite de 500 itens)
- [x] M9: `LOG_SQL` desativado no `.env`

### Fase 3 — Médio prazo ✅ Parcialmente concluída em 2026-04-16
- [x] C2: Migrar para parameterized queries no backend — frontend envia `{ sql, params }`, backend converte `@param` → `?` com prepared statements
- [ ] C3: Configurar HTTPS/TLS em produção *(pendente — decisão de infraestrutura)*
- [x] M3: Revogação de token no logout — blacklist em memória (hash SHA-256, limpeza automática por expiração)
- [x] M10: Audit log — tabela `audit_logs` com registro de login, logout, create/update/delete de dashboards e usuários, upload/delete de arquivos
- [ ] B1: Criar usuário MySQL com privilégios mínimos *(pendente — ação manual no banco)*
- [ ] B2: Verificar e corrigir histórico do git *(pendente — ação manual no repositório)*

### Nova Auditoria — ✅ Concluída em 2026-04-16
- [x] N1: SQL injection via drill-down links — `validateLinks()` aplica SELECT-only check e bloqueia DML keywords
- [x] N2: Sem limite de tamanho no SQL de drill-down — `MAX_SQL_LENGTH` (50 KB) aplicado a `links[].sql` e `chart_sql_query`
- [x] N3: ALLOWED_ORIGINS vazio não travava o servidor — validação de startup adicionada em `server.js` (process.exit se vazio)
- [x] N4: Username sem validação de formato — `USUARIO_RE` regex aplicada em POST e PUT `/api/users`
- [x] N5: Nomes de coluna em actions/links sem validação — `IDENT_RE` regex aplicada a `clickColumn`, `valueColumn`, `paramName`, `sourceColumn`, `targetParam`
- [x] N6: Alteração de permissões sem audit log — `auditLog()` adicionado no `PUT /:id/permissions`
- [x] N7: `descricao` sem typeof check antes de `.length` — `validateDescricao()` verifica tipo antes de tamanho

---

*Documento gerado em 2026-04-15. Atualizado em 2026-04-16 com N1–N7.*
