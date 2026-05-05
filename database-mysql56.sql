-- =============================================================================
-- GVM Dashboard — Script de banco de dados (compatível MySQL 5.6)
-- Banco: gvmdashboard (configurado em backend/.env → DB_NAME)
-- Diferença do database.sql padrão: JSON substituído por LONGTEXT
--   e removidos os ALTER TABLE IF NOT EXISTS (não suportados no MySQL 5.6)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABELA DE USUÁRIOS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gvmdash_users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  usuario    VARCHAR(100)                    NOT NULL UNIQUE,
  nome       VARCHAR(255)                    DEFAULT NULL,
  senha      VARCHAR(255)                    NOT NULL,
  nivel      ENUM('admin','usuario')         NOT NULL DEFAULT 'usuario',
  ativo      TINYINT(1)                      NOT NULL DEFAULT 1,
  created_at TIMESTAMP                       DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 2. TABELA DE DASHBOARDS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gvmdash_dashboards (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  nome             VARCHAR(255)  NOT NULL,
  descricao        TEXT,
  sql_query        TEXT          NOT NULL,
  chart_sql_query  TEXT          DEFAULT NULL,
  params           LONGTEXT      DEFAULT NULL,
  chart_type       VARCHAR(20)   DEFAULT 'bar',
  links            LONGTEXT      DEFAULT NULL,
  actions          LONGTEXT      DEFAULT NULL,
  chart_config     LONGTEXT      DEFAULT NULL,
  column_hints     LONGTEXT      DEFAULT NULL,
  refresh_interval INT           DEFAULT 0,
  connection_id    INT           DEFAULT NULL,
  extra_charts     LONGTEXT      DEFAULT NULL,
  created_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 3. TABELA DE PERMISSÕES (usuário x dashboard)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gvmdash_permissions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  dashboard_id INT NOT NULL,
  UNIQUE KEY uk_user_dash (user_id, dashboard_id)
);

-- -----------------------------------------------------------------------------
-- 4. USUÁRIO ADMIN INICIAL
-- Gere um hash real com:
--   node -e "require('bcryptjs').hash('suasenha', 10).then(h => console.log(h))"
-- e substitua abaixo antes de executar.
-- -----------------------------------------------------------------------------
-- INSERT INTO gvmdash_users (usuario, nome, senha, nivel, ativo) VALUES
-- ('admin', 'Administrador', '$2a$10$HASH_GERADO_AQUI', 'admin', 1);

-- -----------------------------------------------------------------------------
-- 5. CONSULTAS ÚTEIS
-- -----------------------------------------------------------------------------

-- Listar todos os usuários
-- SELECT id, usuario, nome, nivel, ativo, created_at FROM gvmdash_users ORDER BY id;

-- Listar todos os dashboards
-- SELECT id, nome, descricao, created_at, updated_at FROM gvmdash_dashboards ORDER BY id;

-- Ver permissões de um usuário (substitua o id)
-- SELECT u.usuario, d.nome AS dashboard
-- FROM gvmdash_permissions dp
-- JOIN gvmdash_users u ON u.id = dp.user_id
-- JOIN gvmdash_dashboards d ON d.id = dp.dashboard_id
-- WHERE dp.user_id = 1;

-- Resetar senha de um usuário (substitua o hash e o usuario)
-- UPDATE gvmdash_users SET senha = '$2a$10$HASH_GERADO_AQUI' WHERE usuario = 'admin';

-- Desativar um usuário
-- UPDATE gvmdash_users SET ativo = 0 WHERE usuario = 'fulano';

-- Remover todas as permissões de um usuário
-- DELETE FROM gvmdash_permissions WHERE user_id = 1;

-- Dar acesso a todos os dashboards para um usuário
-- INSERT IGNORE INTO gvmdash_permissions (user_id, dashboard_id)
-- SELECT 1, id FROM gvmdash_dashboards;
