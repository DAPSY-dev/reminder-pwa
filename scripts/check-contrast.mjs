import { readFile } from 'node:fs/promises';
const css = await readFile('src/styles.css', 'utf8');
const colors = Object.fromEntries(
  [...css.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)].map((match) => [match[1], match[2]]),
);
function luminance(hex) {
  const channels = hex
    .slice(1)
    .match(/../g)
    .map((channel) => {
      const value = parseInt(channel, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function ratio(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
const checks = [];
for (const background of ['canvas', 'surface', 'surface-soft']) {
  for (const foreground of ['text', 'muted', 'accent', 'error', 'warning'])
    checks.push([`${foreground} on ${background}`, colors[foreground], colors[background], 4.5]);
  checks.push([
    `control boundary on ${background}`,
    colors['control-border'],
    colors[background],
    3,
  ]);
}
for (const background of ['#49243b', '#241b2b', '#19151f']) {
  for (const foreground of ['text', 'muted', 'accent'])
    checks.push([`${foreground} on story ${background}`, colors[foreground], background, 4.5]);
}
for (const background of ['accent', 'accent-hover'])
  checks.push([`primary on ${background}`, colors['on-accent'], colors[background], 4.5]);
checks.push(
  ['danger', colors.text, '#9f2454', 4.5],
  ['danger hover', colors.text, '#b62f65', 4.5],
  ['error notice', colors.error, '#34202a', 4.5],
  ['warning notice', colors.warning, '#302a25', 4.5],
);
const results = checks.map(([label, foreground, background, minimum]) => ({
  label,
  ratio: ratio(foreground, background),
  minimum,
}));
const failed = results.filter((result) => result.ratio < result.minimum);
for (const result of failed)
  console.error(`${result.label}: ${result.ratio.toFixed(2)}:1 (requires ${result.minimum}:1)`);
if (failed.length) process.exitCode = 1;
else
  console.info(
    `${results.length} contrast combinations pass. Lowest text contrast: ${Math.min(...results.filter((result) => result.minimum === 4.5).map((result) => result.ratio)).toFixed(2)}:1. Lowest control boundary contrast: ${Math.min(...results.filter((result) => result.minimum === 3).map((result) => result.ratio)).toFixed(2)}:1.`,
  );
