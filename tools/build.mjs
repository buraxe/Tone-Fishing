// Bundles the ES modules into one self-contained HTML file.
//   node tools/build.mjs
// Outputs:
//   dist/tone-fishing.html  – opens by double-click (no server needed for the page itself)
//   dist/artifact.html      – same game, body-only, for hosts that supply the document shell

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const order = [];
const seen = new Map();

function load(file) {
  const abs = path.resolve(file);
  if (seen.has(abs)) return seen.get(abs);
  const id = `__m${seen.size}`;
  seen.set(abs, id);
  let src = fs.readFileSync(abs, 'utf8');
  const head = [];
  src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?\s*$/gm, (_, names, spec) => {
    const dep = load(path.resolve(path.dirname(abs), spec));
    const binds = names.split(',').map((n) => n.trim()).filter(Boolean).map((n) => n.replace(/\s+as\s+/, ': '));
    head.push(`const { ${binds.join(', ')} } = ${dep};`);
    return '';
  });
  if (/^import\s/m.test(src)) throw new Error(`Unsupported import form in ${file}`);
  const exported = [];
  src = src.replace(/^export\s+(async\s+function|function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm, (_, kw, name) => {
    exported.push(name);
    return `${kw} ${name}`;
  });
  if (/^export\s/m.test(src)) throw new Error(`Unsupported export form in ${file}`);
  order.push(`const ${id} = (() => {\n${head.join('\n')}\n${src}\nreturn { ${exported.join(', ')} };\n})();`);
  return id;
}

load(path.join(root, 'js/main.js'));
const bundle = order.join('\n\n');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const body = html.slice(html.indexOf('<!--BODY-START-->') + 17, html.indexOf('<!--BODY-END-->')).trim();
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const script = `<script>\n"use strict";\n${bundle}\n</script>`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });

const full = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>声调钓鱼</title>
${fonts}
<style>
${css}
</style>
</head>
<body>
${body}
${script}
</body>
</html>
`;
fs.writeFileSync(path.join(root, 'dist/tone-fishing.html'), full);

const artifact = `<title>声调钓鱼</title>
${fonts}
<style>
${css}
</style>
${body}
${script}
`;
fs.writeFileSync(path.join(root, 'dist/artifact.html'), artifact);
console.log(`bundled ${order.length} modules → dist/tone-fishing.html (${(full.length / 1024).toFixed(0)} KB)`);
