import { EventEmitter } from 'node:events';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Plugin, ViteDevServer } from 'vite';
import { localOntologyLinksPlugin } from '../vite.config';

function configureServer(plugin: Plugin, server: ViteDevServer): unknown {
  if (typeof plugin.configureServer !== 'function') {
    throw new Error('Expected a configureServer hook');
  }
  return plugin.configureServer(server);
}

function createServer() {
  const watcher = new EventEmitter() as ViteDevServer['watcher'];
  watcher.add = vi.fn().mockReturnValue(watcher);
  const httpServer = new EventEmitter();
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const send = vi.fn();
  const server = {
    watcher,
    httpServer,
    config: { logger },
    ws: { send },
  } as unknown as ViteDevServer;
  return { httpServer, logger, send, server, watcher };
}

function createConfigFixture() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'vite-ontology-links-'));
  const configPath = join(projectRoot, '.ontology-links.local.json');
  const sourcePath = join(projectRoot, 'source.rdf');
  writeFileSync(configPath, JSON.stringify({
    links: [{ source: sourcePath }],
  }));
  return { configPath, projectRoot, sourcePath };
}

describe('localOntologyLinksPlugin', () => {
  it('keeps file listeners active until the dev server closes', () => {
    const { httpServer, server, watcher } = createServer();

    const result = configureServer(localOntologyLinksPlugin(), server);

    expect(result).toBeUndefined();
    expect(watcher.listenerCount('add')).toBe(1);
    expect(watcher.listenerCount('change')).toBe(1);
    expect(watcher.listenerCount('unlink')).toBe(1);

    httpServer.emit('close');

    expect(watcher.listenerCount('add')).toBe(0);
    expect(watcher.listenerCount('change')).toBe(0);
    expect(watcher.listenerCount('unlink')).toBe(0);
  });

  it.each(['add', 'change'] as const)(
    'rebuilds and reloads after a linked source %s event',
    async (event) => {
      const fixture = createConfigFixture();
      const buildCatalogue = vi.fn().mockResolvedValue({
        stdout: 'catalogue rebuilt',
        stderr: '',
      });
      const { send, server, watcher } = createServer();
      configureServer(localOntologyLinksPlugin({
        ...fixture,
        buildCatalogue,
        refreshDelayMs: 0,
      }), server);

      watcher.emit(event, fixture.sourcePath);

      await vi.waitFor(() => expect(buildCatalogue).toHaveBeenCalledOnce());
      await vi.waitFor(() => expect(send).toHaveBeenCalledWith({
        type: 'full-reload',
      }));
    },
  );

  it('fails closed on source removal and refreshes when the source returns', async () => {
    const fixture = createConfigFixture();
    let sourceMissing = true;
    const buildCatalogue = vi.fn(async () => {
      if (sourceMissing) throw new Error('linked source is missing');
      return { stdout: 'catalogue rebuilt', stderr: '' };
    });
    const { logger, send, server, watcher } = createServer();
    configureServer(localOntologyLinksPlugin({
      ...fixture,
      buildCatalogue,
      refreshDelayMs: 0,
    }), server);

    watcher.emit('unlink', fixture.sourcePath);

    await vi.waitFor(() => expect(buildCatalogue).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('linked source is missing'),
    ));
    expect(send).not.toHaveBeenCalled();

    sourceMissing = false;
    watcher.emit('add', fixture.sourcePath);

    await vi.waitFor(() => expect(buildCatalogue).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith({
      type: 'full-reload',
    }));
  });

  it('aborts an in-flight rebuild and suppresses reload after close', async () => {
    const fixture = createConfigFixture();
    let observedSignal: AbortSignal | undefined;
    const buildCatalogue = vi.fn((signal: AbortSignal) => {
      observedSignal = signal;
      return new Promise<{ stdout: string; stderr: string }>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    });
    const { httpServer, logger, send, server, watcher } = createServer();
    configureServer(localOntologyLinksPlugin({
      ...fixture,
      buildCatalogue,
      refreshDelayMs: 0,
    }), server);

    watcher.emit('change', fixture.sourcePath);
    await vi.waitFor(() => expect(buildCatalogue).toHaveBeenCalledOnce());

    httpServer.emit('close');

    expect(observedSignal?.aborted).toBe(true);
    await vi.waitFor(() => expect(logger.error).not.toHaveBeenCalled());
    expect(send).not.toHaveBeenCalled();
  });
});
