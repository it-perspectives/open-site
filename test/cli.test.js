import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
const cli = new URL('../bin/opensite.js', import.meta.url);
const run = (...args) => spawnSync(process.execPath, [cli.pathname, ...args], { encoding: 'utf8' });
test('CLI version, help and multi-file lint', () => {
  assert.equal(run('--version').stdout.trim(), '0.1.0');
  assert.equal(run('--help').status, 0);
  const r = run('lint', 'examples/opensite.yaml', 'examples/opensite.json', '--format', 'json', '--warnings-as-errors');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).reports.length, 2);
});
for (const args of [[], ['bad'], ['lint'], ['lint', 'file', '--format', 'xml'], ['lint', 'file', '--page', 'home'], ['lint', 'file', '--unknown'], ['lint', 'file', '--format'], ['check-search', 'file', '--page', 'home'], ['check-search', 'a', 'b', '--page', 'home', '--search', '']]) {
  test(`CLI usage error ${JSON.stringify(args)}`, () => assert.equal(run(...args).status, 2));
}
test('CLI checks queries and omits query values from reports', () => {
  assert.equal(run('check-search', 'examples/opensite.yaml', '--page', 'catalog', '--search', '').status, 0);
  const r = run('check-search', 'examples/opensite.yaml', '--page', 'catalog', '--search', 'page=do-not-print-this', '--format', 'json');
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).valid, false);
  assert.equal(r.stdout.includes('do-not-print-this'), false);
  assert.equal(r.stdout.includes('values'), false);
});
test('file errors take precedence over contract validation errors', () => {
  const r = run('lint', 'missing.json', 'package.json', '--format', 'json');
  assert.equal(r.status, 2);
  assert.equal(JSON.parse(r.stdout).reports.length, 2);
  assert.equal(run('lint', 'README.md').status, 2);
});
test('parse errors, source privacy, and strict warnings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'opensite-cli-'));
  try {
    const file = join(dir, 'contract.json');
    writeFileSync(file, '{"do-not-print-this":');
    const invalid = run('lint', file, '--format', 'json');
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout.includes('do-not-print-this'), false);
    writeFileSync(file, JSON.stringify({ opensite: '0.1.0', info: { title: 'Test', version: '1' }, pages: { home: { title: 'Home', path: '/', components: { button: { description: 'Button', role: 'button', locator: { by: 'css', value: '#submit' } } } } } }));
    assert.equal(run('lint', file).status, 0);
    assert.equal(run('lint', file, '--warnings-as-errors').status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
