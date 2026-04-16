# GVM Dashboard — Documentação Completa do Projeto

## Visão Geral

Sistema web de dashboards dinâmicos com queries MySQL. Permite que administradores cadastrem consultas SQL com parâmetros dinâmicos e as disponibilizem para usuários. Cada dashboard pode ter filtros (parâmetros), gráficos e exportação de dados.

---

## Stack Tecnológica

### Backend
- **Node.js** com **Express**
- **MySQL2** (pool de conexões com Promises)
- **bcryptjs** para hash de senhas
- **jsonwebtoken** para autenticação JWT
- **dotenv** para variáveis de ambiente
- Porta padrão: `3002`

### Frontend
- **React 18** + **Vite** + **TypeScript**
- **Tailwind CSS** + **shadcn/ui** (componentes: Card, Button, Badge, Dialog, Toast)
- **TanStack React Query v5** para cache e requisições
- **React Router v6** para navegação
- **Recharts** para gráficos
- **xlsx** para exportação Excel
- **jsPDF** + **jspdf-autotable** para exportação PDF
- Porta padrão: `5173`

### Gerenciamento de Processos
- **PM2** gerencia backend e frontend
- Configuração em `ecosystem.config.cjs`
- Frontend iniciado via `start-frontend.js` (Vite programático, sem janela CMD)

---

## Estrutura de Arquivos

```
D:\GVM\GVMDASHBOARD\
├── backend/
│   ├── .env                    # Variáveis de ambiente (única fonte de config)
│   ├── server.js               # Entry point Express
│   ├── db.js                   # Pool MySQL2
│   ├── middleware/
│   │   └── auth.js             # Middleware JWT (popula req.user)
│   └── routes/
│       ├── auth.js             # POST /api/auth/login
│       ├── dashboards.js       # CRUD /api/dashboards (com filtro por permissão)
│       ├── query.js            # POST /api/query/execute
│       └── users.js            # CRUD /api/users + permissões
├── frontend/
│   ├── vite.config.ts          # Proxy /api → backend
│   └── src/
│       ├── main.tsx            # Entry point React
│       ├── App.tsx             # Rotas (PrivateRoute + AdminRoute)
│       ├── lib/
│       │   ├── queryClient.ts  # Instância compartilhada do React Query
│       │   └── utils.ts        # cn() helper
│       ├── services/
│       │   └── api.ts          # Todas as chamadas à API + helpers
│       ├── components/
│       │   └── layout/
│       │       └── AppLayout.tsx  # Layout com sidebar (menu condicional por nível)
│       └── pages/
│           ├── Login.tsx
│           ├── Dashboards.tsx       # Lista de dashboards
│           ├── DashboardCreate.tsx  # Criar/editar dashboard
│           ├── DashboardView.tsx    # Visualizar dashboard com gráfico e tabela
│           ├── Users.tsx            # Lista de usuários (admin only)
│           └── UserCreate.tsx       # Criar/editar usuário (admin only)
├── ecosystem.config.cjs        # Config PM2
├── start-frontend.js           # Wrapper Node para iniciar Vite sem CMD
├── database.sql                # Script completo do banco
└── PROJETO.md                  # Este arquivo
```

---

## Variáveis de Ambiente (`backend/.env`)

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=gvmadminjuma       # banco MySQL
DB_USER=root
DB_PASS=gvmgvm
JWT_SECRET=gvmdashboard_secret_2024   # chave de assinatura JWT
JWT_EXPIRES=8h                         # validade do token
PORT=3002                              # porta do backend
FRONT_PORT=5173                        # porta do frontend (lida por start-frontend.js)
PAGE_SIZE=50                           # linhas por página na tabela
DASH_REFRESH=300                       # auto-refresh em segundos (0 = desativado)
```

---

## Banco de Dados

### Tabelas

#### `gvmdash_users`
```sql
id         INT AUTO_INCREMENT PRIMARY KEY
usuario    VARCHAR(100) UNIQUE NOT NULL      -- login
nome       VARCHAR(255)                      -- nome completo
senha      VARCHAR(255) NOT NULL             -- hash bcrypt
nivel      ENUM('admin','usuario') DEFAULT 'usuario'
ativo      TINYINT(1) DEFAULT 1
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

#### `dashboards`
```sql
id         INT AUTO_INCREMENT PRIMARY KEY
nome       VARCHAR(255) NOT NULL
descricao  TEXT
sql_query  TEXT NOT NULL                     -- query SELECT com @params
params     JSON DEFAULT NULL                 -- array de DashboardParam
chart_type VARCHAR(20) DEFAULT 'bar'         -- tipo padrão do gráfico
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMP ... ON UPDATE CURRENT_TIMESTAMP
```

#### `dashboard_permissions`
```sql
id           INT AUTO_INCREMENT PRIMARY KEY
user_id      INT NOT NULL
dashboard_id INT NOT NULL
UNIQUE KEY (user_id, dashboard_id)
```

### Migrações
As tabelas e colunas são criadas/adicionadas automaticamente ao iniciar o backend via `ensureTable()` / `ensureSchema()` em cada arquivo de rota. Não há migration runner separado.

---

## Autenticação e Autorização

- Login via `POST /api/auth/login` retorna JWT com `{ id, usuario, nome, nivel }`
- Token armazenado em `localStorage` (`gvm_token`)
- Dados do usuário em `localStorage` (`gvm_user`) — inclui `nivel`
- Middleware `auth.js` valida o token e popula `req.user`
- Em 401: frontend remove token e redireciona para `/login`
- Flag `_redirecting` evita redirecionamentos duplicados

### Níveis de acesso

| Funcionalidade | `admin` | `usuario` |
|---|---|---|
| Ver dashboards | Todos | Apenas os liberados |
| Criar/editar/excluir dashboard | ✓ | ✗ |
| Ver SQL e botão Editar no view | ✓ | ✗ |
| Alterar parâmetros do dashboard | ✓ | ✓ |
| Gerenciar usuários | ✓ | ✗ |

---

## Funcionalidades

### Dashboards

**Cadastro (`DashboardCreate.tsx`)**
- Nome, descrição, SQL (editor com fundo escuro/verde)
- Parâmetros dinâmicos: detecta `@nome_param` no SQL automaticamente ou adiciona manualmente
- Cada parâmetro tem: nome, label, tipo (`date/string/integer/decimal`), valor padrão
- Seletor visual de tipo de gráfico padrão (6 opções com miniatura SVG)
- Validação: apenas SELECT permitido

**Visualização (`DashboardView.tsx`)**
- Parâmetros renderizados com input correto por tipo (date picker, number, text)
- Botão "Executar Query" aplica os parâmetros e roda o SQL
- Auto-refresh configurável via `DASH_REFRESH` no .env (contador regressivo visível)
- Gráfico com 5 tipos selecionáveis em tempo real: Barras, Linha, Área, Pizza, Rosca
  - Barras: gradiente, bordas arredondadas
  - Área: fill com gradiente translúcido
  - Pizza/Rosca: fatias coloridas com labels percentuais
  - YAxis formata grandes números (1k, 1M)
- Tabela de resultados:
  - Container com `max-height: 70vh` e scroll nos dois eixos
  - Cabeçalho sticky (fica fixo ao rolar verticalmente)
  - Ordenação por clique no cabeçalho (asc/desc/none)
  - Valores numéricos alinhados à direita com fonte monospace
  - NULL exibido em itálico
  - Paginação com `PAGE_SIZE` linhas por página
  - Botões Excel e PDF exportam TODAS as linhas (não só a página atual)
- Cards de estatísticas: total de linhas, colunas, tempo de execução, página atual

**Parâmetros SQL**
- Sintaxe: `@nome_param` no SQL (ex: `@dt_ini`, `@dt_fim`)
- Não colocar aspas no SQL — a função `applyParamsToSql` adiciona automaticamente
- Correto: `WHERE data BETWEEN @dt_ini AND @dt_fim`
- Errado: `WHERE data BETWEEN '@dt_ini' AND '@dt_fim'`
- Substituição: numéricos sem aspas, datas e texto com aspas simples, vazio = NULL

### Usuários

**Lista (`Users.tsx`)** — admin only
- Tabela com login, nome, nível (badge colorido), status ativo/inativo
- Botões editar e excluir por linha

**Cadastro (`UserCreate.tsx`)** — admin only
- Login, nome, senha + confirmação, nível (Admin/Usuário), ativo
- Se nível = Usuário: seletor de dashboards com checkboxes
- Se nível = Admin: aviso que tem acesso total, não salva permissões individuais
- Permissões salvas na tabela `dashboard_permissions`

---

## API — Endpoints

### Auth
```
POST /api/auth/login          { usuario, senha } → { token, user }
```

### Config (público)
```
GET  /api/config              → { pageSize, dashRefresh }
```

### Dashboards (requer token)
```
GET  /api/dashboards          → lista (admin=todos, user=somente permitidos)
GET  /api/dashboards/:id      → detalhe (user sem permissão → 403)
POST /api/dashboards          → criar (admin only na UI, não no backend)
PUT  /api/dashboards/:id      → editar
DELETE /api/dashboards/:id    → excluir
```

### Query (requer token)
```
POST /api/query/execute       { sql, dashboard_id } → { columns, rows, rowCount, executionTime }
```

### Usuários (requer token admin)
```
GET  /api/users               → lista de usuários
GET  /api/users/:id           → detalhe
POST /api/users               → criar usuário
PUT  /api/users/:id           → editar usuário
DELETE /api/users/:id         → excluir (não pode excluir a si mesmo)
GET  /api/users/:id/permissions   → [dashboard_id, ...]
PUT  /api/users/:id/permissions   → { dashboard_ids: [...] }
```

---

## Frontend — Detalhes Importantes

### `api.ts` — Funções e Tipos
```typescript
// Tipos principais
type ParamType = 'date' | 'string' | 'integer' | 'decimal'
type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'none'
type UserNivel = 'admin' | 'usuario'

interface DashboardParam { name, label, type: ParamType, defaultValue }
interface Dashboard { id, nome, descricao, sql_query, params, chart_type, created_at, updated_at }
interface UserRecord { id, usuario, nome, nivel, ativo, created_at }

// Helpers de params (usados em Create e View)
extractSqlParams(sql)          // detecta @params no SQL
guessParamType(name)           // infere tipo pelo nome
getParamDefault(name, type)    // valor padrão inteligente
applyParamsToSql(sql, params)  // substitui @params pelos valores

// Auth helpers
getUser()     // lê do localStorage (inclui nivel)
isAdmin()     // verifica se nivel === 'admin'
removeToken() // limpa localStorage

// Login limpa cache React Query antes de salvar nova sessão
```

### Cache React Query
- Instância compartilhada em `src/lib/queryClient.ts`
- `queryClient.clear()` chamado no logout (AppLayout) e no login (api.ts)
- Evita que dados de um usuário apareçam para outro na mesma sessão do navegador

### Inputs — Decisão de Implementação
- **Não usar** os componentes `<Input>` e `<Textarea>` do shadcn/ui em formulários
- Esses componentes têm problema de `forwardRef` que impede digitação
- Usar sempre `<input>` e `<textarea>` HTML nativos com `style` inline
- Isso vale para qualquer novo formulário no projeto

### Rotas
```
/                    → redireciona conforme token
/login               → pública
/dashboards          → PrivateRoute
/dashboards/:id      → PrivateRoute
/dashboards/new      → AdminRoute
/dashboards/:id/edit → AdminRoute
/users               → AdminRoute
/users/new           → AdminRoute
/users/:id/edit      → AdminRoute
```

---

## PM2 — Comandos

```bash
# Iniciar tudo
pm2 start ecosystem.config.cjs

# Reiniciar
pm2 restart gvm-backend
pm2 restart gvm-frontend
pm2 restart all

# Ver status
pm2 list

# Ver logs em tempo real
pm2 logs
pm2 logs gvm-backend
pm2 logs gvm-frontend

# Parar / deletar
pm2 stop all
pm2 delete all

# Salvar lista para iniciar no boot
pm2 save
pm2 startup
```

---

## Decisões e Problemas Conhecidos

| Situação | Decisão |
|---|---|
| Inputs não aceitam digitação | shadcn `<Input>` tem bug de forwardRef — usar `<input>` nativo |
| Frontend sem janela CMD | Vite iniciado programaticamente via `start-frontend.js` |
| Config centralizada | Apenas `backend/.env` — frontend busca via `GET /api/config` |
| Parâmetros SQL com aspas duplas | Não colocar aspas no SQL; `applyParamsToSql` faz isso |
| Cache entre usuários | `queryClient.clear()` no login e logout |
| Porta 3001 já em uso | Backend movido para `3002`; proxy do Vite atualizado |
| Tabela larga | `overflow: auto` + `max-height: 70vh` + `thead sticky` |

---

## Senhas e Segurança

- Senhas hasheadas com **bcrypt** (fator 10) — não é possível reverter
- Para resetar senha via terminal:
  ```bash
  node -e "require('bcryptjs').hash('nova_senha', 10).then(h => console.log(h))"
  ```
  Depois: `UPDATE gvmdash_users SET senha = '$2a$10$...' WHERE usuario = 'admin';`
- `JWT_SECRET` deve ser longo e aleatório em produção:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
