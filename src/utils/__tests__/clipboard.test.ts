import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from '../clipboard';

declare global {
  // eslint-disable-next-line no-var
  var clipboardData: string | undefined;
}

const setupFallbackClipboard = () => {
  Object.defineProperty(document, 'execCommand', {
    value: vi.fn(command => {
      if (command === 'copy') {
        globalThis.clipboardData = (document.activeElement as HTMLTextAreaElement | null)?.value ?? '';
        return true;
      }
      return false;
    }),
    configurable: true,
  });
};

describe('copyToClipboard', () => {
  beforeEach(() => {
    // @ts-expect-error reset test clipboard
    globalThis.clipboardData = undefined;
  });

  it('uses navigator.clipboard when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    await copyToClipboard('hola mundo');
    expect(writeText).toHaveBeenCalledWith('hola mundo');
  });

  it('falls back to execCommand when clipboard API is missing', async () => {
    // @ts-expect-error override clipboard for test
    navigator.clipboard = undefined;
    setupFallbackClipboard();

    await copyToClipboard('texto secundario');
    expect(globalThis.clipboardData).toBe('texto secundario');
  });
});
