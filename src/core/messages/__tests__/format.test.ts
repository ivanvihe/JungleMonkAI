import { describe, expect, it } from 'vitest';
import { splitMarkdownContent } from '../format';

describe('splitMarkdownContent', () => {
  it('splits markdown into text and code segments preserving language', () => {
    const input = "Hola\n\n```js\nconsole.log('hola');\n```\n\nAdiós";
    const segments = splitMarkdownContent(input);
    expect(segments).toHaveLength(3);
    expect(segments[0].kind).toBe('text');
    expect(segments[0].text.trim()).toBe('Hola');
    expect(segments[1]).toEqual({ kind: 'code', code: "console.log('hola');", language: 'js' });
    expect(segments[2].kind).toBe('text');
    expect(segments[2].text.trim()).toBe('Adiós');
  });

  it('returns single text segment when no fences are present', () => {
    const input = 'Mensaje sin código';
    expect(splitMarkdownContent(input)).toEqual([{ kind: 'text', text: input }]);
  });

  it('trims trailing whitespace inside code blocks', () => {
    const input = '```python\nprint("hola")\n\n\n```';
    const segments = splitMarkdownContent(input);
    expect(segments[0]).toEqual({ kind: 'code', code: 'print("hola")', language: 'python' });
  });
});
