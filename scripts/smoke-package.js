import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const tarball = process.env.OPEN_TOOLING_NPM_TARBALL || join(root, 'dist', `it-perspectives-opensite-${version}.tgz`);
const directory = mkdtempSync(join(tmpdir(), 'opensite-consumer-'));
const run = (command, args) => {
  const output = spawnSync(command, args, { cwd: directory, encoding: 'utf8' });
  assert.equal(output.status, 0, output.stderr || output.stdout);
  return output.stdout;
};
try {
  writeFileSync(join(directory, 'package.json'), '{"private":true,"type":"module"}\n');
  run('npm', ['install', '--prefer-offline', '--ignore-scripts', '--no-audit', '--no-fund', tarball]);
  writeFileSync(join(directory, 'consumer.js'), `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSpec, lintSpec, checkSearchParams, buildPageURL, resolvePage, getComponent, checkFormValues } from '@it-perspectives/opensite';
import schema from '@it-perspectives/opensite/schema' with { type: 'json' };
assert.equal(schema.properties.opensite.const, '${version}');
const spec = parseSpec(readFileSync('node_modules/@it-perspectives/opensite/examples/opensite.yaml', 'utf8'));
assert.equal(lintSpec(spec).valid, true);
assert.equal(checkSearchParams(spec, 'catalog', 'page=2').values.page, 2);
assert.equal(new URL(buildPageURL(spec, 'product', { baseURL: 'https://example.invalid', pathParams: { productId: 'coffee-1' } })).pathname, '/products/coffee-1');
const page = resolvePage(spec, 'account', { state: 'saving', variant: 'russian' });
assert.equal(page.components.form.components.submit.expect.enabled, false);
assert.equal(page.snackbars.saved.message.equals, 'Профиль сохранён');
assert.equal(getComponent(spec, 'account', 'header.home').role, 'link');
assert.equal(checkFormValues(spec, 'account', 'profile', { displayName: 'Ada', email: 'ada@example.invalid' }).valid, true);
assert.equal(checkFormValues(spec, 'account', 'profile', { displayName: 'Ada' }).valid, false);
`);
  run(process.execPath, ['consumer.js']);
  const cli = join(directory, 'node_modules', '.bin', 'opensite');
  assert.equal(run(cli, ['--version']).trim(), version);
  run(cli, ['lint', 'node_modules/@it-perspectives/opensite/examples/opensite.yaml', '--warnings-as-errors']);
  process.stdout.write('Packed package: API, schema export, examples, and CLI passed in an isolated consumer.\n');
} finally { rmSync(directory, { recursive: true, force: true }); }
