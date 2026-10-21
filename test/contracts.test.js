import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { lintSpec, resolvePage, getComponent, checkFormValues, SpecValidationError } from '../src/index.js';

const example = JSON.parse(readFileSync(new URL('../examples/opensite.json', import.meta.url), 'utf8'));
const fixture = () => structuredClone(example);
const codes = (spec) => lintSpec(spec).diagnostics.map(({ code }) => code);
const component = (extra = {}) => ({ description: 'Control.', role: 'button', locator: { by: 'testId', value: 'control' }, ...extra });

test('full QA contract validates states, variants, forms, access, transitions, negative URLs, metadata and snackbars', () => {
  assert.deepEqual(lintSpec(example), { valid: true, diagnostics: [] });
});
test('resolution expands shared components, selects defaults, merges context and leaves every input unchanged', () => {
  const before = fixture();
  const page = resolvePage(example, 'account', { state: 'saving', variant: 'russian' });
  assert.deepEqual(page.context, { state: 'saving', variant: 'russian' });
  assert.equal(page.components.header.role, 'banner');
  assert.equal(Object.hasOwn(page.components.header, '$ref'), false);
  assert.equal(page.components.form.components.submit.expect.enabled, false);
  assert.deepEqual(page.components.form.components.submit.expect.accessibleName, { equals: 'Сохранить профиль' });
  assert.deepEqual(page.snackbars.saved.message, { equals: 'Профиль сохранён' });
  assert.equal(page.snackbarPolicy.maxVisible, 3);
  page.components.header.components.home.description = 'Changed';
  page.snackbars.saved.message.equals = 'Changed';
  assert.deepEqual(example, before);
  assert.notEqual(resolvePage(example, 'catalog').components.header.components.home.description, 'Changed');
  assert.equal(resolvePage(example, 'account').context.state, 'ready');
});
test('absence suppresses base checks and localization does not require an absent element', () => {
  const s = fixture();
  s.pages.catalog.components.empty.expect = { text: { equals: 'Fallback' }, count: { min: 1, max: 1 } };
  assert.deepEqual(getComponent(s, 'catalog', 'empty', { state: 'ready', variant: 'russian' }).expect, { presence: 'absent' });
  assert.deepEqual(getComponent(s, 'catalog', 'empty', { state: 'empty', variant: 'russian' }).expect.text, { equals: 'Товары не найдены' });
});
test('explicit presence restores a component and does not inherit absent cardinality', () => {
  const s = fixture();
  s.pages.account.components.saveNotice.expect = { presence: 'absent', count: { max: 0 } };
  s.pages.account.states.saved.expect.saveNotice = { presence: 'required', visibility: 'visible' };
  const expected = getComponent(s, 'account', 'saveNotice', { state: 'saved' }).expect;
  assert.deepEqual(expected, { presence: 'required', visibility: 'visible' });
});
test('page snackbar policy overrides individual global properties', () => {
  const s = fixture(); s.pages.account.snackbarPolicy = { placement: 'top-center', maxVisible: 1 };
  assert.deepEqual(resolvePage(s, 'account').snackbarPolicy, { placement: 'top-center', maxVisible: 1, order: 'newestFirst', overflow: 'queue' });
});
test('timeout transitions respect lifetime overrides in their selected states and variants', () => {
  const s = fixture();
  s.pages.account.variants.mobile.snackbars = { saved: { lifetime: { mode: 'persistent' } } };
  assert.ok(codes(s).includes('SNACKBAR_DISMISS'));
  s.pages.account.transitions.expireSaved.variants = ['desktop'];
  assert.equal(lintSpec(s).valid, true);
  s.pages.account.states.saved.snackbars = { saved: { lifetime: { mode: 'persistent' } } };
  assert.ok(codes(s).includes('SNACKBAR_DISMISS'));
  s.pages.account.variants.desktop.snackbars = { saved: { lifetime: { mode: 'timed', durationMs: 8000 } } };
  assert.equal(lintSpec(s).valid, true);
});
test('CSS warnings point to a shared declaration once, without reference duplication', () => {
  const s = fixture(); s.definitions.components.header.locator = { by: 'css', value: '#site-header' };
  const warnings = lintSpec(s).diagnostics.filter(({ code }) => code === 'LOCATOR_CSS');
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].path, '/definitions/components/header/locator');
});
for (const [label, mutate, code] of [
  ['default state', (s) => { s.pages.account.defaultState = 'missing'; }, 'STATE_UNKNOWN'],
  ['state component', (s) => { s.pages.account.states.ready.expect.missing = { visibility: 'visible' }; }, 'COMPONENT_UNKNOWN'],
  ['page component', (s) => { s.pages.account.expect = { missing: { enabled: true } }; }, 'COMPONENT_UNKNOWN'],
  ['variant declaration', (s) => { s.pages.account.variants.missing = {}; }, 'VARIANT_UNKNOWN'],
  ['variant component', (s) => { s.pages.account.variants.mobile.expect = { missing: { enabled: true } }; }, 'COMPONENT_UNKNOWN'],
  ['expectation count range', (s) => { s.pages.account.components.form.expect = { count: { min: 2, max: 1 } }; }, 'EXPECT_COUNT'],
  ['required zero count', (s) => { s.pages.account.components.form.expect = { count: { max: 0 } }; }, 'EXPECT_PRESENCE'],
  ['absent positive count', (s) => { s.pages.account.components.form.expect = { presence: 'absent', count: { min: 1 } }; }, 'EXPECT_PRESENCE'],
  ['absent visible', (s) => { s.pages.account.components.form.expect = { presence: 'absent', visibility: 'visible' }; }, 'EXPECT_PRESENCE'],
  ['matcher regex', (s) => { s.pages.account.components.form.expect = { text: { pattern: '[' } }; }, 'MATCHER_PATTERN'],
  ['authentication roles', (s) => { s.pages.account.access.authentication = 'optional'; }, 'ACCESS_ROLES'],
  ['unauthenticated outcome', (s) => { delete s.pages.account.access.roles; s.pages.account.access.authentication = 'optional'; }, 'ACCESS_OUTCOME'],
  ['outcome page', (s) => { s.pages.account.access.onUnauthenticated.page = 'missing'; }, 'PAGE_UNKNOWN'],
  ['target page state', (s) => { s.pages.account.access.onUnauthenticated.state = 'saved'; }, 'STATE_UNKNOWN'],
  ['form component', (s) => { s.pages.account.forms.profile.component = 'missing'; }, 'COMPONENT_UNKNOWN'],
  ['field component', (s) => { s.pages.account.forms.profile.fields.email.component = 'missing'; }, 'COMPONENT_UNKNOWN'],
  ['form bounds', (s) => { s.pages.account.forms.profile.fields.displayName.maxLength = 0; }, 'CONSTRAINT_RANGE'],
  ['field regex', (s) => { s.pages.account.forms.profile.fields.email.pattern = '['; }, 'CONSTRAINT_INVALID'],
  ['field literal', (s) => { s.pages.account.forms.profile.fields.email.default = 'invalid'; }, 'LITERAL_INVALID'],
  ['case validity', (s) => { s.pages.account.forms.profile.cases.valid.valid = false; }, 'FORM_CASE_VALIDITY'],
  ['valid case errors', (s) => { s.pages.account.forms.profile.cases.valid.errors = [{ field: 'email', error: 'format' }]; }, 'FORM_CASE_ERRORS'],
  ['case error', (s) => { s.pages.account.forms.profile.cases.invalidEmail.errors[0].error = 'missing'; }, 'FORM_ERROR_UNKNOWN'],
  ['error component', (s) => { s.pages.account.forms.profile.fields.email.errors.format.component = 'missing'; }, 'COMPONENT_UNKNOWN'],
  ['snackbar message regex', (s) => { s.pages.account.snackbars.saved.message = { pattern: '[' }; }, 'MATCHER_PATTERN'],
  ['snackbar component', (s) => { s.pages.account.snackbars.saved.component = 'missing'; }, 'COMPONENT_UNKNOWN'],
  ['snackbar action scope', (s) => { s.pages.account.snackbars.saved.actions.undo.component = 'form.submit'; }, 'SNACKBAR_SCOPE'],
  ['snackbar close scope', (s) => { s.pages.account.snackbars.saved.dismiss.close = 'form.submit'; }, 'SNACKBAR_SCOPE'],
  ['snackbar lifetime', (s) => { s.pages.account.snackbars.saved.lifetime.toleranceMs = 9000; }, 'SNACKBAR_LIFETIME'],
  ['localized snackbar', (s) => { s.pages.account.variants.russian.snackbars.missing = { message: { equals: 'Hi' } }; }, 'SNACKBAR_UNKNOWN'],
  ['localized message regex', (s) => { s.pages.account.variants.russian.snackbars.saved.message = { pattern: '[' }; }, 'MATCHER_PATTERN'],
  ['trigger component', (s) => { s.pages.account.transitions.save.trigger = { event: 'activate', component: 'missing' }; }, 'COMPONENT_UNKNOWN'],
  ['trigger form', (s) => { s.pages.account.transitions.save.trigger.form = 'missing'; }, 'FORM_UNKNOWN'],
  ['trigger snackbar', (s) => { s.pages.account.transitions.undo.trigger.snackbar = 'missing'; }, 'SNACKBAR_UNKNOWN'],
  ['trigger snackbar action', (s) => { s.pages.account.transitions.undo.trigger.action = 'missing'; }, 'SNACKBAR_ACTION_UNKNOWN'],
  ['persistent snackbar expiry', (s) => { s.pages.account.transitions.expireSaved.trigger.snackbar = 'failed'; }, 'SNACKBAR_DISMISS'],
  ['unsupported close', (s) => { delete s.pages.account.snackbars.saved.dismiss.close; }, 'SNACKBAR_DISMISS'],
  ['unsupported escape', (s) => { s.pages.account.snackbars.saved.dismiss.escape = false; }, 'SNACKBAR_DISMISS'],
  ['source state', (s) => { s.pages.account.transitions.save.fromStates = ['missing']; }, 'STATE_UNKNOWN'],
  ['transition variant', (s) => { s.pages.account.transitions.save.variants = ['missing']; }, 'VARIANT_UNKNOWN'],
  ['outcome state', (s) => { s.pages.account.transitions.save.outcome.state = 'missing'; }, 'STATE_UNKNOWN'],
  ['outcome snackbar', (s) => { s.pages.account.transitions.save.outcome.snackbars = ['missing']; }, 'SNACKBAR_UNKNOWN'],
  ['outcome field error', (s) => { s.pages.account.transitions.invalidEmail.outcome.fieldErrors[0].field = 'missing'; }, 'FORM_ERROR_UNKNOWN'],
  ['invalid URL outcome', (s) => { s.pages.catalog.invalidURLs.negativePage.outcome.state = 'missing'; }, 'STATE_UNKNOWN'],
]) test(`rejects inconsistent ${label}`, () => { const s = fixture(); mutate(s); assert.ok(codes(s).includes(code), JSON.stringify(lintSpec(s))); });

for (const [label, mutate] of [
  ['metadata criticality', (s) => { s.meta.criticality = 'urgent'; }],
  ['empty tags', (s) => { s.meta.tags = []; }],
  ['invalid viewport', (s) => { s.variants.mobile.viewport.width = 0; }],
  ['untyped feature flag', (s) => { s.variants.mobile.flags.compactToolbar = 'true'; }],
  ['empty message matcher', (s) => { s.pages.account.snackbars.saved.message = {}; }],
  ['multiple message operators', (s) => { s.pages.account.snackbars.saved.message = { equals: 'Hi', contains: 'Hi' }; }],
  ['empty outcome', (s) => { s.pages.account.transitions.save.outcome = {}; }],
  ['extensions-only outcome', (s) => { s.pages.account.transitions.save.outcome = { 'x-note': 'No standard outcome' }; }],
  ['mixed trigger', (s) => { s.pages.account.transitions.save.trigger.component = 'form'; }],
  ['timed lifetime without duration', (s) => { delete s.pages.account.snackbars.saved.lifetime.durationMs; }],
  ['persistent lifetime with duration', (s) => { s.pages.account.snackbars.saved.lifetime.mode = 'persistent'; }],
  ['zero duration', (s) => { s.pages.account.snackbars.saved.lifetime.durationMs = 0; }],
  ['zero appearance budget', (s) => { s.pages.account.snackbars.saved.checks.appearWithinMs = 0; }],
  ['empty invalid URL input', (s) => { s.pages.catalog.invalidURLs.negativePage.input = {}; }],
  ['absolute invalid URL', (s) => { s.pages.catalog.invalidURLs.negativePage.input.path = 'https://example.invalid'; }],
  ['external reference', (s) => { s.pages.account.components.header.$ref = 'https://example.invalid/header.json'; }],
  ['reference sibling override', (s) => { s.pages.account.components.header.role = 'banner'; }],
]) test(`schema rejects ${label}`, () => { const s = fixture(); mutate(s); assert.ok(codes(s).includes('SCHEMA')); });

test('reference validation catches unknown definitions, alias cycles, nested cycles and excessive expansion', () => {
  const s = fixture(); s.pages.account.components.header.$ref = '#/definitions/components/missing';
  assert.ok(codes(s).includes('REFERENCE_UNKNOWN'));
  s.definitions.components.missing = { $ref: '#/definitions/components/missing' };
  assert.ok(codes(s).includes('REFERENCE_CYCLE'));
  s.definitions.components.missing = component({ components: { child: { $ref: '#/definitions/components/missing' } } });
  assert.ok(codes(s).includes('REFERENCE_CYCLE'));
  const large = { opensite: '0.1.0', info: { title: 'Large', version: '1' }, pages: { home: { title: 'Home', path: '/' } }, definitions: { components: { leaf: component() } } };
  for (let i = 0; i < 15; i++) {
    const previous = i === 0 ? 'leaf' : `branch${i - 1}`;
    large.definitions.components[`branch${i}`] = component({ components: { left: { $ref: `#/definitions/components/${previous}` }, right: { $ref: `#/definitions/components/${previous}` } } });
  }
  assert.ok(codes(large).includes('REFERENCE_LIMIT'));
});
test('references to prototype-like IDs resolve only own definitions', () => {
  const s = fixture(); s.pages.account.components.header = { $ref: '#/definitions/components/constructor' };
  assert.ok(codes(s).includes('REFERENCE_UNKNOWN'));
  s.definitions.components.constructor = component();
  assert.equal(resolvePage(s, 'account').components.header.role, 'button');
});
test('unknown context or address produces structured errors', () => {
  for (const call of [() => resolvePage(example, 'missing'), () => resolvePage(example, 'account', { state: 'missing' }), () => resolvePage(example, 'account', { variant: 'missing' }), () => getComponent(example, 'account', 'constructor'), () => getComponent(example, 'account', 'form.missing')]) assert.throws(call, SpecValidationError);
  const s = fixture(); delete s.pages.account.variants.mobile;
  assert.throws(() => resolvePage(s, 'account', { variant: 'mobile' }), SpecValidationError);
});
test('form values are typed, cloned, and never exposed on failure', () => {
  const values = { displayName: 'Ada', email: 'ada@example.invalid' };
  const checked = checkFormValues(example, 'account', 'profile', values);
  assert.equal(checked.valid, true);
  assert.deepEqual({ ...checked.values }, values);
  checked.values.displayName = 'Changed';
  assert.equal(values.displayName, 'Ada');
  for (const input of [{ displayName: 'Ada' }, { displayName: '', email: 'a@example.invalid' }, { displayName: 'Ada', email: 'invalid' }, { displayName: 10, email: 'a@example.invalid' }, { ...values, extra: 'unexpected' }, null, [], new Date()]) {
    const r = checkFormValues(example, 'account', 'profile', input);
    assert.equal(r.valid, false);
    assert.equal(Object.hasOwn(r, 'values'), false);
    assert.equal(r.diagnostics.some(({ message }) => message.includes('a@example.invalid')), false);
  }
});
test('form initial defaults are not substituted for missing submitted fields', () => {
  const s = fixture(); s.pages.account.forms.profile.fields.email.default = 'initial@example.invalid';
  assert.equal(checkFormValues(s, 'account', 'profile', { displayName: 'Ada' }).valid, false);
});
test('typed form arrays allow empty selections while required selections and numeric/boolean types stay strict', () => {
  const s = fixture();
  s.pages.account.forms.profile.fields.tags = { description: 'Selected tags.', component: 'form.displayName', type: 'array', default: [], examples: [[], ['sale']], minItems: 0 };
  s.pages.account.forms.profile.fields.quantity = { description: 'Quantity.', component: 'form.displayName', type: 'integer', minimum: 1 };
  s.pages.account.forms.profile.fields.marketing = { description: 'Consent.', component: 'form.displayName', type: 'boolean' };
  const input = { displayName: 'Ada', email: 'ada@example.invalid', tags: [], quantity: 1, marketing: false };
  const valid = checkFormValues(s, 'account', 'profile', input);
  assert.equal(valid.valid, true);
  valid.values.tags.push('changed');
  assert.deepEqual(input.tags, []);
  assert.equal(checkFormValues(s, 'account', 'profile', { ...input, quantity: '1' }).valid, false);
  assert.equal(checkFormValues(s, 'account', 'profile', { ...input, marketing: 'false' }).valid, false);
  s.pages.account.forms.profile.fields.tags.required = true;
  delete s.pages.account.forms.profile.cases;
  assert.equal(checkFormValues(s, 'account', 'profile', input).valid, false);
});
test('application cases document outcomes without pretending to execute server validation', () => {
  const s = fixture();
  s.pages.account.forms.profile.cases.rejectedByServer = { description: 'Email already registered.', values: { displayName: 'Ada', email: 'ada@example.invalid' }, valid: false, validation: 'application', errors: [{ field: 'email', error: 'format' }] };
  assert.equal(lintSpec(s).valid, true);
  assert.equal(checkFormValues(s, 'account', 'profile', s.pages.account.forms.profile.cases.rejectedByServer.values).valid, true);
});
test('form validation rejects invalid contracts, unknown forms, and inherited field values', () => {
  assert.equal(checkFormValues({}, 'account', 'profile', {}).valid, false);
  assert.equal(checkFormValues(example, 'missing', 'profile', {}).valid, false);
  assert.equal(checkFormValues(example, 'account', 'constructor', {}).diagnostics[0].code, 'FORM_UNKNOWN');
  const values = Object.create({ email: 'ada@example.invalid' }); values.displayName = 'Ada';
  assert.equal(checkFormValues(example, 'account', 'profile', values).valid, false);
});
