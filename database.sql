-- =============================================================================
-- GVM Dashboard — Script de banco de dados
-- Banco: gvmadminjuma (configurado em backend/.env → DB_NAME)
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

-- Adicionar coluna nivel caso a tabela já existia antes desta versão
ALTER TABLE gvmdash_users ADD COLUMN IF NOT EXISTS nivel ENUM('admin','usuario') NOT NULL DEFAULT 'usuario';
ALTER TABLE gvmdash_users ADD COLUMN IF NOT EXISTS nome  VARCHAR(255) DEFAULT NULL;

-- -----------------------------------------------------------------------------
-- 2. TABELA DE DASHBOARDS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dashboards (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  nome       VARCHAR(255) NOT NULL,
  descricao  TEXT,
  sql_query  TEXT         NOT NULL,
  params     JSON         DEFAULT NULL,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Adicionar coluna params caso a tabela já existia antes desta versão
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS params JSON DEFAULT NULL;
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS column_hints JSON DEFAULT NULL;

-- -----------------------------------------------------------------------------
-- 3. TABELA DE PERMISSÕES (usuário x dashboard)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dashboard_permissions (
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
-- SELECT id, nome, descricao, created_at, updated_at FROM dashboards ORDER BY id;

-- Ver permissões de um usuário (substitua o id)
-- SELECT u.usuario, d.nome AS dashboard
-- FROM dashboard_permissions dp
-- JOIN gvmdash_users u ON u.id = dp.user_id
-- JOIN dashboards    d ON d.id = dp.dashboard_id
-- WHERE dp.user_id = 1;

-- Resetar senha de um usuário (substitua o hash e o usuario)
-- UPDATE gvmdash_users SET senha = '$2a$10$HASH_GERADO_AQUI' WHERE usuario = 'admin';

-- Desativar um usuário
-- UPDATE gvmdash_users SET ativo = 0 WHERE usuario = 'fulano';

-- Remover todas as permissões de um usuário
-- DELETE FROM dashboard_permissions WHERE user_id = 1;

-- Dar acesso a todos os dashboards para um usuário
-- INSERT IGNORE INTO dashboard_permissions (user_id, dashboard_id)
-- SELECT 1, id FROM dashboards;
