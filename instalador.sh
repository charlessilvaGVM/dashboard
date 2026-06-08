#!/usr/bin/env bash
# ============================================================
# GVM Dashboard — Instalador / Atualizador (Linux)
# Execute como root ou com sudo:
#   sudo bash instalador.sh
# ============================================================

set -euo pipefail

REPO_URL="https://github.com/charlessilvaGVM/dashboard.git"
INSTALL_DIR="/opt/gvm/gvmdashboard"   # <-- altere este caminho se necessario

# ── Cores ────────────────────────────────────────────────────
CY='\033[0;36m'; GR='\033[0;32m'; YL='\033[0;33m'; RD='\033[0;31m'; NC='\033[0m'

step() { echo -e "\n${CY}>>> $1${NC}"; }
ok()   { echo -e "    ${GR}[OK]${NC}  $1"; }
warn() { echo -e "    ${YL}[!]${NC}   $1"; }
fail() { echo -e "\n    ${RD}[ERRO]${NC} $1\n"; exit 1; }

need_root() {
  [ "$(id -u)" -eq 0 ] || fail "Execute como root: sudo bash instalador.sh"
}

# ── Detectar gerenciador de pacotes ──────────────────────────
detect_pkg_manager() {
  if command -v apt-get &>/dev/null; then PKG=apt
  elif command -v dnf &>/dev/null;   then PKG=dnf
  elif command -v yum &>/dev/null;   then PKG=yum
  else fail "Gerenciador de pacotes nao suportado (apt/dnf/yum necessario)."
  fi
}

# ── Instalar Node.js via NodeSource LTS ──────────────────────
install_node() {
  warn "Node.js nao encontrado. Instalando via NodeSource LTS..."
  detect_pkg_manager
  if [ "$PKG" = "apt" ]; then
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
    apt-get install -y nodejs
  else
    curl -fsSL https://rpm.nodesource.com/setup_lts.x | bash -
    $PKG install -y nodejs
  fi
}

# ── Instalar Git ─────────────────────────────────────────────
install_git() {
  warn "Git nao encontrado. Instalando..."
  detect_pkg_manager
  if [ "$PKG" = "apt" ]; then apt-get install -y git
  else $PKG install -y git
  fi
}

read_required() {
  local prompt="$1" val=""
  while [ -z "$val" ]; do
    read -rp "  $prompt: " val
    [ -z "$val" ] && warn "Campo obrigatorio. Tente novamente."
  done
  echo "$val"
}

# ── Menu principal ───────────────────────────────────────────
echo ""
echo -e "${CY}============================================${NC}"
echo -e "${CY}   GVM Dashboard                            ${NC}"
echo -e "${CY}============================================${NC}"
echo ""
echo "  1. Instalacao nova"
echo "  2. Atualizar sistema"
echo ""

opcao=""
while [ "$opcao" != "1" ] && [ "$opcao" != "2" ]; do
  read -rp "  Escolha uma opcao [1/2]: " opcao
done

# ============================================================
# OPCAO 2 — ATUALIZACAO
# ============================================================
if [ "$opcao" = "2" ]; then

  step "Verificando instalacao existente..."
  [ -d "$INSTALL_DIR/.git" ] || fail "Projeto nao encontrado em $INSTALL_DIR. Execute a instalacao nova (opcao 1)."
  ok "Projeto encontrado"

  step "Baixando atualizacoes do repositorio..."
  cd "$INSTALL_DIR"

  if ! git diff --quiet || ! git diff --cached --quiet; then
    warn "Arquivos locais modificados. Guardando com git stash..."
    git stash
    STASHED=1
  else
    STASHED=0
  fi

  git pull origin master || fail "Falha no git pull. Verifique a conexao com a internet."
  ok "Codigo atualizado"

  if [ "$STASHED" = "1" ]; then
    step "Restaurando arquivos locais..."
    git stash pop
    ok "Arquivos locais restaurados"
  fi

  step "Atualizando dependencias do backend..."
  cd "$INSTALL_DIR/backend" && npm install
  ok "Backend OK"

  step "Atualizando dependencias do frontend..."
  cd "$INSTALL_DIR/frontend" && npm install
  ok "Frontend OK"

  cd "$INSTALL_DIR"

  step "Reiniciando servicos..."
  pm2 restart gvm-backend --update-env 2>/dev/null || true
  pm2 restart gvm-frontend             2>/dev/null || true

  pm2 list

  echo ""
  echo -e "${GR}============================================${NC}"
  echo -e "${GR}   Sistema atualizado com sucesso!          ${NC}"
  echo -e "${GR}============================================${NC}"
  echo ""
  exit 0
fi

# ============================================================
# OPCAO 1 — INSTALACAO NOVA
# ============================================================
need_root

# ── 1. Node.js ──────────────────────────────────────────────
step "Verificando Node.js..."
if command -v node &>/dev/null; then
  ok "Node.js ja instalado: $(node -v)"
else
  install_node
  command -v node &>/dev/null || fail "Node.js nao encontrado apos instalacao."
  ok "Node.js $(node -v)"
fi

# ── 2. Git ──────────────────────────────────────────────────
step "Verificando Git..."
if command -v git &>/dev/null; then
  ok "Git ja instalado: $(git --version)"
else
  install_git
  command -v git &>/dev/null || fail "Git nao encontrado apos instalacao."
  ok "Git $(git --version)"
fi

# ── 3. Repositorio ──────────────────────────────────────────
step "Baixando repositorio..."
mkdir -p "$(dirname "$INSTALL_DIR")"
git config --global --add safe.directory "$INSTALL_DIR" 2>/dev/null || true

if [ -d "$INSTALL_DIR/.git" ]; then
  warn "Repositorio ja existe. Atualizando..."
  cd "$INSTALL_DIR"
  git pull origin master
else
  mkdir -p "$INSTALL_DIR"
  cd "$INSTALL_DIR"
  git init
  git remote add origin "$REPO_URL"
  git fetch origin master
  git reset --hard origin/master
  ok "Repositorio baixado em $INSTALL_DIR"
fi

# ── 4. Dados do banco de dados ──────────────────────────────
step "Configuracao do banco de dados"
echo ""
echo -e "  Campos com [padrao] aceitam Enter. Os demais sao obrigatorios."
echo ""

read -rp "  Host do MySQL       [127.0.0.1]: " DB_HOST
DB_HOST="${DB_HOST:-127.0.0.1}"

read -rp "  Porta do MySQL      [3306]: " DB_PORT
DB_PORT="${DB_PORT:-3306}"

DB_NAME=$(read_required "Nome do schema/banco")
DB_USER=$(read_required "Usuario do MySQL")
DB_PASS=$(read_required "Senha do MySQL")

read -rp "  Porta do backend    [5001]: " PORT_BACK
PORT_BACK="${PORT_BACK:-5001}"

read -rp "  Porta do frontend   [5000]: " PORT_FRONT
PORT_FRONT="${PORT_FRONT:-5000}"

# ── 5. Criar .env ───────────────────────────────────────────
step "Gerando JWT_SECRET e criando .env..."

JWT_SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))")

cat > "$INSTALL_DIR/backend/.env" <<EOF
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASS=$DB_PASS
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES=8h
PORT=$PORT_BACK
FRONT_PORT=$PORT_FRONT
PAGE_SIZE=50
DASH_REFRESH=300
LOG_SQL=false
LOG_EXECUTIONS=false
ALLOWED_ORIGINS=http://localhost:$PORT_FRONT,http://localhost:$PORT_BACK,http://127.0.0.1:$PORT_FRONT,http://127.0.0.1:$PORT_BACK
EOF
ok ".env criado"

# ── 6. Instalar dependencias ────────────────────────────────
step "Instalando dependencias do backend..."
cd "$INSTALL_DIR/backend" && npm install
ok "Backend OK"

step "Instalando dependencias do frontend..."
cd "$INSTALL_DIR/frontend" && npm install
ok "Frontend OK"

cd "$INSTALL_DIR"

# ── 7. Criar tabelas no MySQL ────────────────────────────────
step "Conectando ao MySQL e criando tabelas..."

cat > "$INSTALL_DIR/backend/_setup_db.js" <<'JSEOF'
const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host              : process.env.SETUP_DB_HOST,
    port              : Number(process.env.SETUP_DB_PORT),
    user              : process.env.SETUP_DB_USER,
    password          : process.env.SETUP_DB_PASS,
    database          : process.env.SETUP_DB_NAME,
    multipleStatements: false
  });

  const stmts = [
    `CREATE TABLE IF NOT EXISTS gvmdash_users (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      usuario    VARCHAR(100) NOT NULL UNIQUE,
      nome       VARCHAR(255),
      senha      VARCHAR(255) NOT NULL,
      nivel      ENUM('admin','usuario') NOT NULL DEFAULT 'usuario',
      ativo      TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS gvmdash_dashboards (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      nome             VARCHAR(255) NOT NULL,
      descricao        TEXT,
      sql_query        TEXT NOT NULL,
      chart_sql_query  TEXT DEFAULT NULL,
      params           LONGTEXT DEFAULT NULL,
      chart_type       VARCHAR(20) DEFAULT 'bar',
      chart_config     LONGTEXT DEFAULT NULL,
      links            LONGTEXT DEFAULT NULL,
      actions          LONGTEXT DEFAULT NULL,
      expand_config    LONGTEXT DEFAULT NULL,
      column_hints     LONGTEXT DEFAULT NULL,
      refresh_interval INT DEFAULT 0,
      connection_id    INT DEFAULT NULL,
      extra_charts     LONGTEXT DEFAULT NULL,
      created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS gvmdash_connections (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      nome       VARCHAR(255) NOT NULL,
      host       VARCHAR(255) NOT NULL,
      port       INT NOT NULL DEFAULT 3306,
      \`database\` VARCHAR(255) NOT NULL,
      \`user\`     VARCHAR(255) NOT NULL,
      password   VARCHAR(255) NOT NULL,
      ativo      TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS gvmdash_permissions (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      user_id      INT NOT NULL,
      dashboard_id INT NOT NULL,
      UNIQUE KEY uq_perm (user_id, dashboard_id)
    )`,
    `CREATE TABLE IF NOT EXISTS gvmdash_audit_logs (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      user_id     INT,
      usuario     VARCHAR(100),
      action      VARCHAR(50),
      resource    VARCHAR(50),
      resource_id INT,
      detail      TEXT,
      ip          VARCHAR(45),
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_created (created_at),
      INDEX idx_audit_user (user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS gvmdash_exec_logs (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      dashboard_id      INT,
      dashboard_nome    VARCHAR(255),
      user_id           INT,
      usuario           VARCHAR(100),
      execution_time_ms INT,
      row_count         INT,
      executed_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_exec_dash (dashboard_id),
      INDEX idx_exec_user (user_id),
      INDEX idx_exec_date (executed_at)
    )`,
    `CREATE TABLE IF NOT EXISTS gvmdash_attachments (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      dashboard_id  INT NOT NULL,
      filename      VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      size          INT NOT NULL DEFAULT 0,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_att_dash (dashboard_id)
    )`
  ];

  for (const stmt of stmts) {
    try {
      await conn.query(stmt);
    } catch (e) {
      const msg = e.message.toLowerCase();
      if (!msg.includes('duplicate') && !msg.includes('already exists')) {
        console.warn('Aviso: ' + e.message);
      }
    }
  }

  await conn.end();
  console.log('Tabelas criadas com sucesso.');
}

main().catch(e => { console.error('ERRO: ' + e.message); process.exit(1); });
JSEOF

export SETUP_DB_HOST="$DB_HOST"
export SETUP_DB_PORT="$DB_PORT"
export SETUP_DB_NAME="$DB_NAME"
export SETUP_DB_USER="$DB_USER"
export SETUP_DB_PASS="$DB_PASS"

node "$INSTALL_DIR/backend/_setup_db.js"
EXIT=$?
rm -f "$INSTALL_DIR/backend/_setup_db.js"
[ $EXIT -eq 0 ] || fail "Falha ao criar tabelas. Verifique host, porta, usuario, senha e se o schema '$DB_NAME' existe no MySQL."
ok "Tabelas criadas"

# ── 8. Criar usuario admin ───────────────────────────────────
step "Criar usuario administrador"
echo ""

read -rp "  Usuario admin   [admin]: " ADMIN_USER
ADMIN_USER="${ADMIN_USER:-admin}"

read -rp "  Nome completo   [Administrador]: " ADMIN_NOME
ADMIN_NOME="${ADMIN_NOME:-Administrador}"

ADMIN_PASS=""
while [ ${#ADMIN_PASS} -lt 8 ]; do
  read -rsp "  Senha do admin (minimo 8 caracteres): " ADMIN_PASS
  echo ""
  [ ${#ADMIN_PASS} -lt 8 ] && warn "Senha muito curta. Minimo 8 caracteres."
done

cat > "$INSTALL_DIR/backend/_setup_admin.js" <<'JSEOF'
const bcrypt = require('bcryptjs');
const mysql  = require('mysql2/promise');

async function main() {
  const hash = await bcrypt.hash(process.env.SETUP_ADMIN_PASS, 10);
  const conn = await mysql.createConnection({
    host    : process.env.SETUP_DB_HOST,
    port    : Number(process.env.SETUP_DB_PORT),
    user    : process.env.SETUP_DB_USER,
    password: process.env.SETUP_DB_PASS,
    database: process.env.SETUP_DB_NAME
  });
  await conn.query(
    'INSERT INTO gvmdash_users (usuario, nome, senha, nivel, ativo) VALUES (?, ?, ?, ?, 1) ON DUPLICATE KEY UPDATE senha=VALUES(senha), nome=VALUES(nome), ativo=1',
    [process.env.SETUP_ADMIN_USER, process.env.SETUP_ADMIN_NOME, hash, 'admin']
  );
  await conn.end();
  console.log('Admin criado: ' + process.env.SETUP_ADMIN_USER);
}
main().catch(e => { console.error('ERRO: ' + e.message); process.exit(1); });
JSEOF

export SETUP_ADMIN_USER="$ADMIN_USER"
export SETUP_ADMIN_NOME="$ADMIN_NOME"
export SETUP_ADMIN_PASS="$ADMIN_PASS"

node "$INSTALL_DIR/backend/_setup_admin.js"
EXIT=$?
rm -f "$INSTALL_DIR/backend/_setup_admin.js"
[ $EXIT -eq 0 ] || fail "Falha ao criar usuario admin."
ok "Admin criado: $ADMIN_USER"

# ── Limpar variaveis de ambiente temporarias ─────────────────
unset SETUP_DB_HOST SETUP_DB_PORT SETUP_DB_NAME SETUP_DB_USER SETUP_DB_PASS
unset SETUP_ADMIN_USER SETUP_ADMIN_NOME SETUP_ADMIN_PASS

# ── 9. PM2 ──────────────────────────────────────────────────
step "Verificando PM2..."
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
fi
ok "PM2 $(pm2 --version)"

# ── 10. Iniciar servicos ─────────────────────────────────────
step "Iniciando servicos..."
cd "$INSTALL_DIR"

pm2 delete gvm-backend  2>/dev/null || true
pm2 delete gvm-frontend 2>/dev/null || true

pm2 start ecosystem.config.cjs
pm2 save

# ── 11. Configurar inicializacao automatica (systemd) ────────
step "Configurando inicializacao automatica com systemd..."
PM2_STARTUP=$(pm2 startup 2>&1 | grep "sudo" | tail -1 || true)
if [ -n "$PM2_STARTUP" ]; then
  eval "$PM2_STARTUP" && ok "Startup configurado via systemd"
else
  warn "Nao foi possivel configurar startup automatico. Execute manualmente: pm2 startup"
fi
pm2 save

# ── Remover arquivos desnecessarios ──────────────────────────
step "Removendo arquivos desnecessarios..."
find "$INSTALL_DIR" -maxdepth 1 -name "*.sql" -delete 2>/dev/null || true
ok "Feito"

# ── Conclusao ────────────────────────────────────────────────
echo ""
echo -e "${GR}============================================${NC}"
echo -e "${GR}   Instalacao concluida com sucesso!        ${NC}"
echo -e "${GR}============================================${NC}"
echo ""
echo -e "  Acesso local :  ${CY}http://localhost:$PORT_FRONT${NC}"
echo -e "  Na rede      :  ${CY}http://$(hostname -I | awk '{print $1}'):$PORT_FRONT${NC}"
echo -e "  Usuario      :  ${CY}$ADMIN_USER${NC}"
echo ""
echo "  Comandos uteis:"
echo "    pm2 list                               ver status"
echo "    pm2 logs                               ver logs"
echo "    pm2 restart gvm-backend --update-env   apos mudar .env"
echo ""
