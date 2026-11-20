// 把游戏打包成一个可以直接双击打开的 HTML：node tools/build.mjs
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'huaxinfeng.html');

const result = await build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2022',
  charset: 'utf8',
  legalComments: 'none',
  alias: { three: path.join(root, 'vendor/three/three.module.js') },
  write: false,
});
// 内联脚本里不能出现结束标签的字面量
const code = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

let html = await readFile(path.join(root, 'index.html'), 'utf8');
const importMap = /<script type="importmap">[\s\S]*?<\/script>\s*/;
const entry = /<script type="module" src="\.\/src\/main\.js"><\/script>/;
if (!importMap.test(html) || !entry.test(html)) throw new Error('index.html 的脚本标签与打包脚本预期的不一致');
html = html.replace(importMap, '').replace(entry, () => `<script>\n${code}</script>`);

await writeFile(out, html);
console.log(`${path.basename(out)} ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
