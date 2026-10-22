export type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };
export type Role = 'alert' | 'alertdialog' | 'application' | 'article' | 'banner' | 'blockquote' | 'button' | 'caption' | 'cell' | 'checkbox' | 'code' | 'columnheader' | 'combobox' | 'complementary' | 'contentinfo' | 'definition' | 'deletion' | 'dialog' | 'directory' | 'document' | 'emphasis' | 'feed' | 'figure' | 'form' | 'generic' | 'grid' | 'gridcell' | 'group' | 'heading' | 'img' | 'insertion' | 'link' | 'list' | 'listbox' | 'listitem' | 'log' | 'main' | 'marquee' | 'math' | 'meter' | 'menu' | 'menubar' | 'menuitem' | 'menuitemcheckbox' | 'menuitemradio' | 'navigation' | 'none' | 'note' | 'option' | 'paragraph' | 'presentation' | 'progressbar' | 'radio' | 'radiogroup' | 'region' | 'row' | 'rowgroup' | 'rowheader' | 'scrollbar' | 'search' | 'searchbox' | 'separator' | 'slider' | 'spinbutton' | 'status' | 'strong' | 'subscript' | 'superscript' | 'switch' | 'tab' | 'table' | 'tablist' | 'tabpanel' | 'term' | 'textbox' | 'time' | 'timer' | 'toolbar' | 'tooltip' | 'tree' | 'treegrid' | 'treeitem';
export interface Extensions { [key: `x-${string}`]: JsonValue | undefined }
export type ParameterValue = string | number | boolean | string[];
export interface ParameterBase extends Extensions {
  description: string;
  required?: boolean;
  deprecated?: boolean;
}
export type SearchParam = ParameterBase & (
  | { type: 'string'; default?: string; examples?: string[]; enum?: string[]; pattern?: string; minLength?: number; maxLength?: number }
  | { type: 'integer' | 'number'; default?: number; examples?: number[]; enum?: number[]; minimum?: number; maximum?: number }
  | { type: 'boolean'; default?: boolean; examples?: boolean[]; enum?: boolean[] }
  | { type: 'array'; default?: string[]; examples?: string[][]; enum?: string[][]; minItems?: number; maxItems?: number }
);
export type Locator = Extensions & (
  | { by: 'role'; name?: string; exact?: boolean }
  | { by: 'testId' | 'css'; value: string }
  | { by: 'label' | 'placeholder' | 'text' | 'altText' | 'title'; value: string; exact?: boolean }
);
export interface Meta extends Extensions {
  tags?: string[]; criticality?: 'low' | 'normal' | 'high' | 'critical'; owner?: string; requirements?: string[];
}
export type Matcher = Extensions & ({ equals: string } | { contains: string } | { pattern: string });
export interface Expectation extends Extensions {
  presence?: 'required' | 'optional' | 'absent'; visibility?: 'visible' | 'hidden' | 'any';
  enabled?: boolean; readOnly?: boolean; checked?: boolean | 'mixed'; selected?: boolean; expanded?: boolean;
  required?: boolean; accessibleName?: Matcher; text?: Matcher; value?: ParameterValue | null;
  count?: Extensions & { min?: number; max?: number };
}
export type Expectations = Record<string, Expectation>;
export interface ComponentReference extends Extensions { $ref: `#/definitions/components/${string}` }
export type ComponentEntry = Component | ComponentReference;
export interface Component extends Extensions {
  description: string;
  role: Role;
  locator: Locator;
  components?: Record<string, ComponentEntry>;
  expect?: Expectation;
  meta?: Meta;
}
export interface State extends Extensions { description: string; expect?: Expectations; snackbars?: Record<string, SnackbarOverride>; meta?: Meta }
export interface Variant extends Extensions {
  description: string; locale?: string; viewport?: Extensions & { width: number; height: number }; flags?: Record<string, boolean>; meta?: Meta;
}
export interface VariantOverride extends Extensions { description?: string; expect?: Expectations; snackbars?: Record<string, SnackbarOverride>; meta?: Meta }
export interface FieldError extends Extensions { description: string; component?: string; message?: Matcher }
export type FormField = SearchParam & {
  component: string;
  inputType?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'url' | 'number' | 'date' | 'time' | 'datetime-local' | 'month' | 'week' | 'checkbox' | 'radio' | 'select' | 'textarea';
  errors?: Record<string, FieldError>;
};
export interface FormCase extends Extensions {
  description: string; values: Record<string, JsonValue>; valid: boolean; validation?: 'constraints' | 'application';
  errors?: Array<Extensions & { field: string; error: string }>; meta?: Meta;
}
export interface Form extends Extensions {
  description: string; component: string; submit?: string; validation?: 'submit' | 'blur' | 'input';
  fields: Record<string, FormField>; cases?: Record<string, FormCase>; meta?: Meta;
}
export interface Outcome extends Extensions {
  page?: string; state?: string; snackbars?: string[]; expect?: Expectations;
  url?: { path?: string; search?: string };
  fieldErrors?: Array<Extensions & { form: string; field: string; error: string }>; statusCode?: number;
}
export interface Access extends Extensions {
  authentication?: 'required' | 'optional' | 'forbidden'; roles?: string[]; onUnauthenticated?: Outcome; onForbidden?: Outcome;
}
export type Trigger = Extensions & (
  | { event: 'activate' | 'change'; component: string }
  | { event: 'submit'; form: string }
  | { event: 'key'; component: string; key: string }
  | { event: 'snackbarAction'; snackbar: string; action: string }
  | { event: 'snackbarDismiss'; snackbar: string; reason: 'close' | 'escape' | 'timeout' }
);
export interface Transition extends Extensions {
  description: string; trigger: Trigger; fromStates?: string[]; variants?: string[]; preconditions?: string[]; outcome: Outcome; meta?: Meta;
}
export interface InvalidURL extends Extensions { description: string; input: Extensions & { path?: string; search?: string }; outcome: Outcome; meta?: Meta }
export interface SnackbarPolicy extends Extensions {
  placement?: 'top-start' | 'top-center' | 'top-end' | 'bottom-start' | 'bottom-center' | 'bottom-end';
  maxVisible?: number; order?: 'oldestFirst' | 'newestFirst'; overflow?: 'queue' | 'replaceOldest';
}
export type SnackbarLifetime = Extensions & (
  | { mode: 'persistent' }
  | { mode: 'timed'; durationMs: number; toleranceMs?: number; pauseOnHover?: boolean; pauseOnFocus?: boolean }
);
export interface SnackbarOverride extends Extensions {
  message?: Matcher; variant?: 'neutral' | 'info' | 'success' | 'warning' | 'error'; announcement?: 'polite' | 'assertive' | 'off';
  focus?: 'preserve' | 'move'; lifetime?: SnackbarLifetime; checks?: Extensions & { appearWithinMs?: number; dismissWithinMs?: number };
}
export interface Snackbar extends SnackbarOverride {
  description: string; component: string; variant: 'neutral' | 'info' | 'success' | 'warning' | 'error'; message: Matcher;
  messageComponent?: string; actions?: Record<string, Extensions & { description: string; component: string; dismisses?: boolean }>;
  dismiss?: Extensions & { close?: string; escape?: boolean }; meta?: Meta;
}
export interface Page extends Extensions {
  title: string;
  description?: string;
  path: string;
  pathParams?: Record<string, Extensions & { description: string; pattern?: string; examples?: string[] }>;
  searchParams?: Record<string, SearchParam>;
  components?: Record<string, ComponentEntry>;
  meta?: Meta; expect?: Expectations; defaultState?: string; states?: Record<string, State>;
  variants?: Record<string, VariantOverride>; access?: Access; forms?: Record<string, Form>;
  transitions?: Record<string, Transition>; invalidURLs?: Record<string, InvalidURL>;
  snackbars?: Record<string, Snackbar>; snackbarPolicy?: SnackbarPolicy;
}
export interface SiteSpec extends Extensions {
  $schema?: 'https://raw.githubusercontent.com/it-perspectives/open-site/specification-v0.1.0/schemas/opensite-0.1.0.schema.json';
  opensite: '0.1.0';
  info: Extensions & { title: string; version: string; description?: string };
  pages: Record<string, Page>;
  definitions?: Extensions & { components?: Record<string, ComponentEntry> };
  variants?: Record<string, Variant>; meta?: Meta; snackbarPolicy?: SnackbarPolicy;
}
export interface PageContext { state?: string; variant?: string }
export interface ResolvedComponent extends Omit<Component, 'components'> { components?: Record<string, ResolvedComponent> }
export interface ResolvedPage extends Omit<Page, 'components'> { components: Record<string, ResolvedComponent>; context: PageContext }
export interface Diagnostic {
  severity: 'error' | 'warning';
  code: string;
  path: string;
  message: string;
  keyword?: string;
  property?: string;
}
export type ValidationResult = { valid: true; diagnostics: Diagnostic[] } | { valid: false; diagnostics: Diagnostic[] };
export type SearchResult =
  | { valid: true; diagnostics: Diagnostic[]; values: Record<string, ParameterValue> }
  | { valid: false; diagnostics: Diagnostic[] };
export const specificationVersion: '0.1.0';
export const schema: Record<string, unknown>;
export const roles: readonly Role[];
export class SpecParseError extends Error { code: string; constructor(code: string, message: string) }
export class SpecValidationError extends Error { diagnostics: Diagnostic[]; constructor(diagnostics: Diagnostic[]) }
/** Parsing checks serialization; lintSpec checks the contract. */
export function parseSpec(source: string, options?: { format?: 'yaml' | 'json' }): unknown;
export function lintSpec(spec: unknown): ValidationResult;
export function checkSearchParams(spec: unknown, pageId: string, search: string | URLSearchParams): SearchResult;
export function checkFormValues(spec: unknown, pageId: string, formId: string, values: Record<string, unknown>): SearchResult;
export function resolvePage(spec: unknown, pageId: string, context?: PageContext): ResolvedPage;
export function getComponent(spec: unknown, pageId: string, componentId: string, context?: PageContext): ResolvedComponent;
export function buildPageURL(spec: unknown, pageId: string, options: {
  baseURL: string;
  pathParams?: Record<string, string>;
  searchParams?: Record<string, ParameterValue | undefined>;
}): string;
