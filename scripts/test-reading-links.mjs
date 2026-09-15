import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const fileUrl = new URL('../src/lib/reading/links.ts', import.meta.url);
const source = await readFile(fileUrl, 'utf8');
const result = ts.transpileModule(source, {
  fileName: fileUrl.pathname,
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  reportDiagnostics: true,
});
const errors = (result.diagnostics || []).filter(
  (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
);
assert.equal(errors.length, 0, 'Could not transpile Reading link helpers.');

const encoded = Buffer.from(result.outputText, 'utf8').toString('base64');
const { arxivUrl, doiUrl, inspireUrl, verifiedExternalUrl } = await import(
  `data:text/javascript;base64,${encoded}`
);

assert.equal(arxivUrl('arXiv: 1701.00001v2'), 'https://arxiv.org/abs/1701.00001v2');
assert.equal(arxivUrl('hep-ph/9701234'), 'https://arxiv.org/abs/hep-ph/9701234');
assert.equal(arxivUrl('1701.123'), null);
assert.equal(arxivUrl('javascript:alert(1)'), null);
assert.equal(arxivUrl(null), null);

assert.equal(doiUrl('doi:10.5555/example#part'), 'https://doi.org/10.5555/example%23part');
assert.equal(doiUrl('10.1000/example(1)'), 'https://doi.org/10.1000/example(1)');
assert.equal(doiUrl('10.12/missing-registrant-width'), null);
assert.equal(doiUrl('10.5555/has a space'), null);
assert.equal(doiUrl(null), null);

assert.equal(inspireUrl('1234567'), 'https://inspirehep.net/literature/1234567');
assert.equal(inspireUrl('record-123'), null);
assert.equal(inspireUrl(null), null);

assert.equal(verifiedExternalUrl('https://example.org/evidence?q=1'), 'https://example.org/evidence?q=1');
assert.equal(verifiedExternalUrl('http://example.org/evidence'), 'http://example.org/evidence');
assert.equal(verifiedExternalUrl('https://example.org/a%20b'), 'https://example.org/a%20b');
assert.equal(verifiedExternalUrl('https://example.org/a b'), null);
assert.equal(verifiedExternalUrl('https://example.org/%zz'), null);
assert.equal(verifiedExternalUrl('https://user:password@example.org/evidence'), null);
assert.equal(verifiedExternalUrl('data:text/html,unsafe'), null);
assert.equal(verifiedExternalUrl('//example.org/evidence'), null);

process.stdout.write('Reading external-link checks passed (arXiv, DOI, INSPIRE, safe HTTP URLs, malformed and dangerous inputs).\n');
