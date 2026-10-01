// Local-only UI harness: never loads production Firebase configuration.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
const fixture = fileURLToPath(new URL('./firebase.ts', import.meta.url));
export function createDemoServer() { return createServer({
  configFile: false, envDir: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [{ name: 'demo-firebase-only', enforce: 'pre', resolveId(id) {
    if (id === '../lib/firebase' || id === './firebase') return fixture;
  } }, react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 3175, strictPort: true },
}); }
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await createDemoServer();
  await server.listen();
  console.log('Local demo UI: http://127.0.0.1:3175/tests/ui/index.html');
}
