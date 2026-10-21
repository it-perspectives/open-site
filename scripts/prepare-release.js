import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { schema, specificationVersion, parseSpec } from '../src/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
assert.equal(pkg.version, specificationVersion);
assert.equal(schema.properties.opensite.const, specificationVersion);
assert.ok(schema.$id.endsWith(`/opensite-${specificationVersion}.schema.json`));
for (const ext of ['json', 'yaml']) {
  const example = parseSpec(readFileSync(join(root, `examples/opensite.${ext}`), 'utf8'), { format: ext });
  assert.equal(example.opensite, specificationVersion);
}
const dist = resolve(root, 'dist');
mkdirSync(dist, { recursive: true });
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
const { filename } = entry;
const artifacts = [filename];
for (const [source, name] of [
  [`schemas/opensite-${specificationVersion}.schema.json`, `opensite-${specificationVersion}.schema.json`],
  ['SPEC.md', `opensite-${specificationVersion}-SPEC.md`],
  ['examples/opensite.yaml', `opensite-${specificationVersion}.yaml`],
  ['examples/opensite.json', `opensite-${specificationVersion}.json`],
]) {
  copyFileSync(join(root, source), join(dist, name));
  artifacts.push(name);
}
writeFileSync(join(dist, 'SHA256SUMS'), artifacts.map((name) => `${createHash('sha256').update(readFileSync(join(dist, name))).digest('hex')}  ${name}\n`).join(''));
process.stdout.write(`Prepared ${artifacts.length} local OpenSite ${specificationVersion} artifacts and SHA256SUMS in dist/.\n`);
