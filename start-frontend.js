const path = require('path');
const fs   = require('fs');
const { pathToFileURL } = require('url');

function readEnv(file) {
  try {
    return fs.readFileSync(file, 'utf8')
      .split('\n')
      .reduce((acc, line) => {
        const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*?)\s*$/);
        if (m) acc[m[1]] = m[2];
        return acc;
      }, {});
  } catch { return {}; }
}

const env  = readEnv(path.join(__dirname, 'backend', '.env'));
const port = parseInt(env.FRONT_PORT || '5173', 10);

const viteEntry = path.join(__dirname, 'frontend', 'node_modules', 'vite', 'dist', 'node', 'index.js');
const viteUrl   = pathToFileURL(viteEntry).href;

process.chdir(path.join(__dirname, 'frontend'));

(async () => {
  const { createServer } = await import(viteUrl);
  const server = await createServer({
    configFile: path.join(__dirname, 'frontend', 'vite.config.ts'),
    server: { port, host: true },
  });
  await server.listen();
  console.log(`[gvm-frontend] Vite running on http://localhost:${port}`);
})().catch(err => { console.error(err); process.exit(1); });
