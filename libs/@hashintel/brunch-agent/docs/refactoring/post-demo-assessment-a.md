**The evidence points less to “AI SDK beats Flue” than to Brunch doing substantially more work while exposing a narrower, less direct net-building path.** It is not currently a feature-equivalent replacement for Stock with better elicitation added.

I oriented in Brunch’s charter, domain model, and current mission, then traced both production paths and inspected retained run data. No files changed or new inference runs performed.

## 1. Brunch cannot do everything Stock can

Stock exposes the full Petrinaut mutation catalogue, including:

- Scenarios and their initial states.
- Metrics.
- Subnets and component instances.
- `createExperiment`, wired to actual experiment execution.

Brunch’s **product** construction interface is restricted to root-net places, transitions, arcs, types, parameters, and differential equations. Its batch schema has no scenario, metric, subnet, component-instance, or experiment operations.

That is a material difference if “build a correct net” means “give me something I can run, measure, and compare,” rather than just constructing its topology and functions. Better reasoning cannot overcome missing tools.

Sources: [Stock tool catalogue](libs/@hashintel/petrinaut-core/src/ai.ts:186), [Brunch operation union](libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/mutate-petrinet.ts:197), [experiment execution](libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel.tsx:963).

## 2. Stock has a stronger automatic repair loop

Stock’s panel automatically appends fresh compiler diagnostics after completed tool-result batches. The next model invocation sees those diagnostics whether or not the model remembers to request them.

The same panel wrapper surrounds Brunch, **but Brunch’s transport does not forward that appended diagnostic message**. Its continuation delivers only the correlated client-tool results. Brunch must separately call `read_petrinaut_diagnostics` to receive the feedback.

Brunch’s instructions require that call, so it is not missing validation entirely. But these are different guarantees:

> **Stock:** the environment supplies feedback automatically.  
> **Brunch:** the model must remember and spend another step requesting it.

The wrapper can even compute diagnostics on the Brunch path without delivering them to the model.

This is a concrete architectural reason to expect differences in repair reliability and latency. It still does not mean Stock proves semantic correctness: compiler diagnostics are not proof that the process model behaves as intended.

Sources: [automatic diagnostic injection](libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel/create-diagnostics-aware-ai-transport.ts:48), [Brunch continuation payload](libs/@hashintel/brunch-agent/packages/transport-aisdk/src/index.ts:497).

## 3. Brunch makes record-keeping part of the construction critical path

For a typical supported fragment, Brunch prescribes:

```text
Write the complete next Ledger, including evidence
→ read the current net
→ generate a mutation batch with revision/hash/passage references
→ request diagnostics
→ request layout when applicable
→ read the net again
→ continue the conversation
```

Skill activation and resource reads add startup work. Browser calls must be separate from server calls and from each other; this is enforced before admission, not merely suggested. Mutation batches can contain multiple operations, but the surrounding steps remain serial.

Stock still needs reads, mutations, validation, and sometimes layout. **It does not require a second, evidence-linked document to be regenerated before construction.**

The retained Inventory run, `run-1L2zTl`, makes the cost visible:

| Model steps issuing…   | Median step duration | Total step duration |
| ---------------------- | -------------------: | ------------------: |
| `mutate_workpiece`     |     **55.6 seconds** |    **24.3 minutes** |
| `mutate_petrinaut_net` |     **12.4 seconds** |     **4.8 minutes** |

These are model-generation steps, not database-write times. They include reasoning and argument generation. This is not a matched Stock benchmark, but it shows where a substantial portion of Brunch’s time actually went.

Sources: [construction sequence](libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/skills/sdcpn-modelling/references/pn-construction.md:33), [enforced serialization](apps/brunch-agent/src/provider-admission.ts:289), local-only [native chronology](apps/brunch-agent/.data-wipe-me/persona-runs/run-1L2zTl/dev-brunch-server.log).

## 4. That extra document is also a lossy intermediary

Brunch explicitly says:

> “Construct only from the current workpiece.”

That makes Ledger quality a dependency of net quality. The translation is effectively:

```text
User account → generated Ledger → generated net
```

The additional representation is intended to preserve meaning and provenance. In the retained runs, it did not reliably do so:

- In `run-SB5pgx`, the accepted Ledger dropped from **14,972 to 7,316 characters**, and later to **1,725**.
- After preservation guards were added, `run-1L2zTl` still contracted from **33,876 to 10,487 characters** through individually permitted revisions.
- Evidence relations also declined. The implementation automatically carries a relation only when its unique passage remains at the **same character offsets**. Inserting text above it requires explicit redeclaration.

Meanwhile, old whole-Ledger arguments remain in model context by default. Superseded net reads are compacted, but superseded Ledger-argument projection is still disabled. The later run reached roughly **255,000 cached-context tokens**.

So the current mechanism can accumulate historical versions while losing detail and linkage from the authoritative version that construction is told to consume.

**That is a plausible quality regression mechanism, not just a speed tax.** It does not prove which particular user net was wrong, but the intermediate-account degradation is observed, not hypothetical.

Sources: [construction authority](libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/skills/sdcpn-modelling/SKILL.md:38), [evidence carriage](libs/@hashintel/brunch-agent/packages/core/src/update-workpiece.ts:125), [context projection default](apps/brunch-agent/src/agents/chat-agent/context-projection.ts:459), [current mission disposition](libs/@hashintel/brunch-agent/MISSION.md:13).

## 5. The two assistants optimize for different outcomes

Stock is not simply “build immediately.” Its prompt also requires interviewing—but briefly:

- Ask 2–4 related questions per turn.
- Skip interviewing for concrete, scoped edits.
- Explicitly offer sensible defaults.
- Proceed with defaults when the person signals “you decide.”

Brunch instead emphasizes:

- One answerable thread at a time.
- Frequent evidence-linked settlement.
- Construction only from recorded operational meaning.
- No unsupported operational defaults merely because they are labelled assumptions.
- A construction disposition after each meaning-bearing settlement.

Those are defensible choices for faithful elicitation of a real operation. They are less well matched to someone who wants a useful demonstration, a quick approximation, or a small edit.

**Some perceived superiority may therefore be task-policy fit:** Stock is more willing to finish a useful model under underspecification. That does not automatically make its assumptions more faithful to reality.

Sources: [Stock interview and default policy](libs/@hashintel/petrinaut-core/src/ai.ts:294), [Brunch settlement policy](libs/@hashintel/brunch-agent/packages/core/src/prompts/SYSTEM.md:33).

## 6. Stock gets a more direct construction briefing

Stock’s always-present prompt contains:

- Exact executable-code contracts.
- Input/output token shapes.
- Rates versus predicates.
- Parameter access rules.
- Scenario and metric conventions.
- A complete worked SDCPN example.

Brunch replaces that prompt with universal elicitation guidance, process-modelling guidance, construction resources, and protocol instructions.

**Brunch is not devoid of this knowledge:** it inherits rich canonical schema descriptions and can read the same Petrinaut documentation. But it does not receive Stock’s integrated cheatsheet and complete example in the same way. Its explicit instructional emphasis is much more heavily weighted toward evidence management and orchestration.

That is a credible contributor to construction quality, though its magnitude would require an ablation rather than more source reading.

Source: [Stock construction prompt](libs/@hashintel/petrinaut-core/src/ai.ts:284).

## One important confound: model selection

The defaults are not equal:

- **Stock:** `gpt-5.5-2026-04-23`, medium reasoning, unless overridden.
- **Ordinary Brunch server:** `claude-haiku-4-5`, unless overridden.
- **The retained Inventory run above:** `openai/gpt-5.6-sol`, medium reasoning.

I did not verify the affected users’ deployed overrides, so I would not attribute their experience to the default model. But any comparison needs to establish the actual model and reasoning settings first.

Sources: [Stock configuration](apps/petrinaut-website/api/chat.ts:195), [Brunch configuration](apps/brunch-agent/src/chat-model.ts:27).

## Bottom line

**Stock currently has a more complete construction interface, more automatic corrective feedback, and a shorter route from the user’s request to a usable artifact. Brunch adds expensive provenance work without yet preserving that provenance reliably at scale.**

Its hashes, citations, and revision checks establish mechanical linkage—not whether a net correctly implements the cited meaning. More enforcement around provenance does not itself produce better Petri nets.

I would **not** conclude that Flue is the wrong runtime. Before changing runtimes, the discriminating comparison is: same model, same task, equivalent construction tools and diagnostic feedback—then measure what the Ledger protocol adds or subtracts. The current comparison changes all of those variables together.
