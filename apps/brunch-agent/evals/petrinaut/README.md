# Petrinaut agent evaluations

The Petrinaut agent has two evaluation surfaces: browser-visible persona runs through the real local Petrinaut panel, and a one-turn probe that sends a case's opening message to the built app without a browser. Both read the case directories under `cases/`, each holding two inputs:

- `situation-pack.md` — the person's background: who they are, what they know about their work and how they talk;
- `opening-message.md` — the person's first message to Brunch.

The maintained cases are:

- `data-centre-thermal-operations`
- `industrial-gas-vmi`
- `inventory-purchasing`
- `pharma-cold-chain`
- `semiconductor-fab-operations`
- `service-reservoir-overflow`
- `support-desk-staffing`
- `truck-fleet-maintenance`
- `vestera-scheduling`

## Persona runs

From the repository root:

```sh
yarn brunch:persona --list-cases
yarn brunch:persona --case inventory-purchasing --agent claude
```

The launcher creates a fresh local database, starts its own Brunch and Petrinaut services, opens a headed Chrome window, and starts a coding agent (Claude Code, Codex, Cursor Agent, Pi or any custom command) to play the persona through a browser bridge. Brunch itself chooses and executes the ordinary product tools. Run output stays under `apps/brunch-agent/.data-wipe-me/persona-runs/` and is not committed.

Use unused `BRUNCH_CHAT_PORT` and `BRUNCH_PANEL_PORT` values rather than interrupting another session’s services. Start recording before confirming the launcher’s readiness prompt. Ctrl-C stops launcher-owned resources.

Live-provider runs incur cost and require an explicit model and spend authorization. Synthetic tests do not. Keep credentials, private situation packs, browser profiles, and run output out of tracked artifacts.

The detailed operator guide is [`persona/README.md`](./persona/README.md).

## One-turn probe

[`turn-probe.ts`](./turn-probe.ts) runs one real Brunch turn through the built app, with no browser and no persona. It sends a case's opening message in a conversation with no document binding, so only the guidance and Ledger tools are mounted, then prints the turn's duration, tool calls, reply and recorded Ledger. Use it to measure turn time and Ledger capture for one message without the cost of a persona run.

```sh
turbo run build --filter '@apps/brunch-agent'
yarn workspace @apps/brunch-agent probe:turn pharma-cold-chain openai/gpt-6.1-sol low
```

The arguments are the case, the `provider/id` model and the thinking level; they default to `pharma-cold-chain` and Brunch's default model and thinking level. The provider's API key must be in the environment. Each probe spends one live model turn and requires the same model and spend authorization as a persona run. Output stays under `apps/brunch-agent/.data-wipe-me/turn-probes/` and is not committed. A probe is an observation of one turn, not a quality grade.

## Run packets

Every persona run and probe ends by writing `evidence/packet.json` and `evidence/packet.md` into its directory. The packet accounts for each exchange's time, which is what a change to turn time is judged by:

- active time (wall time less approval waits) and time until the first reply text;
- model steps, each split into time before first output (hidden reasoning), tool-argument streaming and reply text, and tool phases;
- each step's shape (its tool categories, in order);
- the tool mix, skill activations, Ledger commit sizes, net growth, tokens and cost;
- what it could not account for: exchanges that never settled (left out of the time sums), steps cut off mid-message or mid-tools, and stored records it could not read.

[`run-packet.ts`](./run-packet.ts) reads `conversation.db` and, when present, the server log's `flue.submission chronology` lines, `run.json` and the evidence files. Without the server log, which the probe does not keep, argument-streaming times are unknown. To write or refresh packets for retained runs, which spends no model turns:

```sh
yarn workspace @apps/brunch-agent packet:run .data-wipe-me/persona-runs/run-XXXXXX [...]
```

## Scoring

Each maintained case also keeps a `key.md` for scoring a run by hand: what the person believes, where the pack puts that under pressure, and what Brunch must tell apart, respect or keep conditional. Neither runner loads it. There are no graders or campaign protocols. A persona run or a probe is an observation, not an automatic quality grade or acceptance decision.
