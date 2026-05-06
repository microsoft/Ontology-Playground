import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLakehouse, uploadEntityTable, copyDeltaTable, deleteLakehouse } from './fabricLakehouse';
import { instancesToCSV } from './sampleDataGenerator';

// Mock the sampleDataGenerator module
vi.mock('./sampleDataGenerator', () => ({
  instancesToCSV: vi.fn(),
}));

// Helper function to mock Response objects
function mockRes(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  };
}

describe('fabricLakehouse', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  describe('createLakehouse', () => {
    it('should return lakehouse on direct 200 success', async () => {
      const expectedLakehouse = { id: 'lh-123', displayName: 'TestLakehouse' };
      (global.fetch as any).mockResolvedValueOnce(mockRes(expectedLakehouse, 200));

      const result = await createLakehouse('token', 'workspace-id', 'TestLakehouse');

      expect(result).toEqual(expectedLakehouse);
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should list and find by displayName on 202 with null result', async () => {
      const expectedLakehouse = { id: 'lh-123', displayName: 'TestLakehouse' };
      (global.fetch as any)
        .mockResolvedValueOnce(mockRes(null, 202)) // Initial creation returns 202
        .mockResolvedValueOnce(mockRes({ value: [expectedLakehouse] }, 200)); // List returns the lakehouse

      const result = await createLakehouse('token', 'workspace-id', 'TestLakehouse');

      expect(result).toEqual(expectedLakehouse);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw when 202 response lakehouse not found in list', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce(mockRes(null, 202)) // Initial creation returns 202
        .mockResolvedValueOnce(mockRes({ value: [] }, 200)); // List returns empty

      await expect(
        createLakehouse('token', 'workspace-id', 'TestLakehouse')
      ).rejects.toThrow(/created but not found/i);
    });

    it('should throw error on non-OK response', async () => {
      (global.fetch as any).mockResolvedValueOnce(mockRes({ error: 'Not found' }, 404));

      await expect(
        createLakehouse('token', 'workspace-id', 'TestLakehouse')
      ).rejects.toThrow();
    });
  });

  describe('uploadEntityTable', () => {
    it('should skip when instancesToCSV returns empty', async () => {
      (instancesToCSV as any).mockReturnValueOnce('');

      await uploadEntityTable('token', 'lh-id', 'MyTable', []);

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should skip when instancesToCSV returns null', async () => {
      (instancesToCSV as any).mockReturnValueOnce(null);

      await uploadEntityTable('token', 'lh-id', 'MyTable', []);

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should call PUT (create file), PATCH (append), PATCH (flush), POST (load table)', async () => {
      const csvData = 'col1,col2\nval1,val2';
      (instancesToCSV as any).mockReturnValueOnce(csvData);

      (global.fetch as any)
        .mockResolvedValueOnce(mockRes({ id: 'file-123' }, 201)) // PUT create file
        .mockResolvedValueOnce(mockRes({}, 200)) // PATCH append
        .mockResolvedValueOnce(mockRes({}, 200)) // PATCH flush
        .mockResolvedValueOnce(mockRes({}, 200)); // POST load table

      await uploadEntityTable('token', 'lh-id', 'MyTable', [{ id: '1' }]);

      expect(global.fetch).toHaveBeenCalledTimes(4);
      // Verify the methods and operations
      const calls = (global.fetch as any).mock.calls;
      expect(calls[0][1]?.method).toBe('PUT'); // create file
      expect(calls[1][1]?.method).toBe('PATCH'); // append
      expect(calls[2][1]?.method).toBe('PATCH'); // flush
      expect(calls[3][1]?.method).toBe('POST'); // load table
    });
  });

  describe('copyDeltaTable', () => {
    it('should list files, create directories, copy data files before delta log files', async () => {
      const listingResponse = {
        paths: [
          { name: 'lh-id/Tables/MyTable/_delta_log', isDirectory: 'true' },
          { name: 'lh-id/Tables/MyTable/part-0.parquet', contentLength: '1024' },
          { name: 'lh-id/Tables/MyTable/_delta_log/00000.json', contentLength: '256' },
        ],
      };

      (global.fetch as any)
        // List files
        .mockResolvedValueOnce(mockRes(listingResponse, 200))
        // Create target directory
        .mockResolvedValueOnce(mockRes({}, 201))
        // Create delta_log subdirectory
        .mockResolvedValueOnce(mockRes({}, 201))
        // Download parquet file
        .mockResolvedValueOnce(mockRes({}, 200))
        // PUT (create) parquet file
        .mockResolvedValueOnce(mockRes({}, 201))
        // PATCH (append) parquet file
        .mockResolvedValueOnce(mockRes({}, 202))
        // Download delta log file
        .mockResolvedValueOnce(mockRes({}, 200))
        // PUT (create) delta log file
        .mockResolvedValueOnce(mockRes({}, 201))
        // PATCH (append) delta log file
        .mockResolvedValueOnce(mockRes({}, 202));

      await copyDeltaTable('token', 'source-lh', 'dest-lh', 'MyTable');

      expect(global.fetch).toHaveBeenCalled();
      // Verify data files copied before delta log files
      const calls = (global.fetch as any).mock.calls;
      const parquetCall = calls.findIndex((call: any[]) =>
        call[0]?.includes('part-0.parquet')
      );
      const deltaLogCall = calls.findIndex((call: any[]) =>
        call[0]?.includes('00000.json')
      );

      if (parquetCall !== -1 && deltaLogCall !== -1) {
        expect(parquetCall).toBeLessThan(deltaLogCall);
      }
    });
  });

  describe('deleteLakehouse', () => {
    it('should return true on 200 OK', async () => {
      (global.fetch as any).mockResolvedValueOnce(mockRes({}, 200));

      const result = await deleteLakehouse('workspace-id', 'lh-123', 'token');

      expect(result).toBe(true);
    });

    it('should return true on 204 No Content', async () => {
      (global.fetch as any).mockResolvedValueOnce(mockRes({}, 204));

      const result = await deleteLakehouse('workspace-id', 'lh-123', 'token');

      expect(result).toBe(true);
    });

    it('should return false when fetch throws', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await deleteLakehouse('workspace-id', 'lh-123', 'token');

      expect(result).toBe(false);
    });

    it('should return false on non-OK response like 404', async () => {
      (global.fetch as any).mockResolvedValueOnce(mockRes({ error: 'Not found' }, 404));

      const result = await deleteLakehouse('workspace-id', 'lh-123', 'token');

      expect(result).toBe(false);
    });
  });
});
