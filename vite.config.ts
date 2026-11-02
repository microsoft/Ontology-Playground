import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { defineConfig, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'

const PROJECT_ROOT = import.meta.dirname
const LOCAL_ONTOLOGY_LINKS_CONFIG = '.ontology-links.local.json'
const execFileAsync = promisify(execFile)

interface LocalOntologyLinksPluginOptions {
  buildCatalogue?: (signal: AbortSignal) => Promise<{
    stdout: string
    stderr: string
  }>
  configPath?: string
  projectRoot?: string
  refreshDelayMs?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readLinkedOntologySourcePaths(configPath: string): string[] {
  if (!existsSync(configPath)) return []

  const config = JSON.parse(readFileSync(configPath, 'utf-8')) as unknown
  if (!isRecord(config) || !Array.isArray(config.links)) {
    throw new Error('local ontology links config must contain a links array')
  }
  return config.links.map((link, index) => {
    if (!isRecord(link) || typeof link.source !== 'string') {
      throw new Error(`local ontology link ${index} must contain a source path`)
    }
    return resolve(dirname(configPath), link.source)
  })
}

export function localOntologyLinksPlugin(
  options: LocalOntologyLinksPluginOptions = {},
): Plugin {
  const projectRoot = options.projectRoot ?? PROJECT_ROOT
  const configPath = options.configPath
    ?? resolve(projectRoot, LOCAL_ONTOLOGY_LINKS_CONFIG)
  const buildCatalogue = options.buildCatalogue ?? (async (signal: AbortSignal) => {
    const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    return execFileAsync(
      npmExecutable,
      ['run', 'catalogue:build'],
      {
        cwd: projectRoot,
        maxBuffer: 10 * 1024 * 1024,
        signal,
      },
    )
  })
  let sourcePaths = new Set<string>()
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  let refreshQueue = Promise.resolve()
  let buildAbortController: AbortController | undefined
  let closed = false

  const refresh = (server: ViteDevServer) => {
    refreshQueue = refreshQueue
      .then(async () => {
        if (closed) return
        sourcePaths = new Set(readLinkedOntologySourcePaths(configPath))
        server.watcher.add([configPath, ...sourcePaths])
        const controller = new AbortController()
        buildAbortController = controller
        let stdout: string
        let stderr: string
        try {
          ({ stdout, stderr } = await buildCatalogue(controller.signal))
        } finally {
          if (buildAbortController === controller) {
            buildAbortController = undefined
          }
        }
        if (closed) return
        if (stdout.trim()) server.config.logger.info(stdout.trim())
        if (stderr.trim()) server.config.logger.warn(stderr.trim())
        server.ws.send({ type: 'full-reload' })
        server.config.logger.info('[local-ontology-links] catalogue refreshed')
      })
      .catch((error: unknown) => {
        if (closed && (error as Error).name === 'AbortError') return
        server.config.logger.error(
          `[local-ontology-links] ${(error as Error).message}`,
        )
      })
  }

  const scheduleRefresh = (server: ViteDevServer) => {
    if (closed) return
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(
      () => refresh(server),
      options.refreshDelayMs ?? 75,
    )
  }

  return {
    name: 'local-ontology-links',
    configureServer(server) {
      sourcePaths = new Set(readLinkedOntologySourcePaths(configPath))
      server.watcher.add([configPath, ...sourcePaths])

      const handleFileEvent = (path: string) => {
        const absolutePath = resolve(path)
        if (absolutePath === configPath || sourcePaths.has(absolutePath)) {
          scheduleRefresh(server)
        }
      }
      server.watcher.on('add', handleFileEvent)
      server.watcher.on('change', handleFileEvent)
      server.watcher.on('unlink', handleFileEvent)

      const cleanup = () => {
        closed = true
        if (refreshTimer) {
          clearTimeout(refreshTimer)
          refreshTimer = undefined
        }
        buildAbortController?.abort()
        buildAbortController = undefined
        server.watcher.off('add', handleFileEvent)
        server.watcher.off('change', handleFileEvent)
        server.watcher.off('unlink', handleFileEvent)
      }
      server.httpServer?.once('close', cleanup)
    },
  }
}

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
  plugins: [react(), localOntologyLinksPlugin()],
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
