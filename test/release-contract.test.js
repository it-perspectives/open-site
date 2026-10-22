import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from 'yaml';
import { schema } from '../src/index.js';
import { validateSpecificationRelease, schemaUrlForVersion } from '../scripts/release-contract.js';

const valid = { env: { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'specification-v0.1.0' } };
test('release identities use exact versions and immutable tag URLs', () => {
  assert.equal(validateSpecificationRelease(valid), '0.1.0');
  assert.equal(schema.$id, schemaUrlForVersion('0.1.0'));
});
for (const tag of ['v0.1.0', 'extension-v0.1.0', 'specification-v0.2.0', 'specification-v01.1.0', 'specification-v0.1.0-beta', 'specification-v0.1.0-extra']) {
  test(`rejects mismatched release tag ${tag}`, () => assert.throws(() => validateSpecificationRelease({ env: { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: tag } }), /tag/));
}
test('normal branch CI validates release identities without requiring a tag', () => {
  assert.equal(validateSpecificationRelease({ env: { GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'main' } }), '0.1.0');
});
for (const name of ['version', 'name', 'schema version', 'mutable URL', 'schema selector']) {
  test(`rejects incorrect ${name}`, () => {
    const metadata = { name: '@it-perspectives/opensite', version: '0.1.0' };
    const documentSchema = structuredClone(schema);
    if (name === 'version') metadata.version = '0.2.0';
    if (name === 'name') metadata.name = 'another-package';
    if (name === 'schema version') documentSchema.properties.opensite.const = '0.2.0';
    if (name === 'mutable URL') documentSchema.$id = documentSchema.$id.replace('specification-v0.1.0', 'main');
    if (name === 'schema selector') documentSchema.properties.$schema.const = 'https://example.invalid/schema.json';
    assert.throws(() => validateSpecificationRelease({ ...valid, metadata, documentSchema }), /identity, versions, or immutable/);
  });
}
test('future versions must update the package, format, schema identity and selector together', () => {
  const next = structuredClone(schema);
  next.properties.opensite.const = '0.2.0';
  next.$id = schemaUrlForVersion('0.2.0');
  next.properties.$schema.const = next.$id;
  assert.equal(validateSpecificationRelease({ metadata: { name: '@it-perspectives/opensite', version: '0.2.0' }, formatVersion: '0.2.0', documentSchema: next, env: {} }), '0.2.0');
});
test('CI and release delegate to one immutable tooling version with an explicit partial-product exception', () => {
  const workflow = parse(readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8'));
  const ci = parse(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'));
  const pin = '0ac78fd5a1bc8c567d453e36e8e13224df62d74d';
  assert.deepEqual(workflow.on.push.tags, ['specification-v*']);
  assert.equal(workflow.permissions.contents, 'write');
  assert.equal(workflow.permissions['id-token'], 'write');
  assert.equal(workflow.permissions.packages, 'write');
  assert.equal(ci.permissions.contents, 'read');
  for (const [caller, job, called] of [[ci, 'verify', 'verify'], [workflow, 'release', 'release']]) {
    assert.deepEqual(Object.keys(caller.jobs), [job]);
    assert.equal(caller.jobs[job].uses, `it-perspectives/open-tooling/.github/workflows/${called}.yml@${pin}`);
    assert.deepEqual(caller.jobs[job].with, { 'tooling-ref': pin, 'require-complete': false });
  }
  const manifest = JSON.parse(readFileSync(new URL('../.open-project.json', import.meta.url), 'utf8'));
  assert.equal(manifest.products.vscode.enabled, false);
  assert.equal(manifest.products.website.enabled, false);
  assert.deepEqual(manifest.publishing, { npm: false, marketplace: false, openVSX: false });
});
