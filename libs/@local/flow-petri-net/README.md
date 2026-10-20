# @local/flow-petri-net

Compiles a `FlowDefinition` into the Petri net (SDCPN) that Petrinaut renders and, eventually, a net executor runs.

## Where this fits

A flow has one definition, its `FlowDefinition`. Everything else is derived from it.

```mermaid
flowchart LR
  actions["Action definitions"]
  builder["defineFlow builder<br/>(in-repo flows)"]
  flowMode["Petrinaut flow mode<br/>(TODO FE-1912)"]
  stored["Flow Definition entity"]
  definition["FlowDefinition"]
  validate["validateFlowDefinition"]
  net["SDCPN flow net"]
  engine["Temporal flow engine,<br/>startFlow API"]
  petrinaut["Petrinaut view<br/>(TODO FE-1897)"]
  executor["Petri net executor<br/>(TODO FE-1904)"]

  actions --> builder
  actions --> validate
  builder --> definition
  flowMode -->|edit intents| definition
  stored --> definition
  definition --- validate
  definition --> engine
  definition -->|compileFlowDefinition| net
  net --> petrinaut
  net --> executor
```

- **`FlowDefinition`** (`@local/hash-isomorphic-utils/flows/types`) is the source of truth for what a flow does: its inputs, steps, connections and outputs. It's plain JSON, validated by `validateFlowDefinition`. Every connection is checked by `canConnect`, the one compatibility rule, which the builder's types mirror at compile time. Definitions say nothing about how a flow is started: triggers are separate.
- **The current Temporal engine** runs definitions directly, until the net executor replaces it (TODO FE-1904).
- **The flow net** is compiled from a definition, deterministically and in one direction. Definitions stay the source: the net's design will keep changing, which only means recompiling.

## Entry point

The package exports one module, `@local/flow-petri-net/compile-flow-definition`, with `compileFlowDefinition(flowDefinition): Promise<SDCPN>`. It's async because it lays the net out with Petrinaut's ELK layout.

Its implementation is in `src/compile-flow-definition/`:

- `compile-action-step.ts` and `compile-for-each-step.ts` add each kind of step to the root net.
- `generate-action-subnet.ts` makes the subnet an action's steps are instances of.
- `shared/` holds what those share: the step index (`flow-steps.ts`), the net being built (`net-builder.ts`), where each value is held (`value-places.ts`), ids (`action-subnet-ids.ts`, `step-places.ts`), colours, kernels, layout, and helpers for making places, transitions and arcs.

## What a compiled net looks like

Places are circles and transitions are boxes. Dashed arrows are read arcs, which don't consume the token. Places, transitions and instances are labelled by the keys their ids are made from (see **Ids** below).

```mermaid
flowchart LR
  runRequests(("RunRequests")) --> startRun["t.startRun"]
  startRun --> inputPlace(("input.‹id›"))
  startRun --> pending(("Pending: ‹step›"))

  pending --> startStep["t.startStep.‹step›"]
  inputPlace -. read .-> startStep
  upstreamCopy(("value copy<br/>for this step")) -- consume --> startStep

  subgraph subnet ["subnet.‹action› (one per action, shared by its steps)"]
    direction LR
    inPorts(("in.‹input›<br/>ports")) --> startAttempt["startAttempt"]
    startAttempt --> inProgress(("InProgress"))
    inProgress --> succeedAttempt["succeedAttempt"]
    succeedAttempt --> outPorts(("out.‹output›<br/>ports"))
    inProgress --> failAttempt["failAttempt"]
    failAttempt --> failed(("Failed"))
    failed --> retryAttempt["retryAttempt"]
    retryAttempt --> inProgress
    failed --> giveUp["giveUp"]
    giveUp --> gaveUp(("GaveUp<br/>port"))
  end

  startStep -- every input port --> inPorts
  outPorts -. read .-> reader["a reader's t.startStep"]
  outPorts -- "one consumer, no readers" --> consumer["its t.startStep"]
  outPorts -- "otherwise" --> copy["t.copyOutput.‹step›.‹output›"]
  copy --> shared(("output.‹step›.‹output›<br/>shared by readers"))
  copy --> copies(("output…~‹consumer›<br/>a copy per consumer"))
  gaveUp --> recordStepFailure["t.recordStepFailure.‹step›"]
  recordStepFailure --> failedStepRuns(("FailedStepRuns"))
```

A for-each step adds an iterator and an accumulator around its nested steps:

```mermaid
flowchart LR
  arrayPlace(("array value")) -. read .-> startForEach["t.startForEach.‹forEach›"]
  forEachPending(("Pending: ‹forEach›")) --> startForEach
  startForEach --> iterator(("Iterator‹kind›<br/>ref, item_count, next"))
  iterator --> startItem["t.startItem<br/>while next #lt; item_count"]
  startItem --> iterator
  startItem --> item(("Item"))
  startItem --> nestedPending(("Pending: ‹nested step›…"))
  iterator --> startCollecting["t.startCollecting<br/>when next = item_count"]
  startCollecting --> accumulator(("Accumulator<br/>expected, done"))
  item -. read .-> nested["nested steps<br/>(as above)"]
  nestedPending --> nested
  nested --> collected(("collected output<br/>its port, or a copy for collecting"))
  collected --> collectItem["t.collectItem"]
  accumulator --> collectItem
  collectItem --> accumulator
  accumulator --> finishCollecting["t.finishCollecting<br/>when done = expected"]
  finishCollecting --> forEachOutput(("output.‹forEach›.‹as›"))
```

- **Runs.** `t.startRun` takes a run request and seeds a token into each flow input's place, and a `Pending` token for each top-level step.
- **Ids.** The compiler builds the net from readable keys, such as `p.input.prompt`, `t.startStep.<step>` and `i.<step>` for a step's instance. Step ids can be any string without `~`, so instances have keys of their own, and a copy's key separates its value from its consumer with `~` (`p.output.<step>.<output>~<consumer>`). Every id in the compiled net is the Petrinaut id of its key (`toPetrinautId`, a UUIDv5), which is what Petrinaut converts a non-UUID id to when it loads a net. So loading a compiled net changes nothing, and anything that needs an id works it out from the key. The endpoints in the root's metadata are converted too.
- **Steps.** Each action step is a component instance of its action's subnet, keyed `i.<step>`. Its `t.startStep.<step>` fires once per run (or per item), because it consumes the step's `Pending` token. It reads or consumes each connected value according to the connection's `access`, which defaults to read, matching today's semantics. It feeds every input port of the action:
  - a connected value;
  - a constant, recorded in the instance's `metadata.constants`;
  - or, for an optional input with nothing connected and no default, a token marked absent (`present: false`).
- **Ports.** Actions have a port per input and per output. Keys inside a subnet are prefixed with the action id (`p.<action>.in.<input>`, `t.<action>.startAttempt`), because Petrinaut keys compiled kernels by unscoped id.
- **Outputs.** A transition is only added where one token has to become several. A step's output stays in its instance's output port:
  - steps that only read it read the port, with read arcs;
  - a single step that consumes it, with no readers, takes it from the port;
  - otherwise a `t.copyOutput.<step>.<output>` transition puts it in a place shared by the readers (and by a flow output), and in a copy for each step that consumes it, so consumers never race for a token.

  So a step's output has no fixed place: it's the port of the step's instance or a copy place, and anything that needs to find a value looks it up. An action with no outputs leaves its `done` token in its port.

- **Flow inputs and collected outputs.** `t.startRun` and a for-each step's `t.finishCollecting` put a value straight into a place shared by its readers and a copy for each step that consumes it.
- **For-each steps.** A for-each step iterates over its array:
  - `t.startForEach.<id>` turns the array into an iterator token, `{ref, item_count, next}`.
  - `t.startItem.<id>` emits one item token, plus a `Pending` token for each nested step, per firing.
  - `t.startCollecting.<id>` hands over to an accumulator, `{expected, done}`.
  - `t.collectItem.<id>` consumes each item's collected output and counts it.
  - `t.finishCollecting.<id>` emits the collected output once `done` equals `expected`.

- **Tokens.** Tokens carry references to payloads, not the payloads themselves. Every colour has `run_id`, and `item_path`: empty outside any `for-each`, the item's index inside one (`"2"`), and the indices of the enclosing items, outermost first, inside nested ones (`"2.0"`).
- **Colours.** Each payload kind, and an array of it, is a colour with `ref` and `present`, and `item_count` for an array. (Not `length`, which Petrinaut's kernel language reserves.) Each kind has its own display colour.
  - An input or output whose kind another input decides (`kindFrom`) is typed by the kind a step connects, so an action gets a subnet per combination of kinds its steps use.
  - Any other input accepting several kinds has a `oneOf` colour, such as `Text | WebPage`, with a `kind` element saying which kind the token carries.
  - A `for-each` step's iterator is typed by the kind of array it walks (`Iterator<Text>`).
- **Metadata.** The root carries `metadata.flowOutputs`: for each flow output, the arc endpoint it's found at, a place of the root net or an instance's output port. Every transition added for a step names it in `metadata.stepId`, so a run's view can map steps to the net and back; a for-each step's `t.collectItem` also carries its `collect`. A step's `t.startStep` carries `inputSources`: for each of the action's inputs, the arc endpoint its value comes from with the connection's `access`, `wrap` and `whenMissing`, or that it's a constant, takes its default, or is absent. The arcs alone don't say which value feeds which input. Each transition carries `metadata.role` (see `TransitionRole` in `compile-flow-definition/shared/net-elements.ts`), which tells the executor how to treat it:
  - `succeedAttempt` and `failAttempt` fire when an action's activity completes;
  - every other transition fires as soon as it's enabled, including `recordStepFailure`, which moves a step that gave up into `FailedStepRuns` and so fails the run.

## Limitations

- **No guards.** Kernels only carry `run_id` and `item_path` forward and give every other attribute a default (`compile-flow-definition/shared/kernels.ts`). There are no guards yet: no correlation across inputs, and no iterator or accumulator conditions. So a compiled net builds in Petrinaut but doesn't simulate meaningfully. The executor is meant to interpret roles instead (TODO FE-1904).
- **A `for-each` step's item tokens stay after their item finishes.** `t.startItem` puts one token per item in the step's item place, and the steps inside the `for-each` read it, so every one of them can see the item. Nothing consumes it. Everything else is consumed: `Pending` tokens, copies of values, and values a step takes with `consume`.
- **Skip-if-missing** (`whenMissing: "skip"`), and the absent-token semantics behind it, are left to the executor.
