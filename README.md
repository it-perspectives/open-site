# OpenSite

An open, language-independent contract for describing a website for testing.
Serialized as YAML or JSON, OpenSite gives QA and development teams a shared
inventory of pages, URL parameters, component roles, and stable locators.

**Status:** initial 0.1.0 draft. The proposed Node.js package is
`@it-perspectives/opensite`; this checkout does not imply npm publication,
Marketplace publication, or a hosted documentation site.

[Русская версия](README.ru.md) · [Specification](SPEC.md) ·
[JSON Schema](schemas/opensite-0.1.0.schema.json) · [QA workflow](docs/testing.md) ·
[Snackbars](docs/snackbars.md)

## Contract and implementation

Like the sibling [OpenENV](https://github.com/it-perspectives/open-env) project,
OpenSite separates an independent specification from its reference tools.

| Artifact | Purpose |
| --- | --- |
| [SPEC.md](SPEC.md) | Normative fields, serialization, semantics, and compatibility rules. |
| [Versioned JSON Schema](schemas/opensite-0.1.0.schema.json) | Document validation and editor completion for JSON and YAML. |
| Node.js library and CLI | Parsing, semantic lint, query validation, and URL construction; Node.js 22+. |
| [Locator reference](docs/locators.md) | Describes component addresses independently of automation libraries. |

The contract works with any frontend framework and can be consumed by tools in
other languages. The reference validator depends on no test runner, automation
library, or browser. Consumers choose how to apply the contract in their tools.

## Example

```yaml
opensite: "0.1.0"
info:
  title: Shop website
  version: "1.0.0"
pages:
  catalog:
    title: Product catalog
    path: /catalog
    searchParams:
      q:
        description: Search phrase.
        type: string
      page:
        description: One-based result page.
        type: integer
        default: 1
        minimum: 1
    components:
      search:
        description: Catalog search field.
        role: searchbox
        locator:
          by: role
          name: Search products
      filters:
        description: Filter region.
        role: region
        locator:
          by: testId
          value: catalog-filters
        components:
          inStock:
            description: Availability filter.
            role: checkbox
            locator:
              by: label
              value: In stock
```

A document **must contain at least one page**. Each page requires `title` and
`path`; `searchParams`, `pathParams`, and `components` are optional. Every inline
component requires `description`, `role`, and `locator`. A local `$ref` reuses a
complete component definition, including children.
IDs are stable machine names; titles and descriptions explain their purpose.

Complete equivalent examples: [YAML](examples/opensite.yaml) and
[JSON](examples/opensite.json). They include catalog, product details with a
`/products/{productId}` route, repeated query parameters, sign-in, and an account
form with notifications.

## QA notation

| Declaration | What QA can describe |
| --- | --- |
| `expect` | Presence, visibility, cardinality, names, text, values, and control states. |
| `states`, `defaultState` | Loading, ready, empty, error, and application-specific states. |
| Root/page `variants` | Supported locales, viewports, feature flags, and expectation overrides. |
| `access` | Authentication, application roles, and denial outcomes. |
| `forms` | Fields, constraints, validation timing, named errors, positive and negative cases. |
| `transitions` | Framework-independent triggers, prerequisites, and expected outcomes. |
| `invalidURLs` | Negative inputs and error, redirect, or normalization outcomes. |
| `definitions.components` | Local reusable components with bounded, acyclic references. |
| `meta` | Tags, criticality, owner, and requirement references. |
| `snackbars`, `snackbarPolicy` | Messages, actions, dismissal, lifetime, timing checks, and stacking. |

The linter checks references across these declarations. Consumers prepare state,
perform actions, and verify the live application. See the [specification](SPEC.md)
and [notification guide](docs/snackbars.md).

## Run from this checkout

```sh
npm ci --ignore-scripts
npm run verify
node bin/opensite.js lint examples/opensite.yaml examples/opensite.json --warnings-as-errors
node bin/opensite.js check-search examples/opensite.yaml --page catalog --search 'q=coffee&page=2&tag=sale&tag=coffee'
```

`lint` checks the contract and cross-field rules. `check-search` also checks a
query string against one declared page. Both support `--format json` and
`--warnings-as-errors`. Exit codes: `0` success, `1` invalid contract/query, `2`
usage/file error. Neither command visits a website. Query values are omitted
from CLI reports; parameter names and diagnostic paths remain visible.

Unknown fields fail unless they are `x-*` extensions. CSS locators produce a
warning because they can depend on DOM structure. Unsupported specification
versions fail. The bundled schema is used offline; `$schema` never triggers a
network request.

## Use in tests

The imports below work in this checkout through package self-reference. After
publication, consumers can install the exact package version. For local use in
another repository, prepare and install a tarball as described in
[releases](docs/releases.md).

```js
import { readFileSync } from 'node:fs';
import { parseSpec, lintSpec, buildPageURL } from '@it-perspectives/opensite';

const contract = parseSpec(readFileSync('opensite.yaml', 'utf8'));

const checked = lintSpec(contract);
if (!checked.valid) throw new Error(JSON.stringify(checked.diagnostics));

const url = buildPageURL(contract, 'catalog', {
  baseURL: process.env.TEST_ORIGIN, // e.g. https://stage.example.invalid
  searchParams: { q: 'coffee', page: 2 },
});
```

Pass the URL to your chosen testing or inspection tool. Component descriptors
are data that consumers interpret using the [locator reference](docs/locators.md).

`role` uses a fixed vocabulary of ARIA roles. `locator.by` supports
`role`, `testId`, `label`, `placeholder`, `text`, `altText`, `title`, and `css`.
Text matching is exact by default. A component's role describes the expected
semantics of the addressed element. Nested components describe addresses within
their parent, and a component may represent a collection. Expectations describe
what to check; execution and actual observations belong to the consuming suite.

The library exports `parseSpec`, `lintSpec`, `checkSearchParams`, `buildPageURL`,
`resolvePage`, `getComponent`, `checkFormValues`, `SpecParseError`,
`SpecValidationError`, `schema`, `roles`, and
`specificationVersion`. `parseSpec` checks serialization and returns an unknown
document; validate it with `lintSpec`. `checkSearchParams` returns typed `values`
only on success. URL construction validates the contract and throws
`SpecValidationError` with structured `diagnostics` on invalid input.

Using the complete example contract:

```js
import { resolvePage, getComponent, checkFormValues } from '@it-perspectives/opensite';

const context = { state: 'saving', variant: 'russian' };
const account = resolvePage(contract, 'account', context);
const submit = getComponent(contract, 'account', 'form.submit', context);
// submit.expect retains enabled: false while localizing its accessible name.
const checkedValues = checkFormValues(contract, 'account', 'profile', {
  displayName: 'Ada', email: 'ada@example.invalid',
});
```

`resolvePage` expands references and overlays page, state, and variant expectations
without mutating the source. `getComponent` returns a plain descriptor.
`checkFormValues` checks typed submitted values and returns cloned values only on
success. It does not execute server validation or fill initial defaults.
No helper runs actions, timers, or browser checks.

## Editor completion

The YAML example already uses a relative schema association. In another
repository, vendor the versioned schema and add:

```yaml
# yaml-language-server: $schema=./schemas/opensite-0.1.0.schema.json
```

For VS Code with the YAML extension, a workspace association is also possible:

```json
{
  "yaml.schemas": {
    "./schemas/opensite-0.1.0.schema.json": ["opensite.yaml", "opensite.yml"]
  },
  "json.schemas": [
    { "fileMatch": ["opensite.json"], "url": "./schemas/opensite-0.1.0.schema.json" }
  ]
}
```

Generic schema validation checks document structure. Use the CLI as well for
path declarations, consistent bounds, patterns, and valid defaults/examples.

## Contributing and verification

Read [CONTRIBUTING.md](CONTRIBUTING.md). Change the specification, schema,
implementation, docs, and conformance tests together.

```sh
npm run verify                 # Unit/CLI tests, TypeScript compatibility, example lint
npm run release:prepare        # Verify and write versioned artifacts to dist/
node scripts/smoke-package.js  # Install and exercise the tarball in a temporary consumer
```

A valid contract documents intended UI behavior; browser tests must still prove
that the deployed site meets it. Fixture/session setup, execution of declared
actions and assertions, state preparation, visual snapshots, and accessibility audits belong to the test
suite. See [QA workflow](docs/testing.md) and [locator semantics](docs/locators.md).
