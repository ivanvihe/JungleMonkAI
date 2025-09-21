import { describe, expect, it, vi } from 'vitest';
import handler from '../console-message-handler.cjs';

const { logConsoleMessage } = handler as { logConsoleMessage: (...args: any[]) => boolean };

describe('logConsoleMessage', () => {
  it('ignores events without params', () => {
    const logger = { log: vi.fn() };

    const result = logConsoleMessage(logger as any, undefined as any);

    expect(result).toBe(false);
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('ignores events without a valid message payload', () => {
    const logger = { log: vi.fn() };

    const result = logConsoleMessage(logger as any, { level: 1, message: undefined } as any);

    expect(result).toBe(false);
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('logs events with valid payload applying defensive defaults', () => {
    const logger = { log: vi.fn() };

    const result = logConsoleMessage(logger as any, {
      level: 2,
      message: 'Test message',
      sourceId: '',
      lineNumber: undefined
    });

    expect(result).toBe(true);
    expect(logger.log).toHaveBeenCalledWith('Console [2] <anonymous>:0 -', 'Test message');
  });
});
