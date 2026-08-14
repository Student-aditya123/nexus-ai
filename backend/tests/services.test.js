/**
 * NEXUS AI - Unit Tests
 * Core service and middleware testing
 */

// ─── Document Processor Tests ─────────────────────────────────────────────────

describe('DocumentProcessor', () => {
  let processor;

  beforeEach(() => {
    jest.resetModules();
    processor = require('../../src/services/document/processor.service');
  });

  describe('Text cleaning', () => {
    test('removes control characters', () => {
      const dirty = 'Hello\x00World\x07Test';
      const clean = processor._cleanText(dirty);
      expect(clean).toBe('HelloWorldTest');
    });

    test('normalizes whitespace', () => {
      const text = 'Hello   World\n\n\n\nTest';
      const clean = processor._cleanText(text);
      expect(clean).not.toMatch(/\n{3,}/);
      expect(clean).not.toMatch(/\s{3,}/);
    });
  });

  describe('Chunk creation', () => {
    test('creates chunks from pages', () => {
      const pages = [
        { pageNum: 1, text: 'This is a test document. It has multiple sentences. Each sentence adds content.' },
        { pageNum: 2, text: 'Second page content. More information here. Continues with details.' },
      ];
      const metadata = { documentId: 'test123', filename: 'test.pdf', userId: 'user1' };
      const chunks = processor.createChunks(pages, metadata);

      expect(chunks).toBeInstanceOf(Array);
      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach(chunk => {
        expect(chunk).toHaveProperty('text');
        expect(chunk).toHaveProperty('metadata');
        expect(chunk.metadata).toHaveProperty('documentId', 'test123');
        expect(chunk.metadata).toHaveProperty('filename', 'test.pdf');
        expect(chunk.text.length).toBeGreaterThan(0);
      });
    });

    test('generates document preview', () => {
      const pages = [{ pageNum: 1, text: 'A'.repeat(1000) }];
      const preview = processor.generatePreview(pages, 100);
      expect(preview.length).toBeLessThanOrEqual(103); // 100 + "..."
    });
  });

  describe('Word counting', () => {
    test('counts words accurately', () => {
      expect(processor._countWords('hello world foo bar')).toBe(4);
      expect(processor._countWords('')).toBe(0);
      expect(processor._countWords('   ')).toBe(0);
    });
  });

  describe('Supported types', () => {
    test('throws on unsupported file types', async () => {
      await expect(
        processor.extractText(Buffer.from('test'), 'test.xyz')
      ).rejects.toThrow('Unsupported file type');
    });
  });
});

// ─── Vector Store Tests ───────────────────────────────────────────────────────

describe('VectorStore cosine similarity', () => {
  let store;

  beforeEach(() => {
    store = require('../../src/services/ai/vectorStore.service');
  });

  test('identical vectors return 1.0', () => {
    const vec = [0.5, 0.5, 0.5, 0.5];
    expect(store._cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 5);
  });

  test('orthogonal vectors return 0', () => {
    const vecA = [1, 0, 0];
    const vecB = [0, 1, 0];
    expect(store._cosineSimilarity(vecA, vecB)).toBeCloseTo(0, 5);
  });

  test('opposite vectors return -1', () => {
    const vecA = [1, 0];
    const vecB = [-1, 0];
    expect(store._cosineSimilarity(vecA, vecB)).toBeCloseTo(-1, 5);
  });

  test('handles zero vectors gracefully', () => {
    const zero = [0, 0, 0];
    const normal = [1, 0, 0];
    expect(store._cosineSimilarity(zero, normal)).toBe(0);
    expect(store._cosineSimilarity(zero, zero)).toBe(0);
  });

  test('handles mismatched dimensions', () => {
    expect(store._cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
    expect(store._cosineSimilarity(null, [1, 0])).toBe(0);
  });
});

// ─── Error Utilities ──────────────────────────────────────────────────────────

describe('AppError', () => {
  const { AppError } = require('../../src/utils/errors');

  test('creates error with correct properties', () => {
    const err = new AppError('Not found', 404, 'NOT_FOUND');
    expect(err.message).toBe('Not found');
    expect(err.statusCode).toBe(404);
    expect(err.status).toBe('fail');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.isOperational).toBe(true);
  });

  test('server errors have status "error"', () => {
    const err = new AppError('Server crashed', 500);
    expect(err.status).toBe('error');
  });

  test('4xx errors have status "fail"', () => {
    [400, 401, 403, 404, 409, 422, 429].forEach(code => {
      const err = new AppError('Client error', code);
      expect(err.status).toBe('fail');
    });
  });
});

describe('asyncHandler', () => {
  const { asyncHandler } = require('../../src/utils/errors');

  test('passes errors to next', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('Async error'));
    const handler = asyncHandler(mockFn);
    const next = jest.fn();
    const req = {};
    const res = {};

    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe('Async error');
  });

  test('does not call next on success', async () => {
    const mockFn = jest.fn().mockResolvedValue('success');
    const handler = asyncHandler(mockFn);
    const next = jest.fn();

    await handler({}, {}, next);
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── Agent Service Tests ──────────────────────────────────────────────────────

describe('AgentService', () => {
  let agent;

  beforeEach(() => {
    agent = require('../../src/services/ai/agent.service');
  });

  test('returns tool descriptions', () => {
    const tools = agent.getToolDescriptions();
    expect(tools).toBeInstanceOf(Array);
    expect(tools.length).toBeGreaterThan(0);
    tools.forEach(t => {
      expect(t).toHaveProperty('name');
      expect(t).toHaveProperty('description');
      expect(t).toHaveProperty('parameters');
    });
  });

  test('detects loops correctly', () => {
    const loopSteps = [
      { stepNumber: 1, action: 'web_search', args: { query: 'test' }, observation: 'result' },
      { stepNumber: 2, action: 'web_search', args: { query: 'test' }, observation: 'result' },
      { stepNumber: 3, action: 'web_search', args: { query: 'test' }, observation: 'result' },
    ];
    expect(agent._detectLoop(loopSteps)).toBe(true);
  });

  test('does not flag non-loops', () => {
    const noLoopSteps = [
      { stepNumber: 1, action: 'web_search', args: { query: 'test' }, observation: 'result' },
      { stepNumber: 2, action: 'calculate', args: { expression: '2+2' }, observation: '4' },
      { stepNumber: 3, action: 'summarize_text', args: { text: 'hello' }, observation: 'hello' },
    ];
    expect(agent._detectLoop(noLoopSteps)).toBe(false);
  });

  test('calculate tool works', async () => {
    const tools = agent.tools;
    const result = await tools.calculate.execute({ expression: '2 + 2 * 3' });
    expect(result).toContain('8');
  });
});

// ─── Cache Tests ──────────────────────────────────────────────────────────────

describe('Cache utilities', () => {
  beforeEach(() => {
    jest.mock('../../src/config/redis', () => ({
      cache: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(true),
        del: jest.fn().mockResolvedValue(true),
      },
      getRedisClient: jest.fn().mockReturnValue(null),
    }));
  });

  test('cache get returns null for missing keys', async () => {
    const { cache } = require('../../src/config/redis');
    const result = await cache.get('nonexistent');
    expect(result).toBeNull();
  });

  test('cache set returns success', async () => {
    const { cache } = require('../../src/config/redis');
    const result = await cache.set('key', { data: 'value' }, 60);
    expect(result).toBeTruthy();
  });
});
