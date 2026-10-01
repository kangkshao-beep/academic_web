import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const document = mathjax.document('', {
  InputJax: new TeX(),
  OutputJax: new SVG({ fontCache: 'none' }),
});
const panels = JSON.parse(await readFile('src/lib/reading/universe/knowledge.json', 'utf8'));
await mkdir('public/research-universe/formulas', { recursive: true });
for (const panel of panels) {
  const markup = adaptor.outerHTML(document.convert(panel.latex, { display: true }));
  if (markup.includes('data-mjx-error')) throw Error(`Formula failed: ${panel.id}`);
  const svg = markup
    .slice(markup.indexOf('<svg'), markup.lastIndexOf('</svg>') + 6)
    .replaceAll('currentColor', '#b4e3ee');
  await writeFile(`public/research-universe/formulas/${panel.id}.svg`, svg + '\n');
}
console.log(`Rendered ${panels.length} reviewed HQET formulas to SVG paths.`);
