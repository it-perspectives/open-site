import { buildPageURL, checkSearchParams, lintSpec, parseSpec, resolvePage, getComponent, checkFormValues, type SiteSpec, type Role, type Component, type SnackbarLifetime, type Form, type Transition } from '@it-perspectives/opensite';

const spec: SiteSpec = { opensite: '0.1.0', info: { title: 'Test', version: '1' }, pages: { home: { title: 'Home', path: '/' } } };
const role: Role = 'button';
const component: Component = { description: 'Save changes.', role, locator: { by: 'role', name: 'Save', exact: true } };
void component;
// @ts-expect-error Roles come from the fixed contract vocabulary.
const invalidRole: Role = 'PrimaryButton';
void invalidRole;
// @ts-expect-error Locator descriptors do not accept execution or visibility options.
const invalidLocator: Component = { description: 'Save.', role, locator: { by: 'role', includeHidden: true } };
void invalidLocator;
const parsed: unknown = parseSpec('opensite: "0.1.0"');
lintSpec(parsed);
const query = checkSearchParams(parsed, 'home', '?q=hello');
if (query.valid) query.values.q;
// @ts-expect-error Invalid results do not expose values.
if (!query.valid) query.values;
buildPageURL(spec, 'home', { baseURL: 'https://example.invalid', searchParams: { q: 'hello' } });
// @ts-expect-error Components require role and locator.
const invalid: Component = { description: 'No role or locator.' };
void invalid;
const resolved = resolvePage(spec, 'home', { state: 'ready', variant: 'mobile' });
resolved.components.header.components?.home.role;
getComponent(spec, 'home', 'header.home').locator.by;
const formResult = checkFormValues(spec, 'home', 'profile', { email: 'a@example.invalid' });
if (formResult.valid) formResult.values.email;
const form: Form = { description: 'Profile.', component: 'form', fields: { email: { description: 'Email.', component: 'form.email', type: 'string', required: true } } };
const transition: Transition = { description: 'Submit.', trigger: { event: 'submit', form: 'profile' }, outcome: { state: 'saved', snackbars: ['saved'] } };
void form; void transition;
// @ts-expect-error Timed snackbars require an explicit duration.
const incompleteLifetime: SnackbarLifetime = { mode: 'timed' };
void incompleteLifetime;
// @ts-expect-error Form fields require component addresses.
const invalidForm: Form = { description: 'Profile.', component: 'form', fields: { email: { description: 'Email.', type: 'string' } } };
void invalidForm;
