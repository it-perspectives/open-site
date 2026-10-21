# Snackbars and notification checks

OpenSite describes snackbars, toasts, and transient notifications under
`page.snackbars`. Each stable notification ID references ordinary components
with their own roles and locators. The complete example is in
[opensite.yaml](../examples/opensite.yaml), page `account`.

## Notification declaration

This is a fragment inside a Page object:

```yaml
snackbars:
  saved:
    description: Successful profile update.
    component: saveNotice
    variant: success
    message: { equals: Profile saved }
    messageComponent: saveNotice.message
    announcement: polite
    focus: preserve
    actions:
      undo:
        description: Undo the profile change.
        component: saveNotice.action
        dismisses: true
    dismiss: { close: saveNotice.close, escape: true }
    lifetime:
      mode: timed
      durationMs: 8000
      toleranceMs: 500
      pauseOnHover: true
      pauseOnFocus: true
    checks: { appearWithinMs: 2000, dismissWithinMs: 500 }
```

All addresses must exist. Message, action, and close addresses must belong to
the notification subtree. `messageComponent` excludes Undo and Close text from
message comparison. A message Matcher uses `equals`, `contains`, or `pattern`.
Use `lifetime: { mode: persistent }` for a notification with no automatic expiry.
A missing lifetime also means persistent. Escape and manual closing are declared
explicitly; no framework's dismissal behavior is assumed.

## Appearance and action outcomes

```yaml
transitions:
  save:
    description: Submit a valid profile successfully.
    trigger: { event: submit, form: profile }
    fromStates: [ready]
    preconditions: [The update service accepts the submitted values.]
    outcome: { state: saved, snackbars: [saved] }
  undo:
    description: Undo the profile change.
    trigger: { event: snackbarAction, snackbar: saved, action: undo }
    fromStates: [saved]
    outcome: { state: ready }
  expire:
    description: Notification disappears automatically.
    trigger: { event: snackbarDismiss, snackbar: saved, reason: timeout }
    fromStates: [saved]
    outcome: { state: ready }
```

In the full example, `ready` expects notification absence; `saved` expects one
visible notification. Close and Escape have separate transitions. A persistent
failure notification offers Retry. The linter checks every reference and rejects
unsupported dismissal mechanisms, including timeout transitions in source
states/variants where the effective lifetime is persistent.

## Resolve descriptors

```js
import { readFileSync } from 'node:fs';
import { parseSpec, resolvePage, getComponent } from '@it-perspectives/opensite';

const spec = parseSpec(readFileSync('examples/opensite.yaml', 'utf8'));
const context = { state: 'saved', variant: 'russian' };
const page = resolvePage(spec, 'account', context);
const notice = page.snackbars.saved;
const target = getComponent(spec, 'account', notice.component, context);
const message = getComponent(spec, 'account', notice.messageComponent, context);
```

`notice.message` is localized. `target` and `message` are plain descriptors with
effective expectations. No helper finds DOM elements or runs actions/timers.
State and variant overrides may change message, variant, announcement, focus,
lifetime, and timing checks. Component and action IDs remain stable.

## Checks for the consuming suite

1. Arrange the profile fixture and successful update response, then submit.
2. Observe visible appearance within 2000 ms and exactly one notification.
3. Compare role, variant, localized message, announcement policy, and focus.
4. Check Undo and Close using their component descriptors. Exercise Undo,
   Close, and Escape separately, restoring the fixture between checks.
5. Observe non-visibility within 500 ms after a dismissal signal. DOM removal
   is not required.
6. Check automatic disappearance around 8000 ms with 500 ms tolerance, excluding
   declared hover/focus pauses. Persistent notifications have no automatic expiry
   assertion; the suite chooses a finite observation window.
7. Check the resulting page state and other declared outcomes.

Appearance time starts at the triggering event; lifetime starts at first visible
appearance; dismissal time starts at its signal. Root/page `snackbarPolicy`
describes placement, maximum visible count, ordering, and overflow. Check stacking
by triggering multiple notifications. Unspecified policy properties impose no check.

W3C describes status messages as changes communicated without moving focus and
distinguishes non-interrupting alerts from alert dialogs. See
[status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
and the [alert pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alert/).
Contract declarations alone do not prove accessibility or application conformance.
