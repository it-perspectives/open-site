import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { schema, specificationVersion, parseSpec } from '../src/index.js';
import { validateSpecificationRelease } from './release-contract.js';
import { extractReleaseNotes } from './release-notes.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
validateSpecificationRelease({ metadata: pkg, documentSchema: schema });
const releaseNotes = extractReleaseNotes(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), specificationVersion);
for (const ext of ['json', 'yaml']) {
  const example = parseSpec(readFileSync(join(root, `examples/opensite.${ext}`), 'utf8'), { format: ext });
  assert.equal(example.opensite, specificationVersion);
}
const dist = resolve(root, 'dist');
mkdirSync(dist, { recursive: true });
const archive = `opensite-${specificationVersion}.tar.gz`;
const sources = ['README.md', 'README.ru.md', 'SPEC.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'LICENSE',
  'package.json', 'package-lock.json', 'schemas', 'examples', 'docs', 'src', 'bin', 'scripts', 'test',
  '.github', '.editorconfig', '.gitignore'];
const archived = spawnSync('tar', ['-czf', join(dist, archive), ...sources], {
  cwd: root, encoding: 'utf8', env: { ...process.env, COPYFILE_DISABLE: '1' },
});
assert.equal(archived.status, 0, archived.stderr || archived.error?.message);
const cache = mkdtempSync(join(tmpdir(), 'opensite-pack-cache-'));
let packed;
try {
  packed = spawnSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', dist, '--cache', cache], { cwd: root, encoding: 'utf8' });
  assert.equal(packed.status, 0, packed.stderr || packed.stdout);
} finally { rmSync(cache, { recursive: true, force: true }); }
// npm <=11 emits an array; npm 12 emits an object keyed by package name.
const metadata = JSON.parse(packed.stdout);
const entry = Array.isArray(metadata) ? metadata.find(({ name }) => name === pkg.name) : metadata[pkg.name];
assert.equal(entry?.filename, `it-perspectives-opensite-${specificationVersion}.tgz`);
assert.equal(entry?.version, specificationVersion);
const { filename } = entry;
const artifacts = [archive, filename];
for (const [source, name] of [
  [`schemas/opensite-${specificationVersion}.schema.json`, `opensite-${specificationVersion}.schema.json`],
  ['SPEC.md', `opensite-${specificationVersion}-SPEC.md`],
  ['examples/opensite.yaml', `opensite-${specificationVersion}.yaml`],
  ['examples/opensite.json', `opensite-${specificationVersion}.json`],
  ['CHANGELOG.md', 'CHANGELOG.md'],
]) {
  copyFileSync(join(root, source), join(dist, name));
  artifacts.push(name);
}
writeFileSync(join(dist, 'release-notes.md'), releaseNotes);
artifacts.push('release-notes.md');
writeFileSync(join(dist, 'SHA256SUMS'), artifacts.sort().map((name) => `${createHash('sha256').update(readFileSync(join(dist, name))).digest('hex')}  ${name}\n`).join(''));
process.stdout.write(`Prepared ${artifacts.length} local OpenSite ${specificationVersion} artifacts and SHA256SUMS in dist/.\n`);
