const own = (object, key) => Object.hasOwn(object, key);
const pointer = (value) => value.replaceAll('~', '~0').replaceAll('/', '~1');
const issue = (code, path, message) => ({ severity: 'error', code, path, message });
const extensions = (key) => key.startsWith('x-');

/** Expand local data references only, with bounded work and no input mutation. */
export function expandComponents(spec, components, path, diagnostics, budget = { remaining: 10000 }, active = new Set(), depth = 0) {
  const expanded = Object.create(null);
  for (const [id, entry] of Object.entries(components ?? {})) {
    const p = `${path}/${pointer(id)}`;
    const expand = (node, at, chain, level) => {
      if (--budget.remaining < 0 || level > 64) {
        if (budget.remaining === -1 || level > 64) diagnostics.push(issue('REFERENCE_LIMIT', at, 'Component expansion exceeds 10000 entries or 64 levels.'));
        return undefined;
      }
      if (own(node, '$ref')) {
        const name = node.$ref.slice('#/definitions/components/'.length);
        if (!own(spec.definitions?.components ?? {}, name)) {
          diagnostics.push(issue('REFERENCE_UNKNOWN', `${at}/$ref`, 'Unknown local component definition.'));
          return undefined;
        }
        if (chain.has(name)) {
          diagnostics.push(issue('REFERENCE_CYCLE', `${at}/$ref`, 'Component references must not form cycles.'));
          return undefined;
        }
        return expand(spec.definitions.components[name], at, new Set([...chain, name]), level + 1);
      }
      const value = structuredClone(node);
      if (node.components) value.components = expandComponents(spec, node.components, `${at}/components`, diagnostics, budget, chain, level + 1);
      return value;
    };
    const value = expand(entry, p, active, depth);
    if (value) expanded[id] = value;
    if (budget.remaining < 0) break;
  }
  return expanded;
}

export function flattenComponents(components, prefix = '', result = new Map()) {
  for (const [name, component] of Object.entries(components ?? {})) {
    const id = prefix ? `${prefix}.${name}` : name;
    result.set(id, component);
    flattenComponents(component.components, id, result);
  }
  return result;
}

export function mergeExpectation(base = {}, override) {
  // Absence suppresses inherited checks; localization cannot make an absent
  // element required. Explicit presence is needed to bring it back.
  if (override.presence === 'absent') return structuredClone(override);
  if (base.presence === 'absent' && override.presence === undefined) return structuredClone(base);
  return { ...(base.presence === 'absent' ? {} : structuredClone(base)), ...structuredClone(override) };
}

/** Validate already typed, submitted form values. Defaults describe initial UI only. */
export function checkFormData(form, input, path, compileValue, assertJsonValue) {
  const diagnostics = [];
  const values = Object.create(null);
  if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    return { valid: false, diagnostics: [issue('FORM_INPUT', path, 'Expected a plain object of typed field values.')] };
  }
  for (const key of Object.keys(input)) {
    if (!own(form.fields, key)) diagnostics.push(issue('FORM_FIELD_UNKNOWN', `${path}/fields/${pointer(key)}`, 'Undeclared form field.'));
  }
  for (const [name, field] of Object.entries(form.fields)) {
    const p = `${path}/fields/${pointer(name)}`;
    const present = own(input, name) && input[name] !== undefined;
    if (!present || (field.required && (input[name] === '' || (Array.isArray(input[name]) && input[name].length === 0)))) {
      if (field.required) diagnostics.push(issue('FORM_FIELD_REQUIRED', p, 'Required form field is missing or empty.'));
      continue;
    }
    let json = true;
    try { assertJsonValue(input[name]); } catch { json = false; }
    if (!json || !compileValue(field, true, true)(input[name])) diagnostics.push(issue('FORM_FIELD_VALUE', p, 'Value does not satisfy the field type and constraints.'));
    else values[name] = structuredClone(input[name]);
  }
  return diagnostics.length ? { valid: false, diagnostics } : { valid: true, diagnostics, values };
}

export function lintContracts(spec, { lintParameter, compileValue, assertJsonValue }) {
  const diagnostics = [];
  const budget = { remaining: 10000 };
  const definitions = expandComponents(spec, spec.definitions?.components, '/definitions/components', diagnostics, budget);
  const pages = new Map();
  for (const [id, page] of Object.entries(spec.pages)) {
    pages.set(id, { page, components: expandComponents(spec, page.components, `/pages/${pointer(id)}/components`, diagnostics, budget) });
  }
  if (diagnostics.length) return diagnostics;
  for (const entry of pages.values()) entry.flat = flattenComponents(entry.components);
  const match = (matcher, path) => {
    if (matcher && own(matcher, 'pattern')) {
      try { new RegExp(matcher.pattern, 'u'); }
      catch { diagnostics.push(issue('MATCHER_PATTERN', path, 'Invalid Unicode regular expression.')); }
    }
  };
  const expectation = (value, path) => {
    for (const key of ['text', 'accessibleName']) match(value[key], `${path}/${key}`);
    if (value.count?.min !== undefined && value.count?.max !== undefined && value.count.min > value.count.max) diagnostics.push(issue('EXPECT_COUNT', `${path}/count`, 'Minimum count must not exceed maximum count.'));
    if ((value.presence ?? 'required') === 'required' && value.count?.max === 0) diagnostics.push(issue('EXPECT_PRESENCE', path, 'Required presence cannot have a maximum count of zero.'));
    if (value.presence === 'absent' && (value.count?.min > 0 || Object.keys(value).some((key) => !['presence', 'count'].includes(key) && !extensions(key)))) {
      diagnostics.push(issue('EXPECT_PRESENCE', path, 'Absent components may only declare a count allowing zero.'));
    }
  };
  const componentExpectations = (components, path) => {
    for (const [id, component] of Object.entries(components ?? {})) {
      const p = `${path}/${pointer(id)}`;
      if (component.expect) expectation(component.expect, `${p}/expect`);
      componentExpectations(component.components, `${p}/components`);
    }
  };
  componentExpectations(definitions, '/definitions/components');
  const warnCSS = (entries, path) => {
    for (const [id, component] of Object.entries(entries ?? {})) {
      if (own(component, '$ref')) continue;
      const p = `${path}/${pointer(id)}`;
      if (component.locator.by === 'css') diagnostics.push({ ...issue('LOCATOR_CSS', `${p}/locator`, 'Prefer accessible role or testId locators over DOM structure.'), severity: 'warning' });
      warnCSS(component.components, `${p}/components`);
    }
  };
  warnCSS(spec.definitions?.components, '/definitions/components');
  const componentReference = (pageId, id, path) => {
    if (!pages.get(pageId).flat.has(id)) diagnostics.push(issue('COMPONENT_UNKNOWN', path, 'Unknown component address on this page.'));
  };
  const expectations = (pageId, values, path) => {
    for (const [id, value] of Object.entries(values ?? {})) {
      componentReference(pageId, id, `${path}/${pointer(id)}`);
      expectation(value, `${path}/${pointer(id)}`);
    }
  };
  const stateReference = (pageId, state, path) => {
    if (!own(pages.get(pageId).page.states ?? {}, state)) diagnostics.push(issue('STATE_UNKNOWN', path, 'Unknown page state.'));
  };
  const variantReference = (pageId, variant, path) => {
    const page = pages.get(pageId).page;
    if (!own(spec.variants ?? {}, variant) || (page.variants && !own(page.variants, variant))) diagnostics.push(issue('VARIANT_UNKNOWN', path, 'Unknown or unsupported page variant.'));
  };
  const snackbarReference = (pageId, snackbar, path) => {
    if (!own(pages.get(pageId).page.snackbars ?? {}, snackbar)) diagnostics.push(issue('SNACKBAR_UNKNOWN', path, 'Unknown snackbar identifier.'));
  };
  const errorReference = (pageId, formId, fieldId, errorId, path) => {
    const forms = pages.get(pageId).page.forms ?? {};
    if (!own(forms, formId) || !own(forms[formId].fields, fieldId) || !own(forms[formId].fields[fieldId].errors ?? {}, errorId)) diagnostics.push(issue('FORM_ERROR_UNKNOWN', path, 'Unknown form, field, or named field error.'));
  };
  const outcome = (sourcePage, value, path) => {
    const target = value.page ?? sourcePage;
    if (!pages.has(target)) { diagnostics.push(issue('PAGE_UNKNOWN', `${path}/page`, 'Unknown outcome page.')); return; }
    if (value.state) stateReference(target, value.state, `${path}/state`);
    value.snackbars?.forEach((id, i) => snackbarReference(target, id, `${path}/snackbars/${i}`));
    expectations(target, value.expect, `${path}/expect`);
    value.fieldErrors?.forEach((e, i) => errorReference(target, e.form, e.field, e.error, `${path}/fieldErrors/${i}`));
  };
  for (const [pageId, { page, components }] of pages) {
    const path = `/pages/${pointer(pageId)}`;
    componentExpectations(components, `${path}/components`);
    warnCSS(page.components, `${path}/components`);
    expectations(pageId, page.expect, `${path}/expect`);
    if (page.defaultState) stateReference(pageId, page.defaultState, `${path}/defaultState`);
    for (const [id, state] of Object.entries(page.states ?? {})) expectations(pageId, state.expect, `${path}/states/${pointer(id)}/expect`);
    for (const [id, variant] of Object.entries(page.variants ?? {})) {
      variantReference(pageId, id, `${path}/variants/${pointer(id)}`);
      expectations(pageId, variant.expect, `${path}/variants/${pointer(id)}/expect`);
    }
    if (page.access) {
      const access = page.access;
      if (access.roles && access.authentication !== 'required') diagnostics.push(issue('ACCESS_ROLES', `${path}/access/roles`, 'Application roles require authentication: required.'));
      if (access.onUnauthenticated && access.authentication !== 'required') diagnostics.push(issue('ACCESS_OUTCOME', `${path}/access/onUnauthenticated`, 'Unauthenticated denial requires authentication: required.'));
      if (access.onForbidden && !access.roles && access.authentication !== 'forbidden') diagnostics.push(issue('ACCESS_OUTCOME', `${path}/access/onForbidden`, 'Forbidden outcomes require an application-role restriction or guest-only access.'));
      for (const key of ['onUnauthenticated', 'onForbidden']) if (access[key]) outcome(pageId, access[key], `${path}/access/${key}`);
    }
    for (const [formId, form] of Object.entries(page.forms ?? {})) {
      const p = `${path}/forms/${pointer(formId)}`;
      componentReference(pageId, form.component, `${p}/component`);
      if (form.submit) componentReference(pageId, form.submit, `${p}/submit`);
      let constraintsValid = true;
      for (const [fieldId, field] of Object.entries(form.fields)) {
        const f = `${p}/fields/${pointer(fieldId)}`;
        componentReference(pageId, field.component, `${f}/component`);
        const before = diagnostics.length;
        lintParameter(field, f, diagnostics, { form: true });
        if (diagnostics.length !== before) constraintsValid = false;
        for (const [errorId, error] of Object.entries(field.errors ?? {})) {
          if (error.component) componentReference(pageId, error.component, `${f}/errors/${pointer(errorId)}/component`);
          match(error.message, `${f}/errors/${pointer(errorId)}/message`);
        }
      }
      for (const [caseId, item] of Object.entries(form.cases ?? {})) {
        const c = `${p}/cases/${pointer(caseId)}`;
        if (constraintsValid && (item.validation ?? 'constraints') === 'constraints') {
          const checked = checkFormData(form, item.values, p, compileValue, assertJsonValue);
          if (checked.valid !== item.valid) diagnostics.push(issue('FORM_CASE_VALIDITY', c, 'Case validity disagrees with the field constraints.'));
        }
        if (item.valid && item.errors) diagnostics.push(issue('FORM_CASE_ERRORS', c, 'Valid cases must not expect field errors.'));
        item.errors?.forEach((e, i) => errorReference(pageId, formId, e.field, e.error, `${c}/errors/${i}`));
      }
    }
    const scoped = (id, parent, p) => {
      componentReference(pageId, id, p);
      if (id !== parent && !id.startsWith(`${parent}.`)) diagnostics.push(issue('SNACKBAR_SCOPE', p, 'Snackbar controls and message must be within its component subtree.'));
    };
    for (const [snackbarId, snackbar] of Object.entries(page.snackbars ?? {})) {
      const p = `${path}/snackbars/${pointer(snackbarId)}`;
      componentReference(pageId, snackbar.component, `${p}/component`);
      match(snackbar.message, `${p}/message`);
      if (snackbar.messageComponent) scoped(snackbar.messageComponent, snackbar.component, `${p}/messageComponent`);
      if (snackbar.dismiss?.close) scoped(snackbar.dismiss.close, snackbar.component, `${p}/dismiss/close`);
      for (const [id, action] of Object.entries(snackbar.actions ?? {})) scoped(action.component, snackbar.component, `${p}/actions/${pointer(id)}/component`);
      if (snackbar.lifetime?.mode === 'timed' && snackbar.lifetime.toleranceMs > snackbar.lifetime.durationMs) diagnostics.push(issue('SNACKBAR_LIFETIME', `${p}/lifetime`, 'Timing tolerance must not exceed duration.'));
    }
    for (const [kind, layers] of [['states', page.states], ['variants', page.variants]]) {
      for (const [id, layer] of Object.entries(layers ?? {})) {
        for (const [snackbarId, override] of Object.entries(layer.snackbars ?? {})) {
          const p = `${path}/${kind}/${pointer(id)}/snackbars/${pointer(snackbarId)}`;
          snackbarReference(pageId, snackbarId, p);
          match(override.message, `${p}/message`);
          if (override.lifetime?.mode === 'timed' && override.lifetime.toleranceMs > override.lifetime.durationMs) diagnostics.push(issue('SNACKBAR_LIFETIME', `${p}/lifetime`, 'Timing tolerance must not exceed duration.'));
        }
      }
    }
    for (const [id, transition] of Object.entries(page.transitions ?? {})) {
      const p = `${path}/transitions/${pointer(id)}`;
      const trigger = transition.trigger;
      if (trigger.component) componentReference(pageId, trigger.component, `${p}/trigger/component`);
      if (trigger.form && !own(page.forms ?? {}, trigger.form)) diagnostics.push(issue('FORM_UNKNOWN', `${p}/trigger/form`, 'Unknown form.'));
      if (trigger.snackbar) {
        snackbarReference(pageId, trigger.snackbar, `${p}/trigger/snackbar`);
        const snackbar = own(page.snackbars ?? {}, trigger.snackbar) ? page.snackbars[trigger.snackbar] : undefined;
        if (snackbar && trigger.event === 'snackbarAction' && !own(snackbar.actions ?? {}, trigger.action)) diagnostics.push(issue('SNACKBAR_ACTION_UNKNOWN', `${p}/trigger/action`, 'Unknown snackbar action.'));
        if (snackbar && trigger.event === 'snackbarDismiss') {
          const supported = { close: Boolean(snackbar.dismiss?.close), escape: snackbar.dismiss?.escape === true, timeout: snackbar.lifetime?.mode === 'timed' };
          if (trigger.reason === 'timeout') {
            const states = transition.fromStates ?? Object.keys(page.states ?? {});
            const stateModes = (states.length ? states : [undefined]).map((state) => (state === undefined ? undefined : page.states?.[state]?.snackbars?.[trigger.snackbar]?.lifetime?.mode) ?? snackbar.lifetime?.mode ?? 'persistent');
            const variants = transition.variants ?? [undefined, ...Object.keys(page.variants ?? spec.variants ?? {})];
            supported.timeout = variants.every((variant) => {
              const mode = variant === undefined ? undefined : page.variants?.[variant]?.snackbars?.[trigger.snackbar]?.lifetime?.mode;
              return mode === undefined ? stateModes.every((value) => value === 'timed') : mode === 'timed';
            });
          }
          if (!supported[trigger.reason]) diagnostics.push(issue('SNACKBAR_DISMISS', `${p}/trigger/reason`, 'This dismissal mechanism must be supported in every declared source state and variant.'));
        }
      }
      transition.fromStates?.forEach((state, i) => stateReference(pageId, state, `${p}/fromStates/${i}`));
      transition.variants?.forEach((variant, i) => variantReference(pageId, variant, `${p}/variants/${i}`));
      outcome(pageId, transition.outcome, `${p}/outcome`);
    }
    for (const [id, invalid] of Object.entries(page.invalidURLs ?? {})) outcome(pageId, invalid.outcome, `${path}/invalidURLs/${pointer(id)}/outcome`);
  }
  return diagnostics;
}
