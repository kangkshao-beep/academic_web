import { constants } from 'node:fs';
import { access, chmod, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  READING_PUBLIC_DATA_FILES,
  projectReadingPublicBundle,
} from '../functions/reading/_public-data.mjs';

function parseArguments(argv) {
  if (argv.length !== 4 || argv[0] !== '--input-dir' || argv[2] !== '--output-dir') {
    throw new Error('Expected explicit input and output directories.');
  }
  if (!argv[1] || !argv[3] || argv[1].includes('\0') || argv[3].includes('\0')) {
    throw new Error('Invalid directory argument.');
  }
  return { input: argv[1], output: argv[3] };
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function ensureMissing(target) {
  try {
    await access(target, constants.F_OK);
    throw new Error('Output directory already exists.');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
}

async function main() {
  const { input, output } = parseArguments(process.argv.slice(2));
  const projectRoot = await realpath(fileURLToPath(new URL('..', import.meta.url)));
  const inputRoot = await realpath(path.resolve(input));
  const requestedOutput = path.resolve(output);
  const outputParent = await realpath(path.dirname(requestedOutput));
  const outputRoot = path.join(outputParent, path.basename(requestedOutput));

  if (isWithin(projectRoot, outputRoot) || isWithin(inputRoot, outputRoot)) {
    throw new Error('Output must be outside the repository and input directory.');
  }
  await ensureMissing(outputRoot);

  const sourceFiles = {};
  for (const filename of READING_PUBLIC_DATA_FILES) {
    sourceFiles[filename] = JSON.parse(await readFile(path.join(inputRoot, filename), 'utf8'));
  }
  const projected = projectReadingPublicBundle(sourceFiles, 'private');

  const serialized = Object.fromEntries(
    READING_PUBLIC_DATA_FILES.map((filename) => [filename, `${JSON.stringify(projected[filename], null, 2)}\n`])
  );
  await mkdir(outputRoot, { mode: 0o700 });
  for (const filename of READING_PUBLIC_DATA_FILES) {
    const target = path.join(outputRoot, filename);
    await writeFile(target, serialized[filename], { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await chmod(target, 0o600);
  }
  process.stdout.write('Built four allowlisted Reading public release files.\n');
}

main().catch(() => {
  process.stderr.write('Reading public release build failed.\n');
  process.exitCode = 1;
});
