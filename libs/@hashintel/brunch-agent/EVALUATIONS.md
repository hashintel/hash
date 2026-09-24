# Persona testing

Brunch retains one evaluation surface: browser-visible persona runs through the real local Petrinaut panel. The runner discovers maintained case directories containing exactly the two inputs it needs:

- `opening-message.md` — the public first utterance;
- `situation-pack.md` — private background for the simulated person.

The maintained cases are:

- `data-centre-thermal-operations`
- `industrial-gas-vmi`
- `inventory-purchasing`
- `pharma-cold-chain`
- `semiconductor-fab-operations`
- `truck-fleet-maintenance`
- `vestera-scheduling`

From the repository root:

```sh
yarn brunch:persona --list-cases
yarn brunch:persona --case inventory-purchasing
```

The launcher creates a fresh local database, starts its own Brunch and Petrinaut services, opens a headed Chrome window, and runs a private Pi persona. Brunch itself chooses and executes the ordinary product tools. Run output stays under `apps/brunch-agent/.data-wipe-me/persona-runs/` and is not committed.

Use unused `BRUNCH_CHAT_PORT` and `BRUNCH_PANEL_PORT` values rather than interrupting another session’s services. Start recording before confirming the launcher’s readiness prompt. Ctrl-C stops launcher-owned resources.

Live-provider runs incur cost and require an explicit model and spend authorization. Synthetic tests do not. Keep credentials, private situation packs, browser profiles, and run output out of tracked artifacts.

The detailed operator guide is [`apps/brunch-agent/.pi/extensions/brunch-persona-testing/README.md`](../../../apps/brunch-agent/.pi/extensions/brunch-persona-testing/README.md). The synthetic browser-path check is:

```sh
yarn workspace @apps/brunch-agent test:persona
```

There are no maintained answer keys, graders, campaign protocols, or headless case fixtures. A persona run is an observation, not an automatic quality grade or acceptance decision.
