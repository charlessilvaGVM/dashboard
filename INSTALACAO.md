# GVM Dashboard — Instalação em PC Windows (Cliente)

---

## Pré-requisitos

### 1. Node.js
- Baixar em: https://nodejs.org (versão LTS — botão verde)
- Instalar com todas as opções padrão
- Verificar: abrir CMD e digitar:
  ```
  node -v
  npm -v
  ```
  Deve mostrar versões (ex: v20.x.x)

### 2. MySQL
- Se o cliente já tem MySQL rodando (ex: do ERP), usar ele mesmo
- Se não tiver, baixar **MySQL Community Server** em: https://dev.mysql.com/downloads/mysql/
- Durante a instalação, anotar:
  - Host (normalmente `127.0.0.1`)
  - Porta (normalmente `3306`)
  - Usuário e senha do root

### 3. PM2
- Abrir CMD como **Administrador** e rodar:
  ```
  npm install -g pm2
  npm install -g pm2-windows-startup
  ```

---

## Instalação do Projeto

### Passo 1 — Copiar os arquivos
Copiar a pasta `GVMDASHBOARD` para o PC do cliente.
Sugestão de destino:
```
C:\GVM\GVMDASHBOARD\
```

### Passo 2 — Instalar dependências do Backend
Abrir CMD dentro da pasta do projeto:
```
cd C:\GVM\GVMDASHBOARD\backend
npm install
```

### Passo 3 — Instalar dependências do Frontend
```
cd C:\GVM\GVMDASHBOARD\frontend
npm install
```

### Passo 4 — Configurar o .env
Abrir o arquivo `C:\GVM\GVMDASHBOARD\backend\.env` e ajustar:

```env
DB_HOST=127.0.0.1          # IP do MySQL
DB_PORT=3306               # Porta do MySQL
DB_NAME=gvmdashboard       # Nome do banco (será criado abaixo)
DB_USER=root               # Usuário do MySQL
DB_PASS=senha_aqui         # Senha do MySQL
JWT_SECRET=trocar_por_algo_longo_e_aleatorio
JWT_EXPIRES=8h
PORT=3002                  # Porta do backend
FRONT_PORT=5173            # Porta do frontend
PAGE_SIZE=50
DASH_REFRESH=0
```

> **Importante:** Trocar o `JWT_SECRET` por algo único. Gerar um com:
> ```
> node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
> ```

### Passo 5 — Criar o banco de dados no MySQL
Conectar no MySQL (via MySQL Workbench, HeidiSQL, ou CMD) e rodar:

```sql
CREATE DATABASE IF NOT EXISTS gvmdashboard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

> Substituir `gvmdashboard` pelo mesmo nome que colocou no `DB_NAME` do .env

### Passo 6 — Criar as tabelas
Rodar o script `database.sql` no banco criado:

**Via MySQL Workbench:**
- File → Open SQL Script → selecionar `C:\GVM\GVMDASHBOARD\database.sql`
- Selecionar o banco correto e executar

**Via CMD:**
```
mysql -u root -p gvmdashboard < C:\GVM\GVMDASHBOARD\database.sql
```

### Passo 7 — Criar o usuário admin
Gerar o hash da senha (rodar no CMD):
```
node -e "require('bcryptjs').hash('senha_do_admin', 10).then(h => console.log(h))"
```

Copiar o hash gerado e rodar no MySQL:
```sql
INSERT INTO gvmdash_users (usuario, nome, senha, nivel, ativo)
VALUES ('admin', 'Administrador', 'HASH_GERADO_AQUI', 'admin', 1);
```

---

## Iniciar o Sistema

### Passo 8 — Primeira inicialização (dentro da pasta raiz)
```
cd C:\GVM\GVMDASHBOARD
pm2 start ecosystem.config.cjs
```

Verificar se tudo subiu:
```
pm2 list
```

Deve mostrar `gvm-backend` e `gvm-frontend` com status `online`.

Verificar os logs se algo der errado:
```
pm2 logs gvm-backend --lines 20 --nostream
pm2 logs gvm-frontend --lines 20 --nostream
```

### Passo 9 — Testar no navegador
Abrir: **http://localhost:5173**

Entrar com o usuário admin criado no Passo 7.

---

## Iniciar automaticamente com o Windows

Para o sistema subir sozinho quando o PC ligar:

```
pm2 save
pm2-startup install
```

Reiniciar o PC e confirmar que sobe automaticamente.

---

## Acessar de outro computador na rede

Se outros PCs da rede precisarem acessar o sistema:

1. Descobrir o IP do PC servidor:
   ```
   ipconfig
   ```
   Anotar o **IPv4** (ex: `192.168.1.50`)

2. Liberar as portas no Firewall do Windows:
   - Abrir **Windows Defender Firewall** → Regras de Entrada → Nova Regra
   - Tipo: Porta → TCP → Portas: `3002, 5173`
   - Permitir a conexão → salvar

3. Acessar de outro PC com:
   ```
   http://192.168.1.50:5173
   ```

---

## Atualizar o sistema via Git

Quando houver uma nova versão disponível no GitHub, execute os comandos abaixo **dentro da pasta raiz do projeto** (ex: `D:\GVM\GVMDASHBOARD`):

### Passo 1 — Baixar as atualizações

```bash
git pull origin master
```

> Se aparecer erro de conflito no pull:
> ```bash
> git stash
> git pull origin master
> git stash pop
> ```

### Passo 2 — Atualizar dependências (somente se necessário)

Só é preciso quando o `package.json` foi alterado (novos pacotes adicionados):

```bash
cd backend
npm install
cd ../frontend
npm install
cd ..
```

### Passo 3 — Reiniciar os serviços

```bash
pm2 restart gvm-backend --update-env
pm2 restart gvm-frontend
```

> Use `--update-env` sempre que o arquivo `.env` tiver sido alterado.

### Passo 4 — Confirmar que está rodando

```bash
pm2 status
```

Ambos `gvm-backend` e `gvm-frontend` devem aparecer como `online`.

---

## Comandos úteis do dia a dia

```bash
# Ver status
pm2 list

# Reiniciar tudo
pm2 restart all

# Reiniciar só o backend (após mudar o .env, por exemplo)
pm2 restart gvm-backend --update-env

# Ver logs em tempo real
pm2 logs

# Ver últimas linhas do log do backend
pm2 logs gvm-backend --lines 50 --nostream

# Parar tudo
pm2 stop all

# Iniciar tudo
pm2 start all
```

---

## Solução de Problemas Comuns

| Problema | Causa | Solução |
|---|---|---|
| `EADDRINUSE` porta em uso | Outra instância rodando | `pm2 delete all` e `pm2 start ecosystem.config.cjs` |
| `ER_ACCESS_DENIED` | Usuário/senha MySQL errados | Revisar `.env` |
| `ER_BAD_DB_ERROR` | Banco não existe | Criar o banco (Passo 5) |
| Tela em branco no navegador | Frontend não subiu | `pm2 logs gvm-frontend` |
| "Token expired" no login | Normal — fazer login novamente | — |
| PM2 não reconhecido | PM2 não instalado | `npm install -g pm2` como admin |
