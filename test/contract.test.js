import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSpec, lintSpec, roles, schema, specificationVersion, SpecParseError } from '../src/index.js';

const minimal = () => ({ opensite: '0.1.0', info: { title: 'Test', version: '1' }, pages: { home: { title: 'Home', path: '/' } } });
const withParam = (p) => { const spec = minimal(); spec.pages.home.searchParams = { q: { description: 'Query.', ...p } }; return spec; };
const withComponent = (c) => { const spec = minimal(); spec.pages.home.components = { submit: { description: 'Submit.', role: 'button', locator: { by: 'role', name: 'Submit' }, ...c } }; return spec; };
const hasCode = (spec, code) => lintSpec(spec).diagnostics.some((d) => d.code === code);

test('equivalent YAML and JSON examples pass strict lint and preserve input', () => {
  const yaml = parseSpec(readFileSync(new URL('../examples/opensite.yaml', import.meta.url), 'utf8'));
  const json = parseSpec(readFileSync(new URL('../examples/opensite.json', import.meta.url), 'utf8'), { format: 'json' });
  assert.deepEqual(yaml, json);
  const before = structuredClone(yaml);
  assert.deepEqual(lintSpec(yaml), { valid: true, diagnostics: [] });
  assert.deepEqual(yaml, before);
  assert.equal(schema.properties.opensite.const, specificationVersion);
});
test('minimal page inventory is valid; page components and parameters are optional', () => assert.equal(lintSpec(minimal()).valid, true));
for (const [name, mutate] of [
  ['no pages', (s) => delete s.pages], ['empty pages', (s) => { s.pages = {}; }],
  ['unsupported version', (s) => { s.opensite = '0.2.0'; }], ['unknown field', (s) => { s.page = {}; }],
  ['wrong schema URL', (s) => { s.$schema = 'https://example.invalid/schema'; }],
  ['missing page title', (s) => delete s.pages.home.title], ['missing path', (s) => delete s.pages.home.path],
  ['invalid page ID', (s) => { s.pages['home.page'] = s.pages.home; }],
  ['blank title', (s) => { s.info.title = '   '; }],
]) test(`schema rejects ${name}`, () => { const spec = minimal(); mutate(spec); assert.equal(lintSpec(spec).valid, false); });
test('extensions are accepted at defined object levels', () => {
  const spec = withComponent({ 'x-ticket': 'QA-1', locator: { by: 'role', 'x-owner': 'QA' } });
  spec['x-owner'] = { team: 'QA' }; spec.pages.home['x-ticket'] = 12;
  assert.equal(lintSpec(spec).valid, true);
});
for (const role of roles) test(`supports contract role ${role}`, () => assert.equal(lintSpec(withComponent({ role })).valid, true));
for (const component of [{ role: undefined }, { locator: undefined }, { role: 'Button' }, { locator: 'button' }, { description: '' },
  { locator: { by: 'role', value: 'Submit' } }, { locator: { by: 'testId' } }, { locator: { by: 'xpath', value: '//button' } },
  { locator: { by: 'testId', value: 'submit', exact: true } }, { locator: { by: 'css', value: '' } },
  { locator: { by: 'role', includeHidden: true } }]) {
  test(`rejects invalid component ${JSON.stringify(component)}`, () => assert.equal(lintSpec(withComponent(component)).valid, false));
}
for (const by of ['testId', 'label', 'placeholder', 'text', 'altText', 'title', 'css']) {
  test(`accepts ${by} locator`, () => {
    const result = lintSpec(withComponent({ locator: { by, value: 'submit' } }));
    assert.equal(result.valid, true);
    assert.equal(result.diagnostics.length, by === 'css' ? 1 : 0);
  });
}
test('nested components require role and locator too', () => assert.equal(lintSpec(withComponent({ components: { child: { description: 'Child.' } } })).valid, false));
for (const [parameter, code] of [
  [{ type: 'string', minimum: 1 }, 'SCHEMA'], [{ type: 'integer', pattern: 'x' }, 'SCHEMA'],
  [{ type: 'boolean', minItems: 1 }, 'SCHEMA'], [{ type: 'array', minItems: 0 }, 'SCHEMA'],
  [{ type: 'string', minLength: 5, maxLength: 1 }, 'CONSTRAINT_RANGE'],
  [{ type: 'number', minimum: 2, maximum: 1 }, 'CONSTRAINT_RANGE'],
  [{ type: 'string', pattern: '[' }, 'CONSTRAINT_INVALID'],
  [{ type: 'integer', default: '1' }, 'LITERAL_INVALID'],
  [{ type: 'integer', minimum: 1, examples: [0] }, 'LITERAL_INVALID'],
  [{ type: 'string', enum: ['ok'], default: 'bad' }, 'LITERAL_INVALID'],
  [{ type: 'string', pattern: '^a', enum: ['bad'] }, 'LITERAL_INVALID'],
  [{ type: 'boolean', enum: [true, true] }, 'SCHEMA'],
  [{ type: 'array', default: [] }, 'LITERAL_INVALID'],
  [{ type: 'array', maxItems: 0 }, 'CONSTRAINT_RANGE'],
  [{ type: 'array', examples: [['a', 1]] }, 'SCHEMA'],
]) test(`parameter constraints ${JSON.stringify(parameter)}`, () => assert.equal(hasCode(withParam(parameter), code), true));
for (const path of ['catalog', '//evil.test/path', '/a/../b', '/%2e%2e/b', '/a?b=c', '/a#b', '/a\\b', '/a b', '/bad%', '/a/{id}-x', '/a//b', '/%2Fhost']) {
  test(`rejects invalid path ${path}`, () => { const s = minimal(); s.pages.home.path = path; assert.equal(lintSpec(s).valid, false); });
}
test('path declarations and unique page paths are checked', () => {
  const s = minimal(); s.pages.other = { title: 'Other', path: '/' };
  assert.equal(hasCode(s, 'PAGE_PATH_DUPLICATE'), true);
  delete s.pages.other; s.pages.home.path = '/users/{id}/{id}';
  assert.equal(hasCode(s, 'PATH_PARAM_MISSING'), true);
  assert.equal(hasCode(s, 'PATH_PARAM_DUPLICATE'), true);
  s.pages.home.path = '/users/{id}'; s.pages.home.pathParams = { id: { description: 'ID.', pattern: '^[0-9]+$', examples: ['abc'] }, other: { description: 'Unused.' } };
  assert.equal(hasCode(s, 'LITERAL_INVALID'), true);
  assert.equal(hasCode(s, 'PATH_PARAM_UNUSED'), true);
});
test('programmatic inputs reject cycles, unsafe numbers, undefined, and non-JSON objects', () => {
  for (const value of [undefined, NaN, Infinity, 9007199254740992, new Date(), 1n, () => 1, '\uD800']) {
    const spec = minimal(); spec['x-value'] = value;
    assert.equal(lintSpec(spec).valid, false);
  }
  const spec = minimal(); spec['x-self'] = spec;
  assert.equal(lintSpec(spec).valid, false);
});
for (const source of ['a: 1\na: 2', 'a: &a x\nb: *a', 'a: !!str x', '<<: x', '1: x', 'a: .nan', 'a: 9007199254740992', '---\na: 1\n---\nb: 2', '%YAML 1.1\n---\na: yes', '{"a": 1, "\\u0061": 2}']) {
  test(`parser rejects unsupported serialization ${JSON.stringify(source)}`, () => assert.throws(() => parseSpec(source), SpecParseError));
}
test('parser rejects non-text, multiple MB, invalid format, non-strict JSON, and excessive nesting', () => {
  for (const args of [[{}], ['a'.repeat(1024 * 1024 + 1)], ['{}', { format: 'xml' }], ['{"x":1,}', { format: 'json' }], ['['.repeat(66) + '0' + ']'.repeat(66)]]) {
    assert.throws(() => parseSpec(...args), SpecParseError);
  }
});
test('prototype-like keys survive serialization without prototype pollution', () => {
  const s = parseSpec('{"opensite":"0.1.0","info":{"title":"Test","version":"1"},"pages":{"constructor":{"title":"Page","path":"/","searchParams":{"__proto__":{"description":"Query","type":"string"}}}}}', { format: 'json' });
  assert.equal(lintSpec(s).valid, true);
  assert.equal(Object.hasOwn(s.pages.constructor.searchParams, '__proto__'), true);
  assert.equal({}.polluted, undefined);
});
