import { readFile, writeFile } from 'node:fs/promises';

// Small dependency-free formatter for this stylesheet (strings/comments stay intact).
const source = await readFile('src/styles.css', 'utf8');
const lines = [];
let depth = 0;
let parentheses = 0;
let quote = null;
let comment = false;
let buffer = '';
const flush = (suffix) => {
  const value = buffer.trim();
  if (value || suffix) lines.push('  '.repeat(depth) + value + suffix);
  buffer = '';
};
for (let index = 0; index < source.length; index++) {
  const character = source[index];
  const next = source[index + 1];
  if (comment) {
    buffer += character;
    if (character === '*' && next === '/') {
      buffer += next;
      index++;
      comment = false;
      flush('');
    }
    continue;
  }
  if (quote) {
    buffer += character;
    if (character === '\\') {
      buffer += next;
      index++;
    } else if (character === quote) quote = null;
    continue;
  }
  if (character === '/' && next === '*') {
    flush('');
    buffer = '/*';
    index++;
    comment = true;
    continue;
  }
  if (character === "'" || character === '"') {
    quote = character;
    buffer += character;
    continue;
  }
  if (character === '(') parentheses++;
  if (character === ')') parentheses--;
  if (!parentheses && character === '{') {
    flush(' {');
    depth++;
  } else if (!parentheses && character === '}') {
    flush('');
    depth--;
    lines.push('  '.repeat(depth) + '}');
  } else if (!parentheses && character === ';') {
    buffer = buffer.trim().replace(/^([-\w]+):\s*/, '$1: ');
    flush(';');
  } else buffer += character;
}
flush('');
await writeFile('src/styles.css', lines.join('\n') + '\n');
