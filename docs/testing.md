# QA workflow

OpenSite is a shared inventory of a website's testable surface. Keep the
contract with the application code; review changes with QA alongside UI changes.
The document is useful for manual testing, test planning, and automation.

## Write a contract

1. List user-facing pages under stable IDs in `pages`. Give each a title and path.
2. Declare dynamic URL segments in `pathParams`, including useful patterns and
   non-sensitive examples. Obtain actual IDs from fixtures in the test suite.
3. Document the query parameters the page accepts. Pick types and constraints
   from application behavior. Defaults in the contract describe expected
   application defaults; the validator cannot prove the application uses them.
4. List components QA needs to address. Record a purpose, actual accessible
   role, and a stable locator for each. Use nested components when search must
   be scoped, e.g. a Save button inside a specific dialog.
5. Declare states and component expectations, access rules, forms/errors/cases,
   transitions, invalid URL outcomes, supported variants, and notification behavior.
   Reuse common components through `definitions.components` and annotate QA ownership.
6. Run `opensite lint opensite.yaml --warnings-as-errors` in the application CI.
7. Add browser tests that navigate, prepare state, exercise components, and
   assert results using the same contract.

Prefer role locators with accessible names, or deliberate test IDs for elements
whose user-visible copy changes frequently. Use browser developer tools or
your chosen inspection tool to check both the address and the actual role.
A role is an accessibility semantic. Recording a role does not add it to the DOM.
CSS locators are supported but warn; use them only with a documented reason.

## Manual test planning

The [example](../examples/opensite.yaml) describes four pages:

| Page ID | Address | Testing entry points |
| --- | --- | --- |
| `catalog` | `/catalog` | Search, pagination, sorting, stock and tag filters. |
| `product` | `/products/{productId}` | Fixture-driven product selection and add-to-cart button. |
| `login` | `/login` | A scoped sign-in form with email, code, and submit controls. |
| `account` | `/account` | Access policy, profile form/errors, state and locale variants, Undo/Retry notifications. |

Use parameter constraints to plan boundary cases. For `page` with `minimum: 1`,
check page 1 and a later page; separately test how the application handles 0,
missing/empty values, non-integers, repeated scalar keys, and unsupported keys.
`check-search` validates the **declared valid inputs**. It deliberately rejects
malformed inputs; application negative tests can still navigate to them directly.

```sh
node bin/opensite.js check-search examples/opensite.yaml \
  --page catalog --search 'q=coffee&page=2&inStock=true&tag=sale&tag=coffee'
```

Declare expected negative-input behavior in `invalidURLs`: the example covers
negative pagination, unknown query keys, canonicalization of page zero, and a
missing product. Consumers navigate to the raw inputs and compare observed
states, destination pages, URLs, and statuses with the declared outcomes.

For forms, `cases` describe values and expected validity/errors. Constraint
cases are checked statically; application cases require the actual application.
State `expect` maps describe required/absent components and enabled/selected
properties. `resolvePage` composes references and context; tests still arrange
the selected state and variant themselves. See [snackbar checks](snackbars.md)
for appearance, message, actions, persistence, dismissal, focus, and timing.

## Ownership and changes

Stable IDs let tests address purpose instead of copying selectors. When markup
changes but semantics remain the same, update a locator once in the contract.
When a role, page path, component scope, or valid parameter range changes,
review the affected tests and increment `info.version` as appropriate.

Choose the target origin in test configuration. Never store login credentials,
session tokens, production customer data, or test secrets in the contract.
Prepare fixture data and authentication separately. The format has no seeding
endpoint, fixture execution, environment provisioning, or arbitrary code hooks.

## What each check proves

| Check | Evidence |
| --- | --- |
| JSON Schema | Shape, required fields, allowed roles and locator strategies, type-specific fields. |
| `lint` | Schema, routes, patterns, expectations, constrained literals/form cases, references, outcomes, and snackbar declarations. |
| `check-search` | A query decodes to values allowed by a particular page contract. |
| `buildPageURL` | Typed inputs can produce a correctly encoded URL for an explicit origin. |
| `resolvePage`, `getComponent` | Context-specific data and expanded components, with no browser execution. |
| `checkFormValues` | Typed submitted values satisfy the declared field constraints. |
| Application browser tests | The tested application state satisfies the assertions you wrote. |

Contract lint does not prove a deployed application matches the contract.
Choose a test framework and implement the contract's locator semantics in the
consuming test suite. Conditional UI needs appropriate state preparation;
components are not assumed to be visible on every visit.
