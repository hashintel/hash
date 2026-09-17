# Draft — Stock-assistant escape hatch in Petrinaut's settings dialog

> Draft cluster only. Not execution authority. Do not implement until this cluster is re-evaluated and cut into `MISSION.md`.

## Purpose and provenance

On 2026-09-16 Lu relayed a stakeholder request: a visible switch that returns the Petrinaut website's chat transport from the Brunch assistant to the old stock ai-assistant, and asked whether the deferred single-document-repository work had made that hard. The assessment below was verified at the real boundary that day; Lu accepted its recommendations and then held implementation ("wait, don't implement yet"). This file is the one planning home for the reasoning and accepted design. The spine's [host-choice fork](../../MISSION.next.md#host-choice-and-continuity) is the pointer.

Like the [substrate-coupling assessment](../reference/architecture/substrate-coupling-flue-and-pi.md), this is deliberately not yet shaped as the full draft template; that happens at cut time. It is a small, self-contained engineering change with a visible product advance (a settings-dialog control a stakeholder can flip without the palette), so it can be cut directly on its own issue and branch.

## Cold-start reads

- [`assistant-selection.ts`](../../../../../apps/petrinaut-website/src/main/app/local-storage-demo/assistant-selection.ts): the existing host-local preference. Stores `"brunch" | "stock"` under localStorage key `petrinaut-website:assistant`; the unset `VITE_PETRINAUT_DEFAULT_ASSISTANT` fallback is `"stock"`, while Brunch-focused launches may request `"brunch"`. Explicit stored choices win. The module exports `useAssistantSelection({ enabled })` and `isBrunchSelected(isBrunchConfigured, selection)`.
- [`local-storage-demo-app.tsx`](../../../../../apps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app.tsx): the palette command `demo.assistant.switch` in `DemoCommands`, hidden when Brunch is unconfigured or the remote worked-model route is selected; `useAssistantSelection({ enabled: !remoteRouteSelected })`; `brunchSelected` deriving every Brunch-versus-stock branch (transport, messages, Flue client, tools, Ledger tab, Voice, `canClearMessages`); the `createHandle(document)` / `setActiveHandle` effects that own the open net.
- [`local-storage-demo-app.test.tsx`](../../../../../apps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app.test.tsx): existing selection tests (`-t "assistant selection|stored stock|restores the stored assistant"`, 7 passing on 2026-09-16).
- [`api/chat.ts`](../../../../../apps/petrinaut-website/api/chat.ts): the stock backend, still deployed through the vite `apiModules` plugin and `vercel.json`; needs `OPENAI_API_KEY` on the website deployment.
- [`user-settings-dialog.tsx`](../../../petrinaut/src/ui/views/Editor/editor-view/user-settings/user-settings-dialog.tsx): Petrinaut's settings dialog, sections `general | viewport | simulation | labs`, local `SettingsGroup` and `SettingToggle` components, data from `UserSettingsContext`, `SDCPNContext.extensions` and `PetrinautOptimizationContext` only. Opened from the floating button in [`viewport-controls.tsx`](../../../petrinaut/src/ui/views/SDCPN/components/viewport-controls.tsx) through the `user-settings` navigation overlay in `editor-view.tsx`.
- [`petrinaut.tsx`](../../../petrinaut/src/ui/petrinaut.tsx): `PetrinautProps`, including `aiAssistant?: PetrinautAiAssistant`.
- [`create-new-net-menu.ts`](../../../petrinaut/src/ui/views/Editor/editor-view/create-new-net-menu.ts) and [`user-settings-context.ts`](../../../petrinaut/src/react/state/user-settings-context.ts): `shouldShowBrunchCreateNew({ brunchDemoMode, hasAiAssistant })` and the `brunchDemoMode` setting it reads.
- [`visual-settings.md`](../../../petrinaut/docs/visual-settings.md#labs): the Petrinaut doc that must describe any new Labs control.
- Standing constraint in [worked-example distribution and breadth](worked-example-distribution-and-breadth.md): a generic host extension must not become Brunch-specific coupling inside Petrinaut.

## Assessment

The switch already exists functionally; Stock is now the ordinary-document default and Brunch is the command-palette alternate. Only the requested Labs surface is missing. Nothing in the document-repository work entangled it.

- `DocumentRepository` and `use-document-controller.ts` choose the local or remote repository purely by route and say nothing about assistants. Assistant selection is host-local state that the app derives before the document loads.
- `brunchSelected === false` already yields a complete stock experience: `DefaultChatTransport` to `/api/chat`, per-net `useLocalStorageAiMessages`, `flueClientPromise === null`, no Brunch tools, no Ledger `additionalTab`, no Voice. Code path verified; the production `OPENAI_API_KEY` presence was not verified.
- Petrinaut's dialog has no host-extension slot, so the Labs surface needs a new optional Petrinaut prop threaded to the dialog (or a small context). `SettingsGroup` and `SettingToggle` are reusable as-is.
- `UserSettings.brunchDemoMode` is a dead precedent: no caller of `setBrunchDemoMode` exists outside the provider and one test stub, so the "Build with Brunch" File → New picker is reachable only by hand-editing localStorage `petrinaut:user-settings`. Its `hasAiAssistant` input is true under stock too, so hiding the picker under stock needs a host-declared signal.
- Mid-conversation switching inside a remote worked-model document remains deferred behind the stock-history continuity contract in the [spine](../../MISSION.next.md#host-choice-and-continuity). The Labs toggle must be disabled or hidden on that route, exactly as the palette command is today.

## Accepted recommendations (Lu, 2026-09-16)

1. **Host-supplied toggle slot rendered in Petrinaut's Labs tab.** Petrinaut gains an optional prop, roughly `labsSettings?: { title: string; toggles: readonly { id; label; description; value; onChange; disabled?; experimental? }[] }`, rendered as one `SettingsGroup`. State stays host-owned; Petrinaut never learns the words "stock" or "Brunch".
2. **Keep the palette command and Stock default.** The Labs toggle binds to the same `useAssistantSelection` state, `disabled` with an explanatory description on the remote route. An explicit stored Brunch choice remains respected; no migration rewrites existing users.
3. **No storage migration.** Moving the preference into `UserSettings` was rejected: the host mounts `UserSettingsProvider` and `CommandRegistryProvider` around `<Petrinaut>` only after the document loads while `brunchSelected` is derived earlier, and it would force a `petrinaut:user-settings` key migration.
4. **Nothing Brunch-related shows while Stock is selected.** The same host flag suppresses the "Build with Brunch" picker and any other Brunch affordance Petrinaut renders, replacing the unreachable `brunchDemoMode` gate. Prefer a prop name that is not Brunch-specific.

## Open item before cutting

Lu's one concern: switching must not lose the current net. Not yet verified whether flipping `brunchSelected` recreates `activeHandle` or drops undo state in `local-storage-demo-app.tsx`. `useProcessAgentSession({ activeHandleRef, binding, brunchSelected })` and `processAgentBinding` depend on `brunchSelected`; the handle appears keyed on `currentDocument`. Read those effects and add a host test that switches mid-session and asserts the same handle and definition survive. If the handle is recreated, the toggle must first be made handle-preserving; that is a stop condition for the cut, not an acceptable limitation.

## Obligations at implementation

- Own issue on team `FE`, project `brunch-agent`, own branch and PR; Linear writes need explicit approval; follow [`issue-writing.md`](../agents/issue-writing.md).
- Update the Labs section of Petrinaut's [`visual-settings.md`](../../../petrinaut/docs/visual-settings.md#labs) and add one `@hashintel/petrinaut` patch changeset.
- Run `lint:tsc`, `lint:eslint` and `test:unit` for `@hashintel/petrinaut` and `@apps/petrinaut-website`; visually verify the dialog with the toggle in both states and on the remote route.
- Do not touch `MISSION.md` of the live mission for this work beyond its Deferred pointer.

## Rejected alternatives

- **Preference inside Petrinaut `UserSettings`** — see recommendation 3.
- **Reviving `brunchDemoMode` as the switch** — it is Petrinaut-owned, Brunch-named state with no setter caller; it would add Brunch coupling inside Petrinaut and still not control the transport.
- **Deployment-level control only** — remains an open fork in the spine; a build-time flag does not satisfy the stakeholder request for a user-flippable switch.
