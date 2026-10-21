# Locator descriptors

A component's `role` and `locator` are framework-independent data. The role
describes expected accessible semantics; the locator describes how to address
the element. The reference tools validate these descriptors without finding
DOM elements, launching a browser, or executing a test.

## Choose an address

| Strategy | Meaning | Example |
| --- | --- | --- |
| `role` | Accessible role from the component, optionally narrowed by accessible name. | `{ by: role, name: Save }` |
| `testId` | Exact `data-testid` attribute value. | `{ by: testId, value: profile-save }` |
| `label` | Text of an associated HTML label. | `{ by: label, value: Email }` |
| `placeholder` | `placeholder` attribute value. | `{ by: placeholder, value: Search products }` |
| `text` | Element text content. | `{ by: text, value: Order complete }` |
| `altText` | `alt` attribute value. | `{ by: altText, value: Company logo }` |
| `title` | `title` attribute value. | `{ by: title, value: More information }` |
| `css` | Standard CSS selector, interpreted within the component's parent scope. | `{ by: css, value: '[data-qa="save"]' }` |

The role vocabulary is frozen in the versioned JSON Schema. It is not loaded
from a testing library. Native HTML elements can have implicit roles; a contract
does not require an explicit `role` attribute and does not change the DOM.

`exact` is available for role-name and textual strategies, defaulting to `true`.
Matching is case-sensitive. `exact: false` means a literal substring. Accessible
names, label text, and text content use the whitespace normalization described
in [SPEC.md](../SPEC.md#7-locator-object). Attribute values are compared as stored.
Test IDs always require exact attribute equality. For a different test attribute,
use a CSS attribute selector rather than relying on a tool's global settings.

## Describe scope

```yaml
components:
  editor:
    description: Profile editor dialog.
    role: dialog
    locator: { by: role, name: Edit profile }
    components:
      save:
        description: Save changes in this dialog.
        role: button
        locator: { by: testId, value: profile-save }
```

The address `editor.save` refers to the save component inside the editor.
Identifier paths describe the contract hierarchy; they are not expressions or
method calls. A consumer resolves each parent scope before its child address.
The expected role applies to the addressed element even when another strategy
such as `testId` supplies its address. How a test finds and verifies that element
is a consumer implementation choice.

A locator can describe several elements. It makes no automatic first-element
selection. Separate `expect`, state, transition, and notification declarations
describe expected properties and behavior. Tests implement observations,
actionability, waiting, and assertion execution using their own tools.

CSS syntax and actual DOM matches require application-level verification.
The linter warns about CSS because it can depend on markup structure. Standard
CSS is portable; selector-engine extensions and executable locator expressions
are outside this version.
