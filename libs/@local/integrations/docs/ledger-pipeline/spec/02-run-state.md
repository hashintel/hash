# Milestone 2: Run state

### What it adds

The two status files and the call that creates a run. `run.json` records what a run works with and what each stage finished. `current.json` records which run of the integration is active and which was the last to complete. Start creates a run and refuses while another run is active.

```text
start ──► runs/{run}/run.json   created with the `input` and `batch` parts
      ──► current.json          the run becomes the active run
every stage reads run.json first and writes it last (milestone 3)
```

**Decided in:** `../plan.md`, step 3, "What a run leaves in the bucket" and "How a stage writes"; step 4, "Start". The types are in `contracts.md`.

### Size

|           | Lines   |                                                             |
| --------- | ------- | ----------------------------------------------------------- |
| Moved     | 0       |                                                             |
| Adapted   | 0       |                                                             |
| New       | 425     | the record types, reading and saving, `current.json`, Start |
| **Total** | **425** | **reused 0%**                                               |

The plan estimated 440. The `failure` part lost a field, and the record types came out shorter.

Nothing is ported, because labs and `engine` keep no file of this shape. Labs records a run as events in its journal. The closest existing code is named in the source table.

### Interface

In `contracts.md`: `RunId`, `RunRecord` with its parts, `Current`, the three key functions, `load`, `save`, `current::complete`, and `start`.

```rust
pub struct StartInput {
    pub web: WebId,
    pub actor: ActorEntityUuid,
    pub definition: Box<str>,              // the YAML as written (D4). Start reads the connector from it.
    pub namespace: Option<Box<str>>,       // None: the connector's id
    pub submitted_at: OffsetDateTime,
}

pub enum StartError {
    InvalidDefinition,                     // the YAML is not a valid definition
    RunActive { active: RunId },           // another run of the integration is active
    Changed,                               // another start claimed the integration at the same time
    Storage,
}
```

### Pseudo code

**`run/record.rs`: the types of `run.json`** (new, 135 lines)

The structs of `contracts.md` with `Serialize` and `Deserialize`, and the enum `Stage`, which the `failure` part names. Field names are written in snake case and an absent part is written as `null`, as in the example of `review.md`. `BatchLimits::default()` is 128 writes and 1,500,000 bytes.

**`run/mod.rs`: reading and saving** (new, 110 lines)

```rust
pub(crate) async fn load(storage, run) -> Result<(RunRecord, CasVersion), Report<RunError>> {
    let Some((bytes, version)) = storage.read_versioned(&run_file(run)).await? else {
        return Err(RunError::NotFound);
    };
    Ok((serde_json::from_slice(&bytes)?, version))
}

pub(crate) async fn save(storage, record, expected: Option<&CasVersion>) -> Result<(), Report<RunError>> {
    let bytes = serde_json::to_vec_pretty(record)?;
    if !storage.replace_if(&run_file(record.input.run), expected, bytes).await? {
        return Err(RunError::Changed);        // someone else wrote the file since it was loaded
    }
    Ok(())
}
```

`save` with `None` creates the file and fails if it exists. `RunError` has five cases: `NotFound` (no `run.json` for this id), `Unreadable` (the file is not a run record), `Changed` (someone else wrote the file), `NotActive` (`current.json` names another run) and `Storage`.

**`run/current.rs`: `current.json`** (new, 90 lines)

```rust
pub(crate) async fn read(storage) -> Result<(Current, Option<CasVersion>), Report<RunError>>;
// A missing file is an integration without runs: both fields empty, no version.

pub(crate) async fn activate(storage, current: Current, version: Option<&CasVersion>, run) -> Result<bool, _> {
    storage.replace_if("current.json", version, json(Current { active: Some(run), ..current })).await
}

pub(crate) async fn complete(storage, run) -> Result<(), Report<RunError>> {
    let (current, version) = read(storage).await?;
    if current.active != Some(run) {
        // already completed by an earlier attempt: nothing to do. Anything else is an error.
        return if current.last_completed == Some(run) { Ok(()) } else { Err(RunError::NotActive) };
    }
    let written = storage.replace_if("current.json", version.as_ref(),
        json(Current { active: None, last_completed: Some(run) })).await?;
    if written { Ok(()) } else { Err(RunError::Changed) }
}
```

**`run/start.rs`: Start** (new, 90 lines)

```rust
pub async fn start(storage, input: StartInput) -> Result<RunId, Report<StartError>> {
    let definition = Definition::from_yaml(&input.definition)?;   // refuse before a run exists (D9)
    // the record's `connector` is the definition's, its `namespace` the given one or the connector's id
    let (current, version) = current::read(storage).await?;
    if let Some(active) = current.active {
        return Err(StartError::RunActive { active });
    }
    let run = RunId::new();                               // a new UUID
    run::save(storage, &RunRecord::new(run, input), None).await?;       // input and batch parts
    if !current::activate(storage, current, version.as_ref(), run).await? {
        return Err(StartError::Changed);                  // another start was faster
    }
    Ok(run)
}
```

If Start stops between its two writes, a `run.json` exists for a run that never became active. It blocks nothing, and the next Start creates a new run.

### Source table

| New file         | Item                                          | Closest existing code                                                                           | Kind | Lines |
| ---------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---- | ----- |
| `run/record.rs`  | `RunRecord` and its parts                     | the example JSON in `review.md`; labs `orchestrator/projection_types.rs:59-77`, `RunProjection` | new  | 135   |
| `run/mod.rs`     | `RunId`, the keys, `load`, `save`, `RunError` | labs `orchestrator/record_io.rs` reads and writes typed records                                 | new  | 110   |
| `run/current.rs` | `Current`, `read`, `activate`, `complete`     | labs admission pointer, `orchestrator/submission.rs:324-379`                                    | new  | 90    |
| `run/start.rs`   | `start`, `StartInput`, `StartError`           | the same; BE-1136 describes `submit` validating the definition first                            | new  | 90    |

### Tests

All new, on the in-memory store. Five tests:

1. `run.json` is written and read back unchanged, and its JSON matches a snapshot. This pins the file's shape.
2. Start creates `run.json` with the `input` and `batch` parts and names the run as active.
3. Start is refused while a run is active, and for a definition that does not parse. Two cases of one test.
4. Of two starts that read the same `current.json`, the second is refused and changes nothing.
5. `complete` names the run as the last completed run, and a second call does nothing.

Not tested on their own: the key functions and `load` and `save`. Tests 1 and 2 go through them.

### What was stripped

Compared with labs: the journal events for a run, the fold that builds a view from them, the request binding, the run locator and the run policy records. `../plan.md`, step 2, lists them. Labs retries a lost claim of the integration up to eight times (`MAX_ADMISSION_ATTEMPTS`). Start does not retry: a start that loses is refused.

### Open points

- **Chosen:** Start creates the run id, a new UUID, and returns it.
- **Chosen:** `StartError` tells a caller apart why a start was refused: the definition does not parse, a run is active, another start was faster, or storage failed. The plan only says "refuse".
- **Fact:** `ConnectorId` and `SourceName` have no way to be written as JSON (`definition/src/name.rs:93-112`). The record holds the connector's id and the tables' names as text, and the `definition` crate stays as it is.
- **Decided:** D9, Start checks the definition.
- **Chosen:** the submission time is passed in as data. Labs does the same, and nothing in the crate reads a clock.
- **Chosen:** the batch limits are constants in `record.rs` and are written into every `run.json`. Start takes no limits.
- **Chosen:** `run.json` is written as indented JSON, so that it can be read in the bucket without a tool.
- **Decided:** D7. A run that failed for good keeps its integration blocked, and the first version adds nothing for it.
