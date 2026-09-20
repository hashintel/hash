# FE-1650 — Expose Brunch and Voice in Labs

## Status

Implementation-complete and verified on
`kostandin/fe-1650-brunch-voice-settings` for
[FE-1650](https://linear.app/hash/issue/FE-1650/let-demo-users-select-brunch-and-opt-into-voice-from-settings);
the branch is at the pre-PR review gate with no known implementation blocker.

The demo now exposes the existing Stock-or-Brunch choice and a separate,
default-off Voice preference in **Settings → Labs**. Both choices persist, the
complete assistant configurations and provider histories remain isolated, and
effective Voice remains gated on Brunch selection, the user preference, and
server-reported capability.

This cut adds exactly two website-owned controls through one optional
host-content slot in Petrinaut. It does not redesign assistant switching,
active-turn lifecycle, provider history, Voice transport, server policy, or
Petrinaut's settings model. No paid Voice or model run was authorized or used.

The next authorized action is owner pre-PR review and PR preparation. The real
demo route has already shown both controls, persistence across reload, and
Voice exposure only when all three gates permit it; the retained capture is a
local candidate, not deployed-environment acceptance.

### Owner decisions

- **2026-09-20 — Kostandin, location:** place the controls under **Settings → Labs**.
- **2026-09-20 — Kostandin, choices:** expose both **Use Brunch** and a separate, default-off **Enable Voice** preference.
- **2026-09-20 — Kostandin, reduced scope:** use one optional React-node Labs slot rather than a typed settings DSL; keep the current immediate switching lifecycle and add no busy-state API; add only minimal tests for the new behavior.
- **Inherited product decisions:** Stock remains the ordinary-route fallback, explicit stored assistant choices remain authoritative without migration, the command-palette switch remains available, and worked-model routes continue to force Brunch.

## Imperative

A demo user can discover and select Brunch, then explicitly opt into Voice, from **Settings → Labs** without knowing the command-palette shortcut. Stock remains the default and Voice remains off until the user enables it.

Why now: changing the ordinary-route default to Stock made Voice undiscoverable to anyone who does not know the hidden **Use Brunch** command.

## Throughline

```text
user opens Settings → Labs
→ Petrinaut renders one optional host-provided React node
→ website renders Use Brunch and Enable Voice controls
→ Use Brunch updates the existing petrinaut-website:assistant preference
→ the existing brunchSelected branch switches the complete assistant configuration
→ Enable Voice updates a separate browser-local, default-off preference
→ effective Voice requires Brunch selected + Voice enabled + server capability
→ Petrinaut receives renderVoiceMode only when all three are true
→ reload restores both preferences without starting microphone capture or playback
```

The ordinary route uses both controls. A worked-model route still forces Brunch and cannot change assistant provider; its Voice preference may still be changed. Missing Brunch configuration and unavailable Voice remain visibly unavailable rather than implying a working service.

## Proof

The narrow proof obligations and their current dispositions are:

- **Optional host surface — PASS.** The focused Petrinaut settings suite shows
  supplied Labs content, confirms an unsupplied host remains unchanged, and
  exercises first/last enabled host-control entry, vertical traversal,
  built-in/host boundary crossing, and ArrowLeft return:
  `NODE_OPTIONS=--no-experimental-webstorage yarn workspace
  @hashintel/petrinaut test:unit --run
  src/ui/views/Editor/editor-view/user-settings.test.tsx` — 26/26 passed. The
  Node option disables Node 26's experimental web-storage global so jsdom owns
  `localStorage`; without it, the environment fails at `localStorage.clear()`
  before test behavior runs.
- **Website behavior — PASS.** `NODE_OPTIONS=--no-experimental-webstorage yarn
  workspace @apps/petrinaut-website test:unit --run
  src/main/app/local-storage-demo/assistant-labs-settings.test.tsx
  src/main/app/local-storage-demo/local-storage-demo-app.test.tsx` — 47/47
  passed. Coverage includes assistant-preference loading, missing Brunch
  configuration, forced Brunch, Voice-preference loading, Voice-capability
  loading, invalid Voice storage reading off, both rendered Labs controls
  writing their own keys, remount restoration, default-off Voice, and the
  three-part effective Voice gate.
- **Visible path — LOCAL CANDIDATE COMPLETE.** The retained, ignored capture at
  `.superpowers/sdd/task-2-ui-capture/` contains five inspected 1440×900 states:
  `01-stock-selected.png` (Stock; Voice disabled),
  `02-brunch-voice-unavailable.png` (Brunch; unavailable),
  `03-brunch-voice-available.png` (available and off),
  `04-voice-enabled.png` (enabled), and `05-reload-persisted.png` (both choices
  restored). Every artifact named by `manifest.json` exists and its exact byte
  count matches the manifest, including the five screenshots, final
  screenshot, JSON/text logs, HAR, and video. `errors.json` is empty;
  `audio-tap-status.json` reports zero input/output sources and chunks. The HAR
  contains only `localhost`, blocked `127.0.0.1:9`, and null origins; media- or
  provider-named matches are local Vite source-module GETs, not provider or
  media-session requests. No paid provider was contacted and no media session
  started. Limitation: the optional 262,144-byte VP8 video encoder fell behind;
  the manifest recorded 3.56 seconds, but the prematurely ended file no longer
  yields a format duration to `ffprobe`. The five screenshots are the visual
  proof.
- **Package integrity — PASS.** `npx turbo run build lint:tsc lint:eslint
  --filter '@hashintel/petrinaut' --filter '@apps/petrinaut-website'` completed
  18/18 tasks; `yarn workspace @local/petrinaut-arch-docs lint:arch-docs`
  passed with 84 layers, 440 edges, 924 files, 85 generated pages, and 44
  authored pages; `yarn lint:format` passed across 6,108 files.

Existing tests remain the owners for transport routing, history isolation, conversation identity, bundle-route behavior, Voice lifecycle, and server policy. This mission does not duplicate them merely because the same selection state gains another control.

## Constraints

- Petrinaut gains only an optional `settingsLabs?: ReactNode`-style host slot and remains unaware of Stock, Brunch, Voice policy, website storage keys, or deployment configuration.
- The website owns the controls, labels, persistence, capability interpretation, and callbacks.
- Keep `petrinaut-website:assistant` and its current parsing/default behavior unchanged. Add one separate Voice preference whose missing or invalid value is off.
- Keep the command-palette provider switch and current immediate switching behavior. Do not add an assistant busy callback, idle-only transition policy, implicit durable stop, or lifecycle coordinator.
- Preserve the current complete-configuration switch. Do not splice histories, move Brunch messages into the Stock store, recreate the current net, or make Voice available under Stock.
- A Voice preference is not capability or authorization. Existing server checks remain authoritative; enabling the preference must not start media or bypass disclosure.
- Worked-model routes continue to force Brunch and preserve the ordinary-route assistant preference.
- Do not revive `brunchDemoMode`, build a generic settings schema, move website policy into `UserSettings`, or clean up unrelated assistant/Voice code.
- Synthetic tests must not reach paid providers.
- Update the affected user/configuration docs and add the required `@hashintel/petrinaut` patch changeset for the public slot.

## Fog-line

- The exact host-control spacing and copy should follow the existing Labs visual language, but this cut does not create a reusable host-settings component library.
- Immediate provider switching during active work is inherited behavior. An observed orphaned-work or media-cleanup failure may justify a separate lifecycle cut; this mission does not anticipate one with a new API.
- Deployed Brunch and Voice environment values are operational capability, not acceptance evidence for the browser-local controls.

## Stop or reorient

- Stop if the implementation requires Petrinaut to understand Brunch or website policy.
- Stop if enabling Voice can bypass server capability, disclosure, or a user gesture.
- Stop if the new control path switches anything other than the existing assistant preference, loses the current net, or mixes provider histories.
- Reassess before replacing the React-node slot with a generalized settings DSL or exposing new assistant lifecycle state.
- Do not broaden focused regression coverage into duplicate routing, history, lifecycle, or special-route suites.

## Deferred

- Idle-only provider changes, durable stop-before-switch, and any public busy-state API.
- A generalized typed settings-extension system or reusable host settings components.
- Stock-history semantics inside worked-model routes.
- Cross-tab live synchronization of the two preferences.
- Cleanup or replacement of the dormant `brunchDemoMode` setting and its unreachable picker.
