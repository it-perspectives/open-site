import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { assertJsonValue } from './parser.js';
import { lintContracts, expandComponents, flattenComponents, checkFormData, mergeExpectation } from './contracts.js';
export { parseSpec, SpecParseError } from './parser.js';

export const specificationVersion = '0.1.0';
export const schema = JSON.parse(readFileSync(new URL('../schemas/opensite-0.1.0.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: true, allErrors: true });
const validateSpec = ajv.compile(schema);
export const roles = Object.freeze([...schema.$defs.component.properties.role.enum]);
const own = (value, key) => Object.hasOwn(value, key);
export const pointer = (value) => value.replaceAll('~', '~0').replaceAll('/', '~1');
const issue = (code, path, message, severity = 'error') => ({ severity, code, path, message });
const result = (diagnostics) => ({ valid: !diagnostics.some(({ severity }) => severity === 'error'), diagnostics });
const constraints = ['type', 'pattern', 'minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems'];

function valueSchema(parameter, withEnum = true, form = false) {
  const value = Object.fromEntries(constraints.filter((key) => own(parameter, key)).map((key) => [key, parameter[key]]));
  if (parameter.type === 'array') { value.items = { type: 'string' }; value.minItems ??= form ? 0 : 1; }
  if (withEnum && own(parameter, 'enum')) value.enum = parameter.enum;
  return value;
}

// Bound compiled-constraint retention when consumers validate many contracts.
const valueValidators = new Map();
function compileValue(parameter, withEnum = true, form = false) {
  const shape = valueSchema(parameter, withEnum, form);
  const key = JSON.stringify(shape);
  if (valueValidators.has(key)) return valueValidators.get(key);
  const validate = ajv.compile(shape);
  ajv.removeSchema(shape);
  if (valueValidators.size >= 256) valueValidators.delete(valueValidators.keys().next().value);
  valueValidators.set(key, validate);
  return validate;
}

function validPath(path) {
  if (!path.startsWith('/') || path.startsWith('//') || /[\s\\?#\u0000-\u001f\u007f]/u.test(path)) return false;
  return path.split('/').slice(1).every((segment, index, all) => {
    if (segment === '') return index === all.length - 1;
    if (/^\{[A-Za-z][A-Za-z0-9_-]*\}$/.test(segment)) return true;
    try {
      const decoded = decodeURIComponent(segment);
      return !['.', '..'].includes(decoded) && !/[{}\/\\\u0000-\u001f\u007f]/u.test(decoded);
    } catch { return false; }
  });
}

function validSegment(value) {
  return typeof value === 'string' && value.isWellFormed() && value.length > 0 && !['.', '..'].includes(value) && !/[\u0000-\u001f\u007f]/u.test(value);
}

function lintParameter(parameter, p, diagnostics, { form = false } = {}) {
  for (const [lower, upper] of [['minimum', 'maximum'], ['minLength', 'maxLength'], ['minItems', 'maxItems']]) {
    if (own(parameter, lower) && own(parameter, upper) && parameter[lower] > parameter[upper]) diagnostics.push(issue('CONSTRAINT_RANGE', p, `${lower} must not exceed ${upper}.`));
  }
  if (!form && parameter.type === 'array' && parameter.maxItems === 0) diagnostics.push(issue('CONSTRAINT_RANGE', p, 'Query arrays require at least one item; maxItems must be at least 1.'));
  let check, checkEnum;
  try { check = compileValue(parameter, true, form); checkEnum = compileValue(parameter, false, form); }
  catch { diagnostics.push(issue('CONSTRAINT_INVALID', p, 'Invalid value constraint or Unicode regular expression.')); return; }
  const checkLiteral = (value, suffix, validator) => {
    if (!validator(value)) diagnostics.push(issue('LITERAL_INVALID', `${p}/${suffix}`, 'Declared value does not satisfy the parameter constraints.'));
  };
  if (own(parameter, 'default')) checkLiteral(parameter.default, 'default', check);
  parameter.examples?.forEach((value, i) => checkLiteral(value, `examples/${i}`, check));
  parameter.enum?.forEach((value, i) => checkLiteral(value, `enum/${i}`, checkEnum));
}

/** Validate document shape and semantics. Never reads the site or downloads schemas. */
export function lintSpec(spec) {
  try { assertJsonValue(spec); } catch (error) { return result([issue(error.code, '/', error.message)]); }
  if (!validateSpec(spec)) {
    return result(validateSpec.errors.map((error) => ({
      ...issue('SCHEMA', error.instancePath || '/', error.message), keyword: error.keyword,
      ...((error.params.additionalProperty ?? error.params.missingProperty ?? error.params.propertyName) === undefined ? {} : {
        property: error.params.additionalProperty ?? error.params.missingProperty ?? error.params.propertyName,
      }),
    })));
  }
  const diagnostics = [];
  const paths = new Set();
  for (const [id, page] of Object.entries(spec.pages)) {
    const path = `/pages/${pointer(id)}`;
    if (!validPath(page.path)) diagnostics.push(issue('PAGE_PATH', `${path}/path`, 'Expected an absolute site path with optional whole-segment {parameters}; queries, fragments, dot segments, and invalid escapes are forbidden.'));
    if (paths.has(page.path)) diagnostics.push(issue('PAGE_PATH_DUPLICATE', `${path}/path`, 'Each page must have a distinct path.'));
    paths.add(page.path);
    const placeholders = [...page.path.matchAll(/\{([A-Za-z][A-Za-z0-9_-]*)\}/g)].map((match) => match[1]);
    const names = new Set(placeholders);
    if (names.size !== placeholders.length) diagnostics.push(issue('PATH_PARAM_DUPLICATE', `${path}/path`, 'Path placeholders must be unique.'));
    for (const name of names) {
      if (!own(page.pathParams ?? {}, name)) diagnostics.push(issue('PATH_PARAM_MISSING', `${path}/pathParams/${pointer(name)}`, 'Declare every path placeholder in pathParams.'));
    }
    for (const [name, parameter] of Object.entries(page.pathParams ?? {})) {
      const p = `${path}/pathParams/${pointer(name)}`;
      if (!names.has(name)) diagnostics.push(issue('PATH_PARAM_UNUSED', p, 'Path parameter has no matching placeholder.'));
      let regex;
      try { if (own(parameter, 'pattern')) regex = new RegExp(parameter.pattern, 'u'); }
      catch { diagnostics.push(issue('CONSTRAINT_INVALID', p, 'Invalid Unicode regular expression.')); continue; }
      parameter.examples?.forEach((value, index) => {
        if (!validSegment(value) || (regex && !regex.test(value))) diagnostics.push(issue('LITERAL_INVALID', `${p}/examples/${index}`, 'Example must be a nonempty path value satisfying its pattern.'));
      });
    }
    for (const [name, parameter] of Object.entries(page.searchParams ?? {})) {
      const p = `${path}/searchParams/${pointer(name)}`;
      lintParameter(parameter, p, diagnostics);
    }
  }
  diagnostics.push(...lintContracts(spec, { lintParameter, compileValue, assertJsonValue }));
  return result(diagnostics);
}

export class SpecValidationError extends Error {
  constructor(diagnostics) {
    super('Invalid OpenSite contract or input. Inspect diagnostics for details.');
    this.name = 'SpecValidationError';
    this.diagnostics = diagnostics;
  }
}

export function requirePage(spec, pageId) {
  const checked = lintSpec(spec);
  if (!checked.valid) throw new SpecValidationError(checked.diagnostics);
  if (typeof pageId !== 'string' || !own(spec.pages, pageId)) throw new SpecValidationError([issue('PAGE_UNKNOWN', '/pages', 'Unknown page identifier.')]);
  return spec.pages[pageId];
}

/** Resolve local component references and expectation overlays as data. */
export function resolvePage(spec, pageId, { state, variant } = {}) {
  const page = requirePage(spec, pageId);
  const selectedState = state ?? page.defaultState;
  if (selectedState !== undefined && (typeof selectedState !== 'string' || !own(page.states ?? {}, selectedState))) {
    throw new SpecValidationError([issue('STATE_UNKNOWN', '/state', 'Unknown page state.')]);
  }
  if (variant !== undefined && (typeof variant !== 'string' || !own(spec.variants ?? {}, variant) || (page.variants && !own(page.variants, variant)))) {
    throw new SpecValidationError([issue('VARIANT_UNKNOWN', '/variant', 'Unknown or unsupported page variant.')]);
  }
  const resolved = structuredClone(page);
  resolved.components = expandComponents(spec, page.components, `/pages/${pointer(pageId)}/components`, []);
  const flat = flattenComponents(resolved.components);
  const layers = [page, selectedState === undefined ? undefined : page.states[selectedState], variant === undefined ? undefined : page.variants?.[variant]];
  for (const layer of layers) {
    for (const [id, expectation] of Object.entries(layer?.expect ?? {})) {
      const component = flat.get(id);
      component.expect = mergeExpectation(component.expect, expectation);
    }
    for (const [id, override] of Object.entries(layer?.snackbars ?? {})) Object.assign(resolved.snackbars[id], structuredClone(override));
  }
  resolved.context = { ...(selectedState === undefined ? {} : { state: selectedState }), ...(variant === undefined ? {} : { variant }) };
  if (spec.snackbarPolicy || page.snackbarPolicy) resolved.snackbarPolicy = { ...structuredClone(spec.snackbarPolicy), ...structuredClone(page.snackbarPolicy) };
  return resolved;
}

/** Return an independent component descriptor; performs no DOM operations. */
export function getComponent(spec, pageId, componentId, context) {
  const page = resolvePage(spec, pageId, context);
  const component = flattenComponents(page.components).get(componentId);
  if (!component) throw new SpecValidationError([issue('COMPONENT_UNKNOWN', '/components', 'Unknown component address.')]);
  return component;
}

/** Validate submitted values against field constraints, without executing a form. */
export function checkFormValues(spec, pageId, formId, values) {
  let page;
  try { page = requirePage(spec, pageId); } catch (error) {
    if (error instanceof SpecValidationError) return result(error.diagnostics);
    throw error;
  }
  if (typeof formId !== 'string' || !own(page.forms ?? {}, formId)) return result([issue('FORM_UNKNOWN', '/forms', 'Unknown form identifier.')]);
  return checkFormData(page.forms[formId], values, `/pages/${pointer(pageId)}/forms/${pointer(formId)}`, compileValue, assertJsonValue);
}

function decode(raw, type) {
  if (type === 'string') return raw;
  if (type === 'boolean') return raw === 'true' ? true : raw === 'false' ? false : undefined;
  const pattern = type === 'integer' ? /^-?(?:0|[1-9][0-9]*)$/ : /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
  if (!pattern.test(raw)) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)) ? value : undefined;
}

function checkParameters(page, input, prefix, serialized) {
  const diagnostics = [];
  const values = Object.create(null);
  const definitions = page.searchParams ?? {};
  const keys = serialized ? [...new Set(input.keys())] : Object.keys(input);
  for (const name of keys) {
    if (!own(definitions, name)) diagnostics.push(issue('SEARCH_PARAM_UNKNOWN', `${prefix}/${pointer(name)}`, 'Undeclared search parameter.'));
  }
  for (const [name, parameter] of Object.entries(definitions)) {
    const path = `${prefix}/${pointer(name)}`;
    const present = serialized ? input.has(name) : own(input, name) && input[name] !== undefined;
    if (!present) {
      if (own(parameter, 'default')) values[name] = structuredClone(parameter.default);
      else if (parameter.required) diagnostics.push(issue('SEARCH_PARAM_REQUIRED', path, 'Required search parameter is missing.'));
      continue;
    }
    const raw = serialized ? input.getAll(name) : input[name];
    if (serialized && parameter.type !== 'array' && raw.length !== 1) {
      diagnostics.push(issue('SEARCH_PARAM_REPEATED', path, 'Only array parameters may occur more than once.'));
      continue;
    }
    const value = serialized ? (parameter.type === 'array' ? raw : decode(raw[0], parameter.type)) : raw;
    const validate = compileValue(parameter);
    let jsonCompatible = true;
    try { assertJsonValue(value); } catch { jsonCompatible = false; }
    if (!jsonCompatible || !validate(value)) diagnostics.push(issue('SEARCH_PARAM_VALUE', path, 'Value does not satisfy the declared type and constraints.'));
    else values[name] = structuredClone(value);
  }
  const checked = result(diagnostics);
  return checked.valid ? { ...checked, values } : checked;
}

/** Check a query string or URLSearchParams; unknown keys and repeated scalars fail. */
export function checkSearchParams(spec, pageId, search) {
  let page;
  try { page = requirePage(spec, pageId); } catch (error) {
    if (error instanceof SpecValidationError) return result(error.diagnostics);
    throw error;
  }
  if (typeof search !== 'string' && !(search instanceof URLSearchParams)) return result([issue('SEARCH_INPUT', '/', 'Expected a query string or URLSearchParams.')]);
  return checkParameters(page, new URLSearchParams(search), `/pages/${pointer(pageId)}/searchParams`, true);
}

/** Build a URL from typed parameters and a caller-supplied HTTP(S) origin. */
export function buildPageURL(spec, pageId, { baseURL, pathParams = {}, searchParams = {} } = {}) {
  const page = requirePage(spec, pageId);
  let base;
  try { if (typeof baseURL === 'string') base = new URL(baseURL); } catch { /* report below */ }
  if (!base || !['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new SpecValidationError([issue('BASE_URL', '/', 'baseURL must be an HTTP(S) origin without credentials, path, query, or fragment.')]);
  }
  for (const input of [pathParams, searchParams]) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
      throw new SpecValidationError([issue('PARAM_INPUT', '/', 'Parameter values must be plain objects.')]);
    }
  }
  const diagnostics = [];
  const definitions = page.pathParams ?? {};
  for (const name of Object.keys(pathParams)) if (!own(definitions, name)) diagnostics.push(issue('PATH_PARAM_UNKNOWN', `/pathParams/${pointer(name)}`, 'Undeclared path parameter.'));
  for (const [name, parameter] of Object.entries(definitions)) {
    const value = own(pathParams, name) ? pathParams[name] : undefined;
    if (!validSegment(value) || (parameter.pattern && !new RegExp(parameter.pattern, 'u').test(value))) {
      diagnostics.push(issue('PATH_PARAM_VALUE', `/pathParams/${pointer(name)}`, 'Required path value must be a nonempty string satisfying its pattern; dot segments are forbidden.'));
    }
  }
  const search = checkParameters(page, searchParams, `/pages/${pointer(pageId)}/searchParams`, false);
  diagnostics.push(...search.diagnostics);
  if (!result(diagnostics).valid) throw new SpecValidationError(diagnostics);
  const path = page.path.replace(/\{([A-Za-z][A-Za-z0-9_-]*)\}/g, (_, name) => encodeURIComponent(pathParams[name]));
  const url = new URL(path, base);
  for (const [name, value] of Object.entries(search.values)) {
    for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(name, String(item));
  }
  return url.href;
}
