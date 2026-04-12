import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function resolveBasePath(): string {
  if (process.env.VITE_BASE_PATH) return process.env.VITE_BASE_PATH;

  // In GitHub Actions, derive Pages base from owner/repo when not explicitly provided.
  if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REPOSITORY) {
    const [, repoName] = process.env.GITHUB_REPOSITORY.split('/');
    if (repoName) return `/${repoName}/`;
  }

  return '/';
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: resolveBasePath(),
  build: {
    outDir: 'build',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('cytoscape')) return 'graph-vendor';
          if (id.includes('react') || id.includes('zustand') || id.includes('framer-motion')) return 'ui-vendor';
          return 'vendor';
        },
      },
    },
  },
  server: {
    proxy: {
      // GitHub OAuth device-flow endpoints don't support CORS — proxy in dev
      '/__github/login/device/code': {
        target: 'https://github.com',
        changeOrigin: true,
        rewrite: (path: string) => path.replace('/__github', ''),
      },
      '/__github/login/oauth/access_token': {
        target: 'https://github.com',
        changeOrigin: true,
        rewrite: (path: string) => path.replace('/__github', ''),
      },
      ...(process.env.VITE_ENABLE_AI_BUILDER === 'true'
        ? {
            '/api': {
              target: 'http://localhost:7071',
              changeOrigin: true,
            },
          }
        : {}),
    },
  },
})
