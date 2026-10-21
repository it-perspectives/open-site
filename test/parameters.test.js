import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPageURL, checkSearchParams, SpecValidationError } from '../src/index.js';
const spec = {
  opensite: '0.1.0', info: { title: 'Test', version: '1' }, pages: {
    item: { title: 'Item', path: '/items/{id}', pathParams: { id: { description: 'ID.' } }, searchParams: {
      q: { description: 'Search.', type: 'string', default: '', maxLength: 10 },
      page: { description: 'Page.', type: 'integer', default: 1, minimum: 1 },
      available: { description: 'Available.', type: 'boolean' },
      price: { description: 'Price.', type: 'number', minimum: 0 },
      tag: { description: 'Tags.', type: 'array', maxItems: 3 },
      mode: { description: 'Mode.', type: 'string', enum: ['all', 'new'] },
    } },
  },
};
test('query decoding, repeated arrays, defaults, Unicode, and empty strings', () => {
  const query = new URLSearchParams('q=чай+☕&available=false&price=1.5e2&tag=a&tag=&mode=new');
  const original = query.toString();
  const checked = checkSearchParams(spec, 'item', query);
  assert.equal(checked.valid, true);
  assert.deepEqual({ ...checked.values }, { q: 'чай ☕', page: 1, available: false, price: 150, tag: ['a', ''], mode: 'new' });
  assert.equal(query.toString(), original);
});
for (const query of ['page=01', 'page=+1', 'page=1.2', 'page=0', 'page=9007199254740992', 'page=1&page=2', 'available=1', 'available=TRUE', 'price=NaN', 'price=1e999', 'q=too-long-search', 'mode=old', 'unknown=x', 'tag=a&tag=b&tag=c&tag=d', 'page=']) {
  test(`invalid query ${query}`, () => {
    const checked = checkSearchParams(spec, 'item', query);
    assert.equal(checked.valid, false);
    assert.equal(Object.hasOwn(checked, 'values'), false);
  });
}
test('absence resolves defaults; required without a default fails', () => {
  const s = structuredClone(spec); s.pages.item.searchParams.mode.required = true;
  assert.equal(checkSearchParams(s, 'item', '').valid, false);
  s.pages.item.searchParams.mode.default = 'all';
  assert.equal(checkSearchParams(s, 'item', '').values.mode, 'all');
  assert.equal(checkSearchParams(s, 'item', 'mode=').valid, false);
});
test('invalid contract, page, and search input are diagnostics', () => {
  assert.equal(checkSearchParams({}, 'item', '').valid, false);
  assert.equal(checkSearchParams(spec, 'missing', '').diagnostics[0].code, 'PAGE_UNKNOWN');
  assert.equal(checkSearchParams(spec, 'item', {}).diagnostics[0].code, 'SEARCH_INPUT');
});
test('URL builder encodes values, preserves origin, resolves defaults and round-trips queries', () => {
  const input = { baseURL: 'https://stage.example.invalid', pathParams: { id: 'a/b ?#%' }, searchParams: { q: 'чай ☕', available: false, tag: ['a b', '&'] } };
  const before = structuredClone(input);
  const url = new URL(buildPageURL(spec, 'item', input));
  assert.equal(url.origin, input.baseURL);
  assert.equal(url.pathname, '/items/a%2Fb%20%3F%23%25');
  assert.deepEqual(url.searchParams.getAll('tag'), ['a b', '&']);
  assert.equal(url.searchParams.get('page'), '1');
  assert.equal(checkSearchParams(spec, 'item', url.searchParams).valid, true);
  assert.deepEqual(input, before);
});
for (const baseURL of ['file:///tmp/a', 'javascript:alert(1)', 'https://a.test/path', 'https://a.test/?a=1', 'https://a.test/#hash', 'https://u:p@a.test', 'invalid']) {
  test(`rejects invalid base origin ${baseURL}`, () => assert.throws(() => buildPageURL(spec, 'item', { baseURL, pathParams: { id: '1' } }), SpecValidationError));
}
for (const changes of [{ pathParams: {} }, { pathParams: { id: '.' } }, { pathParams: { id: '..' } }, { pathParams: { id: 1 } }, { pathParams: { id: '' } }, { pathParams: { id: '1', extra: 'x' } }, { searchParams: { page: '2' } }, { searchParams: { tag: [] } }, { searchParams: { extra: 'x' } }, { searchParams: { price: Infinity } }, { searchParams: null }]) {
  test(`builder rejects invalid typed parameters ${JSON.stringify(changes)}`, () => assert.throws(() => buildPageURL(spec, 'item', { baseURL: 'http://localhost:3000', pathParams: { id: '1' }, ...changes }), SpecValidationError));
}
test('path patterns apply before encoding and reject missing values', () => {
  const s = structuredClone(spec); s.pages.item.pathParams.id.pattern = '^item-[0-9]+$';
  assert.throws(() => buildPageURL(s, 'item', { baseURL: 'https://example.invalid', pathParams: { id: 'abc' } }), SpecValidationError);
});
test('URL inputs reject unpaired Unicode surrogates with structured diagnostics', () => {
  assert.throws(() => buildPageURL(spec, 'item', { baseURL: 'https://example.invalid', pathParams: { id: '\uD800' } }), SpecValidationError);
});
test('prototype-like search names are own entries and never inherited', () => {
  const s = structuredClone(spec);
  s.pages.item.searchParams = JSON.parse('{"__proto__":{"description":"Value","type":"string","required":true}}');
  const checked = checkSearchParams(s, 'item', '__proto__=ok');
  assert.equal(checked.values.__proto__, 'ok');
  assert.equal(Object.getPrototypeOf(checked.values), null);
});
