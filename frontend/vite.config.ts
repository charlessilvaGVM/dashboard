import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import fs from 'fs';

function readEnv(file: string): Record<string, string> {
  try {
    return fs.readFileSync(file, 'utf8')
      .split('\n')
      .reduce((acc, line) => {
        const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*?)\s*$/);
        if (m) acc[m[1]] = m[2];
        return acc;
      }, {} as Record<string, string>);
  } catch { return {}; }
}

const backendEnv = readEnv(path.resolve(__dirname, '../backend/.env'));
const backendPort = backendEnv.PORT || '3001';
const frontPort   = parseInt(backendEnv.FRONT_PORT || '5173', 10);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: frontPort,
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
