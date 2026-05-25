# GVM Dashboard — Contexto de Sessão

Use este arquivo para retomar o desenvolvimento de onde parou.

---

## Stack

| Camada | Tecnologia | Porta |
|--------|-----------|-------|
| Backend | Node.js / Express | 3003 |
| Frontend | React + TypeScript + Vite | 5173 |
| Banco | MySQL | — |
| Processo | PM2 | — |

Repositório: `https://github.com/charlessilvaGVM/dashboard.git` (branch `master`)  
Pasta local: `D:\GVM\GVMDASHBOARD`

---

## Funcionalidades implementadas

### Parâmetros de dashboard
- **date** — seletor de data
- **string** — campo texto
- **integer** — campo numérico inteiro
- **decimal** — campo numérico decimal
- **combo** — dropdown com opções configuradas pelo admin; cada opção injeta um trecho SQL diretamente na query (ex: `GROUP BY codigo`). "Nenhum" remove o placeholder sem substituição.

### Parâmetros IN com lista numérica
- Digitar `55,100,222` como string → substitui diretamente no SQL como `IN (55, 100, 222)`

### Multi-gráficos
- Até 4 gráficos por dashboard (gráfico 1 + 3 extras opcionais)
- Cada extra tem SQL, tipo e título independentes

### Timer de auto-refresh
- Toggle ao lado do botão Executar; aparece só quando o dashboard tem intervalo configurado

### Segurança
- 28 de 31 vulnerabilidades corrigidas (C2 parameterized queries, A1–A7, M1–M10, N1–N7)
- Pendentes por decisão de infraestrutura: C3 (HTTPS), B1 (usuário MySQL limitado), B2 (histórico .env)

### Outras
- Drill-down e botões de navegação entre dashboards
- Hints de colunas, múltiplas conexões de banco, logs de execução, filtro e ordenação na tabela, paginação, exportação Excel/PDF, dark/light mode, documentação por dashboard (só admin)

---

## Arquivos principais

```
backend/
  server.js                   — entry point, helmet, CORS, rotas
  db.js                       — pool MySQL + suporte a múltiplas conexões
  middleware/auth.js          — JWT middleware
  routes/
    dashboards.js             — CRUD dashboards, validações, audit log
    query.js                  — execução de queries, buildParameterizedQuery
    users.js, auth.js         — usuários e autenticação
    connections.js            — conexões alternativas de banco
    attachments.js            — upload/download de documentos
    logs.js                   — logs de execução

frontend/src/
  services/api.ts             — todos os tipos TS e funções de API
  pages/
    DashboardView.tsx         — visualização e execução do dashboard
    DashboardCreate.tsx       — criação e edição de dashboards
    Dashboards.tsx            — listagem
```

---

## Comandos do dia a dia

### Reiniciar serviços (servidor de produção)
```bash
pm2 restart gvm-backend --update-env
pm2 restart gvm-frontend
pm2 logs gvm-backend --lines 30 --nostream
```

### Git — commitar e subir
```bash
git add -A
git commit -m "descrição da mudança"
git push origin master
```

---

## Atualizar no cliente via Git

Execute estes comandos no servidor do cliente (pasta `D:\GVM\GVMDASHBOARD`):

```powershell
# 1. Baixar as atualizações do repositório
git pull origin master

# 2. Instalar dependências novas (se houver)
cd backend
npm install
cd ../frontend
npm install
cd ..

# 3. Rebuild do frontend
cd frontend
npm run build
cd ..

# 4. Reiniciar os serviços
pm2 restart gvm-backend --update-env
pm2 restart gvm-frontend

# 5. Verificar se está rodando
pm2 status
pm2 logs gvm-backend --lines 20 --nostream
```

> Se o PM2 não estiver rodando, iniciar com:
> ```powershell
> pm2 start ecosystem.config.cjs
> pm2 save
> ```

---

## Padrão de parâmetros SQL

| Tipo | Como usar no SQL | Entrada do usuário |
|------|------------------|--------------------|
| date / string / integer / decimal | `WHERE col = @param` | campo de texto/data |
| **combo** | `@param` em qualquer posição do SQL | dropdown com opções |
| lista numérica | `WHERE col IN (@param)` | digitar `55,100,222` |

### Exemplo combo
```sql
SELECT * FROM produto @grupo
```
Opções configuradas pelo admin:
- "Por Código" → `GROUP BY codigo`
- "Por Descrição" → `GROUP BY descricao`
- "Nenhum" → *(remove o @grupo, retorna tudo sem agrupamento)*

---

## Convenções do projeto

- Não alterar o que já funciona ao adicionar features — só acrescentar
- UX simples e intuitiva; layouts responsivos
- Tabelas do banco com prefixo `gvmdash_`
- Commitar ao final de cada conjunto de mudanças com mensagem em português
