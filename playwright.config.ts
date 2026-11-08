import { defineConfig } from '@playwright/test';

// BASE_URL=https://... npm run test:e2e   -> validates a deployed build
// (default) builds must exist in dist/; `vite preview` is started automatically.
const base = process.env.BASE_URL;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: base ?? 'http://localhost:4173',
    viewport: { width: 1366, height: 768 },
    // Software GL so the suite runs on headless CI machines without a GPU.
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: base
    ? undefined
    : { command: 'npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true },
});
