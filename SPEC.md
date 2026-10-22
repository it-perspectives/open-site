# OpenSite 0.1.0

Status: initial draft. This document is normative. MUST, MUST NOT, SHOULD, and
MAY express conformance requirements.

## 1. Purpose and scope

OpenSite describes the public UI contract of a website for quality assurance:
which pages exist, their URL parameters, and how components are addressed.
It is independent of programming languages and application frameworks.

A contract describes intended UI structure, states, expectations, access rules,
forms, transitions, invalid-URL outcomes, and transient notifications. It MUST
NOT be treated as proof that a deployed application conforms. The format is
framework-independent and contains no executable test scripts.

Credentials, authentication implementation, fixture provisioning, network
mocking, browser orchestration, visual baselines, and accessibility audits remain
consumer concerns. External imports, iframe transitions, executable expressions,
regex locator values, and hash-based routing are outside this version. Local
component references and explicit typed expectation matchers are supported.

This is an unreleased 0.1.0 draft. The additions below revise that draft; no
previously published immutable schema is changed by this checkout.

## 2. Serialization

A document MUST be one JSON object serialized as UTF-8 JSON or YAML 1.2.
Recommended names: `opensite.yaml`, `opensite.yml`, `opensite.json`.
Both serializations MUST have identical semantics.

Keys MUST be unique strings, including keys whose escapes decode to the same
string. JSON syntax MUST be strict. YAML aliases, explicit tags, merge keys,
multiple documents, and YAML 1.1 coercion MUST NOT be used. `<<` is reserved
throughout the document. An unused YAML anchor has no semantic effect.
Values MUST be JSON-compatible, finite, and contain well-formed Unicode.
Integers MUST lie within ±9007199254740991. The reference parser limits input
to 1 MiB and the resulting data model to 64 levels of nesting.

Objects MUST NOT contain unknown properties except extension properties matching
`^x-[A-Za-z0-9][A-Za-z0-9._-]*$`. Extension-bearing objects are identified by the JSON Schema, including the
root, Info, Page, parameters, components, locators, and QA declaration objects. Extension
values MUST be JSON-compatible. Unrecognized extensions MUST be ignored and
MUST NOT redefine standard fields. Keys in identifier maps are entries rather
than extension properties.

## 3. Root and Info objects

| Root field | Required | Meaning |
| --- | --- | --- |
| `opensite` | Yes | Exact specification version `"0.1.0"`. |
| `info` | Yes | Contract metadata. |
| `pages` | Yes | Nonempty map of stable page IDs to Page objects. |
| `definitions` | No | Local reusable component definitions. |
| `variants` | No | Nonempty catalog of named interface variants. |
| `meta` | No | QA metadata. |
| `snackbarPolicy` | No | Shared notification stacking and placement policy. |
| `$schema` | No | Exactly `https://raw.githubusercontent.com/it-perspectives/open-site/specification-v0.1.0/schemas/opensite-0.1.0.schema.json`. An editor hint, never a validator download instruction. |

Info requires nonblank string `title` and `version`; optional `description`
is a string. `info.version` versions the application's website contract,
independently of `opensite`. SemVer is recommended for `info.version`.

Page IDs, component IDs, and path-parameter names MUST match
`^[A-Za-z][A-Za-z0-9_-]*$`. IDs are case-sensitive and SHOULD remain stable
across cosmetic changes. Dots are forbidden because they separate nested
component IDs in the contract hierarchy. Search-parameter names are case-sensitive,
nonempty strings without this identifier restriction.

## 4. Page object

| Field | Required | Meaning |
| --- | --- | --- |
| `title` | Yes | Nonblank human-readable page name. This is documentation, not an HTML title assertion. |
| `path` | Yes | Site-root-relative URL path, optionally containing path placeholders. |
| `description` | No | Description of the page's purpose. |
| `pathParams` | No | Map of placeholder names to Path Parameter objects. |
| `searchParams` | No | Map of decoded query key names to Search Parameter objects. |
| `components` | No | Map of stable IDs to inline components or local component references. |
| `expect` | No | Base component expectation overrides, keyed by dotted component ID. |
| `states`, `defaultState` | No | Named states and optional default state ID. |
| `variants` | No | Supported variant IDs mapped to page-specific overrides. |
| `access` | No | Authentication/application-role policy and denial outcomes. |
| `forms` | No | Form, field, validation, and example-case declarations. |
| `transitions` | No | Named triggers and expected outcomes. |
| `invalidURLs` | No | Negative URL cases and expected application outcomes. |
| `snackbars`, `snackbarPolicy` | No | Transient notifications and page-specific policy overrides. |
| `meta` | No | QA metadata. |

Omitted maps mean empty maps. Empty maps are permitted here. A page inventory
MUST NOT contain two pages with the same literal `path`. Different templates
can overlap; version 0.1.0 does not perform route matching or precedence analysis.

`path` MUST start with exactly one `/`. It MUST NOT contain query strings,
fragments, whitespace, control characters, backslashes, invalid percent escapes,
interior empty segments, or literal/percent-encoded `.` and `..` segments.
A trailing slash is permitted and is significant. Percent-encoded slashes,
backslashes, braces, and control characters in static segments are forbidden.

A placeholder MUST occupy a complete segment, e.g. `/products/{productId}`.
Each placeholder MUST occur once, have exactly one declaration in `pathParams`,
and every declaration MUST occur in `path`. Braces are otherwise forbidden.

### Path Parameter object

Requires nonblank string `description`. Optional `pattern` is an ECMAScript
Unicode regular expression. Optional `examples` is a nonempty array of nonempty
strings satisfying the pattern. Matching is unanchored unless `^`/`$` are used.

Every path parameter is required at URL construction. Its value MUST be a
nonempty, well-formed Unicode string, MUST NOT be `.` or `..`, and MUST NOT
contain control characters. The builder MUST validate the value before encoding
it once as a single segment using `encodeURIComponent` semantics. A `/` inside
a value is encoded as `%2F`; callers MUST pass original, unencoded values.
Patterns apply to original values. Numeric-looking IDs are still strings.

## 5. Search Parameter object

| Field | Meaning |
| --- | --- |
| `description` | Required nonblank purpose. |
| `type` | Required: `string`, `integer`, `number`, `boolean`, or `array`. |
| `required` | Optional boolean; defaults to `false`. Requires a value after resolving a default. |
| `deprecated` | Optional boolean; defaults to `false`. Documentation annotation; no automatic warning or rejection. |
| `default` | Optional typed fallback when the key is absent. |
| `examples` | Optional nonempty array of typed example values. |
| `enum` | Optional nonempty array of unique typed permitted values. |
| `pattern` | String-only ECMAScript regex in Unicode mode, with no other flags. |
| `minLength`, `maxLength` | String-only nonnegative safe integers; Unicode code-point length. |
| `minimum`, `maximum` | Inclusive numeric bounds, only for `integer` and `number`. |
| `minItems`, `maxItems` | Array-only safe integer bounds. `minItems` MUST be at least 1; `maxItems` is nonnegative. Arrays always require at least one item. |

Defaults, examples, and enum members MUST have the declared type and satisfy
all constraints. Enum members MUST satisfy constraints other than their own
enum membership. For `array`, each value is a **nonempty array of strings**;
an enum constrains the entire ordered array, including duplicates. Null values,
objects, nested arrays, and arrays of numbers/booleans are unsupported.
Lower bounds MUST NOT exceed upper bounds. Invalid patterns are errors.

### Query interpretation

A checker MUST first validate the contract, then interpret a query using WHATWG
`URLSearchParams` form decoding: percent-decoding and `+` as a space. Input is
a query string with an optional leading `?`, or an equivalent decoded query
multimap. It is not a complete URL. Malformed escapes/UTF-8 follow the WHATWG
replacement behavior; this version adds no stricter wire decoder.

Unknown query keys MUST be rejected. A missing optional parameter without a
default is omitted from the typed result. A default MUST only apply when the
key is absent. Present empty strings MUST NOT select a default. Defaults count
as present for `required`. Unrelated inherited object properties are not values.
Invalid results MUST NOT expose a partial typed-value object.

| Type | Interpretation of decoded query values |
| --- | --- |
| `string` | Preserve the value, including whitespace and empty strings. Exactly one occurrence. |
| `integer` | Exactly one occurrence; `^-?(?:0\|[1-9][0-9]*)$`, within the safe integer range. |
| `number` | Exactly one occurrence; JSON decimal syntax, including fractions/exponents. Finite IEEE 754 binary64; integral results within the safe integer range. |
| `boolean` | Exactly one occurrence; only literal `true` and `false`. |
| `array` | All occurrences in order as strings, including duplicates and empty strings. At least one occurrence. No comma splitting. |

The number grammar is `^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$`.
No trimming or coercion beyond these rules is permitted. `1`, `yes`, and `TRUE`
are not booleans. `tag=a&tag=b` becomes `["a", "b"]`; `tag=` becomes `[""]`.
Empty arrays are unsupported because they have no unambiguous query encoding.

### URL construction

The reference builder takes an HTTP(S) **origin** from the test environment;
credentials, a non-root base path, query, and fragment are forbidden.
The contract MUST NOT silently select a test environment. The page path is
root-relative. Path inputs MUST include all declared parameters and no others.
Search inputs MUST contain typed values and no undeclared keys. Undefined
search entries are absent. Defaults are resolved and serialized into the URL.
Each array element produces another occurrence of the key. Boolean and number
serialization uses JavaScript `String` semantics; query encoding uses WHATWG
form encoding. Input contracts and parameter objects MUST NOT be mutated.

## 6. Component object

| Field | Required | Meaning |
| --- | --- | --- |
| `description` | Yes | Nonblank description for the tester. |
| `role` | Yes | Expected ARIA role of the matched DOM element, from the versioned role enum. |
| `locator` | Yes | Structured Locator object. |
| `components` | No | Map of inline/reference child components within this scope. |
| `expect` | No | Expected element properties and cardinality. |
| `meta` | No | QA metadata. |

The role vocabulary is frozen in
[`$defs.component.properties.role.enum`](schemas/opensite-0.1.0.schema.json).
It is an OpenSite vocabulary of ARIA roles, independent of any testing library.
Abstract/custom roles and component implementation names such as `PrimaryButton`
are invalid. The role describes the actual element's accessible semantics,
including implicit native roles; it does not require an explicit HTML `role`
attribute. The schema's role list is authoritative for this specification version.

A component is an addressable element or collection. Its locator describes the
address and its role describes the expected semantics of that same element.
A consumer verifies these independently or together using its chosen tools.
The contract MUST NOT modify the DOM or require a particular automation API.
A locator MAY match several elements. Consumers MUST NOT silently select the
first result as part of interpreting the contract. Tests choose collection
filtering, assertions, and ambiguity handling explicitly. Children are scoped
to their parents. Existence, visibility, enabled state, cardinality, content,
and behavior require application-level tests.

## 7. Locator object

`by` is required. Strategy-specific fields are exclusive; unknown fields fail.
These are declarative addresses, not calls into an automation framework.

| `by` | Other fields | Meaning |
| --- | --- | --- |
| `role` | Optional nonblank `name` and boolean `exact`. No `value`. | Component's accessible role, optionally narrowed by accessible name. |
| `testId` | Required nonblank string `value`. | Exact equality of the element's `data-testid` attribute. |
| `label` | Required nonblank string `value`; optional `exact`. | Text content of an associated native HTML label, explicit or wrapping. An element matches if at least one associated label matches. |
| `placeholder` | Required nonblank string `value`; optional `exact`. | Element's `placeholder` attribute. |
| `text` | Required nonblank string `value`; optional `exact`. | Element's text content, including descendants. |
| `altText` | Required nonblank string `value`; optional `exact`. | Element's `alt` attribute. |
| `title` | Required nonblank string `value`; optional `exact`. | Element's `title` attribute. |
| `css` | Required nonblank string `value`. | Standard CSS selector within the parent scope. |

For role-name and textual strategies, `exact` defaults to **true**: whole-string,
case-sensitive equality. `exact: false` means case-sensitive literal substring
matching. Names and values are strings, never executable code or regex.
An omitted role-locator `name` constrains only the role. Accessible names use
web accessibility semantics as described by the Accessible Name and Description
Computation specification; labels use native HTML label association.

For accessible names, label text, and element text content, consumers MUST
normalize both the comparison value and the candidate text: trim leading and
trailing ASCII whitespace and collapse each internal run to a single U+0020
space. ASCII whitespace here means U+0009, U+000A, U+000C, U+000D, and U+0020.
Attribute-based textual strategies (`placeholder`, `altText`, `title`) preserve
whitespace. A missing attribute does not match. Test IDs always use exact
attribute equality and have no implicit configuration from a test framework.

The locator describes addressing without visibility, actionability, waiting,
or assertion policy. Those policies belong to the consuming test suite.
The role remains expected metadata for non-role strategies; the contract does
not prescribe a particular algorithm for verifying it.

CSS syntax is checked by consuming tools at use time; the static linter emits
a `LOCATOR_CSS` warning. Standard CSS selectors are supported. Framework-specific
selector engines, XPath, and executable expressions are outside this draft.

Nested component IDs use dots, e.g. `filters.inStock`. Consumers interpret each
child address within its parent's matched elements. Cross-frame transitions
are outside this version and remain a consumer concern. No browser, test runner,
or automation library is required to author or validate the contract.

## 8. Expectations and text matchers

An Expectation object MAY appear as `component.expect` or in an expectation map
keyed by dotted component IDs. Every map key MUST address a component on that
page after local references are expanded.

| Field | Meaning |
| --- | --- |
| `presence` | `required` (default when an expectation exists), `optional`, or `absent`. |
| `visibility` | `visible`, `hidden`, or `any`. Visibility is independent of DOM presence. |
| `count` | Object with `min` and/or `max`, nonnegative safe integers. |
| `enabled`, `readOnly`, `required`, `selected`, `expanded` | Optional expected booleans, applicable to the element's semantics. |
| `checked` | Optional boolean or `mixed`. |
| `accessibleName`, `text` | Optional Matcher objects. |
| `value` | Optional exact typed scalar, null, or array of strings. |

Unspecified properties impose no check. A component without any expectation
has no implicit presence assertion. Required presence means at least one match;
optional presence allows zero matches, checking other properties only for matches
that exist. Count bounds constrain the collection; element properties apply to
every matched element. Minimum MUST NOT exceed maximum. Required presence with
`count.max: 0` is invalid. Absent presence permits only a count allowing zero;
other element-property checks are invalid because no element exists.

A Matcher has exactly one standard field: `equals`, `contains`, or `pattern`,
each a string. Empty strings are permitted. Equality and substring matching are
case-sensitive and preserve supplied text exactly. `pattern` is an unanchored
ECMAScript regex in Unicode mode, without other flags. Invalid regexes are errors.
These are typed expectation data, distinct from locator matching. Consumers
collect the actual accessible name/text from the application; the linter does
not evaluate the DOM or decide whether a property is appropriate for a role.

## 9. Page states and composition

`states` is a nonempty map of state IDs to objects requiring `description`.
A state MAY contain `expect`, `snackbars` (notification property overrides), and
`meta`. `defaultState`, when present, MUST name a declared state. No conventional
state names are reserved; `loading`, `ready`, `empty`, and `error` are examples.
State preparation remains in the consuming test suite.

Effective component expectations are composed in this order:

1. Expectations on expanded inline/reusable components.
2. The page's `expect` map.
3. The selected state's `expect` map, using `defaultState` if no state is supplied.
4. The selected page variant's `expect` map, if a variant is supplied.

Each overlay replaces explicitly supplied expectation properties; unsupplied
properties are retained. Nested values such as matchers and `count` are replaced
as whole values. Explicit `presence: absent` clears inherited element checks.
If an earlier layer already expects absence, an overlay without `presence`
does not make the component present or add checks to it. Explicit non-absent
presence restores it without inheriting the earlier absence-only count.
This lets localization change text without requiring elements absent in a state.
Parent absence implies no matched descendants; consumers must not demand child
element properties while their parent is absent.

## 10. Interface variants

Root `variants` is a nonempty map of variant IDs to objects requiring
`description`. Optional fields are `locale` (nonblank descriptive locale string),
`viewport` (positive safe integer `width` and `height` in CSS pixels), `flags`
(map of names to booleans), and `meta`. No feature flag is executed or interpolated.

A page's optional nonempty `variants` map is a whitelist of supported root
variant IDs. Each entry MAY contain `description`, `expect`, `snackbars`, and
`meta`. An omitted page map allows all declared root variants. A supplied
variant MUST exist globally and be supported by the page. There is no automatic
viewport detection, locale selection, feature activation, or Cartesian expansion.

## 11. Access policy

`access.authentication` is `required`, `optional` (default), or `forbidden`
(guest-only page). `roles`, when present, is a nonempty unique list of application
role names; authentication MUST then be `required`. Any listed role grants
access. Application roles are independent of component ARIA roles.

`onUnauthenticated` and `onForbidden` are optional Outcome objects.
Unauthenticated denial is meaningful only for `authentication: required`.
A forbidden outcome requires a role restriction or guest-only access. On a
guest-only page it describes the outcome for an authenticated visitor. The
contract does not contain users, credentials, login scripts, or permission code.

## 12. Forms, fields, errors, and cases

`forms` maps IDs to Form objects requiring `description`, `component` (a page
component address), and a nonempty `fields` map. Optional `submit` is a component
address. Optional `validation` is `submit`, `blur`, or `input`, describing when
the application validates; omission makes no timing claim. `meta` is supported.

Each field requires `description`, `component`, and `type`. It uses the Search
Parameter types, typed literal constraints, `required`, `deprecated`, `default`,
`examples`, and `enum`, without query decoding. Form arrays MAY be empty;
their implicit `minItems` is zero, and an explicit `minItems: 0` is permitted.
`required: true` still rejects an empty submitted array. Optional `inputType` is the HTML
control-kind hint enumerated in the schema; it does not add validation. For
example, `inputType: email` alone does not define an email validation algorithm.
Use explicit constraints or application cases to describe accepted values.

Field `errors` maps IDs to named errors requiring `description`, with optional
`component` and Matcher `message`. Error IDs are local to a field. Form, field,
submit, and error component addresses MUST exist on the page. Native HTML form
association can place controls outside the form subtree; containment is not
required for these addresses.

`cases` maps IDs to declarations requiring `description`, `values` (an object),
and `valid` (boolean). Optional `errors` is a nonempty list of `{field, error}`
references. Valid cases MUST NOT expect errors. `meta` is supported.
`validation` selects `constraints` (default) or `application`:

- Constraint cases MUST agree with typed field validation. Unknown fields fail.
  Missing optional fields are omitted. Missing required fields, required empty
  strings, and required empty arrays fail. Whitespace is not trimmed. Nulls and
  incorrectly typed values fail the declared field type. Boolean false is a
  present value; use `enum: [true]` when a checkbox must be checked.
- Application cases describe server/business validation beyond field constraints.
  The linter verifies their shape and references, without claiming to execute
  the application. It does not infer a named error from a regex or a failed bound.

Field defaults describe initial UI values and MUST NOT fill absent submitted
fields. The reference `checkFormValues` implements constraint validation only,
returns cloned typed values only on success, and omits values from diagnostics.
Cases SHOULD use synthetic, non-sensitive data. Fixture provisioning and live
submission are outside the reference validator.

## 13. Outcomes and transitions

An Outcome contains at least one of these fields:

| Field | Meaning |
| --- | --- |
| `page` | Destination page ID; omission means the declaring page. |
| `state` | Expected state on the destination page. |
| `snackbars` | Nonempty unique list of notifications expected to appear on that page. |
| `expect` | Component expectation overrides on that page, applied after its context layers. |
| `fieldErrors` | Nonempty list of `{form, field, error}` references on that page. |
| `statusCode` | Expected HTTP status integer from 100 through 599, when relevant. |
| `url` | Expected `path` and/or raw `search`; specifies the resulting URL, including normalization. |

All destination references MUST resolve in the destination page's namespace.
Expected URL paths are site-root-relative; raw search comparison removes an
optional leading `?` and otherwise preserves order and encoding. Omitted URL
parts impose no check. Expected query strings are not required to be valid
inputs: an error page can preserve the malformed query. Outcomes describe
observations and MUST NOT themselves navigate or change application state.

`transitions` maps IDs to objects requiring `description`, `trigger`, and
`outcome`. Optional `fromStates` and `variants` are nonempty unique lists of
declared source states and supported variant IDs. `preconditions` is a nonempty
list of human-readable conditions, never executable expressions. `meta` is supported.

Trigger forms are exclusive:

| `event` | Required target fields |
| --- | --- |
| `activate`, `change` | `component` address. Activation is independent of pointer/keyboard mechanics. |
| `submit` | `form` ID. |
| `key` | `component` address and nonblank `key` string. |
| `snackbarAction` | `snackbar` ID and its `action` ID. |
| `snackbarDismiss` | `snackbar` ID and supported `reason`: `close`, `escape`, or `timeout`. |

Conditions distinguish several possible outcomes of the same trigger. These are
named testable contracts, not a deterministic executable state machine. Consumers
arrange prerequisites and perform actions using their chosen tools.

## 14. Invalid URL cases

`invalidURLs` maps IDs to objects requiring `description`, `input`, and `outcome`;
`meta` is optional. Input contains `path` and/or `search`. Path is a literal
site-root-relative path; search is a raw query string, optionally prefixed by `?`.
Neither is passed through the valid-input URL builder. These intentionally allow
bad parameter values, unknown query keys, and fixture IDs for missing resources.
The contract does not automatically execute negative cases. Expected outcomes
can describe an error state, redirect, normalized URL, or HTTP status.

## 15. Local reusable components

`definitions.components` maps IDs to component entries. An entry is either a
full Component object or a reference object containing `$ref` and optional
extensions, with no sibling standard overrides. References MUST have the form
`#/definitions/components/ID`. External references are forbidden.

References MAY occur in page components, nested components, and definitions.
Unknown definitions and cycles, including cycles through nested children, are
errors. An instantiated component inherits its definition's complete subtree,
role, locator, expectations, and metadata. Page/state/variant expectation maps
can override instance expectations. An instance's dotted address uses its local
map key. The reference implementation limits expansion to 10000 entries across
a validation operation and 64 expansion levels, including reused instances.
Expansion MUST NOT mutate source definitions or share mutable output instances.

## 16. QA metadata

`meta` MAY appear at the root and on pages, components, states, variants, forms,
form cases, transitions, negative URL cases, and snackbars, as defined by the
schema. It contains optional `tags` (nonempty unique strings), `criticality`
(`low`, `normal`, `high`, `critical`), `owner` (nonblank string), and `requirements`
(nonempty unique strings containing requirement IDs or links).
These annotations are not authorization, assertions, or executable selection
rules. Requirements are not fetched. Consumers choose how to build test groups
or coverage reports from them. Metadata has no implicit cross-level inheritance;
referenced component definitions retain their own metadata on each instance.

## 17. Snackbars / transient notifications

Page `snackbars` maps stable notification IDs to Snackbar objects. The term
includes toasts and transient status messages; it introduces no new ARIA role.
Each declaration requires `description`, `component`, `variant` (`neutral`,
`info`, `success`, `warning`, `error`), and Matcher `message`.

| Optional field | Meaning |
| --- | --- |
| `messageComponent` | Address of the exact message element, avoiding text from action buttons. Otherwise compare message against the notification component's text. |
| `announcement` | Expected live announcement policy: `polite`, `assertive`, or `off`. No policy is asserted when omitted. |
| `focus` | `preserve` (default) or `move`, describing expected focus behavior when appearing. |
| `actions` | Map of action IDs to `{description, component, dismisses?}`. `dismisses` defaults to false. |
| `dismiss` | Optional `close` component address and `escape` boolean, default false. |
| `lifetime` | `mode: persistent` (default), or `mode: timed` with positive `durationMs`. |
| `checks` | Optional positive `appearWithinMs` and `dismissWithinMs` observation budgets. |
| `meta` | QA metadata. |

The notification component MUST exist. Message, action, and close component
addresses MUST exist and be within that component's subtree (or the root itself).
Their normal component roles, locators, and expectations apply. Matching several
notifications is described using the notification component's count expectation;
the declaration does not choose the first match.

A timed lifetime MAY declare nonnegative `toleranceMs` (default zero, not greater
than duration), `pauseOnHover`, and `pauseOnFocus` (booleans defaulting to false).
Its countdown starts on first visible appearance. Declared pauses suspend the
countdown. Excluding paused periods, observed automatic disappearance is expected
within duration ± tolerance. Persistent notifications have no automatic expiry
assertion and MUST NOT contain duration or pause fields.

`appearWithinMs` is measured from the triggering event to first visible
appearance. `dismissWithinMs` is measured from a dismissal signal (declared
close, Escape, a dismissing action, or timer expiration) to the notification
becoming non-visible; DOM removal is not required. Omitted budgets impose no
implicit timeout. A timeout dismissal trigger requires a timed lifetime; close
and Escape triggers require the corresponding declared mechanism. Timeout
support is checked across every source state/variant allowed by the transition.
Snackbar action
triggers MUST name an existing action. Action results use regular transitions.

An Outcome's `snackbars` list names notifications expected to appear. Their
message, variant, announcement, focus, controls, and timing declarations provide
observations for consumers. These declarations alone do not display a snackbar
or install a runtime checker. States MAY separately specify initial absence and
post-action presence through component expectations.

State and page-variant `snackbars` maps MAY override existing notifications'
`message`, `variant`, `announcement`, `focus`, `lifetime`, and `checks`. They
MUST name an existing notification. Merge base, state, then variant by supplied
properties; lifetime, checks, and matchers replace whole values. Stable component
and action IDs remain unchanged. This supports localized notification messages.

Root/page `snackbarPolicy` contains optional `placement` (enumerated logical
positions in the schema), positive `maxVisible`, `order` (`oldestFirst` or
`newestFirst`), and `overflow` (`queue` or `replaceOldest`). Page properties
override individual root properties. Omitted properties impose no policy.
Stacking, timing, and accessibility require application-level verification.

## 18. Validation and diagnostics

Conformance requires serialization validation, document JSON Schema validation,
and semantic checks: valid page paths, distinct literal paths, exact placeholder
declarations, valid regexes, consistent bounds and expectations, constrained
literals/form cases, bounded acyclic local references, and all cross-section IDs.
Generic JSON Schema validation alone is insufficient.

The reference library reports `valid` and `diagnostics`. Each diagnostic contains
`severity` (`error` or `warning`), `code`, JSON Pointer `path`, and `message`.
Schema failures also expose `keyword` and, where relevant, `property`.
Warnings do not invalidate a contract unless the consumer chooses strict warnings.
Diagnostics omit query values and source excerpts, but expose declared names
and paths. Contracts SHOULD NOT contain credentials or private test data.

The CLI supports `lint` and `check-search`, text/JSON reports, and
`--warnings-as-errors`. Exit codes: 0 valid, 1 invalid document/query, 2 usage or
file error. File/usage errors take precedence over validation failures. The
CLI and library MUST NOT fetch a schema from `$schema` or navigate to a site.

## 19. Versioning and compatibility

Consumers MUST pin the exact specification version. Unsupported versions MUST
be rejected. Published versioned specification/schema artifacts MUST remain
immutable. During 0.x, breaking specification changes increment the minor
version. After 1.0, breaking changes increment the major version. Additive
features increment the minor version and compatible corrections increment patch.

Application contract changes are separate: removing/renaming a page or component
ID, changing a path, role, locator or scope, adding a required query parameter,
or tightening parameter constraints can break QA consumers. Such changes SHOULD
be reviewed by QA and reflected in `info.version`, even when `opensite` stays fixed.

## 20. Conformance artifacts and references

The schema, paired examples, Node.js reference implementation, TypeScript
declarations, and framework-independent unit/CLI tests accompany this
specification. Discrepancies MUST be resolved before release.

- [WAI-ARIA roles](https://www.w3.org/TR/wai-aria-1.3/#role_definitions) (web semantics reference; the OpenSite schema pins its own vocabulary)
- [Accessible Name and Description Computation](https://www.w3.org/TR/accname/)
- [CSS selectors](https://www.w3.org/TR/selectors-4/)
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)
- [YAML 1.2.2](https://yaml.org/spec/1.2.2/)
- [WHATWG URL standard](https://url.spec.whatwg.org/)
