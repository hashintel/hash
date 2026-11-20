use alloc::collections::BTreeMap;

use hash_integrations_definition::Definition;
use pretty_assertions::assert_eq;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use type_system::{
    knowledge::entity::id::{EntityId, EntityUuid},
    principal::{actor::ActorEntityUuid, actor_group::WebId},
};
use uuid::Uuid;

use super::{
    RunError, RunId, StartError, StartInput,
    current::{self, Current},
    load,
    record::{
        BatchLimits, CapturePart, CapturedFile, FailedEntity, Failure, Input, PreparePart,
        RunRecord, SendPart, Stage,
    },
    run_file, save, start,
};
use crate::{Storage, storage::CasVersion};

const AVIATION: &str = include_str!("../../../definition/examples/aviation.yaml");

/// A version 4 UUID ending in `n`, as the Graph's ids are.
const fn id(n: u128) -> Uuid {
    Uuid::from_u128(0x0000_0000_0000_4000_8000_0000_0000_0000 | n)
}

const WEB: Uuid = id(1);

fn input(run: RunId) -> Input {
    Input {
        run,
        web: WebId::new(WEB),
        connector: "aviation".into(),
        actor: ActorEntityUuid::new(id(2)),
        definition: "connector: aviation\n".into(),
        id_namespace: "aviation".into(),
        submitted_at: submitted_at(),
    }
}

fn submitted_at() -> OffsetDateTime {
    OffsetDateTime::parse("2026-07-22T10:00:00Z", &Rfc3339).expect("should be an RFC 3339 time")
}

fn aviation() -> Definition {
    Definition::from_yaml(AVIATION).expect("the example should be a valid definition")
}

fn start_input(run: RunId) -> StartInput {
    StartInput {
        run,
        web: WebId::new(WEB),
        actor: ActorEntityUuid::new(id(2)),
        definition: AVIATION.into(),
        id_namespace: None,
        submitted_at: submitted_at(),
    }
}

/// The versions of `current.json` and of the run's `run.json`.
async fn versions(storage: &Storage, run: RunId) -> (Option<CasVersion>, CasVersion) {
    let (_, current) = current::read(storage)
        .await
        .expect("should read current.json");
    let (_, record) = load(storage, run).await.expect("should load run.json");
    (current, record)
}

/// A record of a run whose stages all wrote their part, and whose Send then failed for good.
fn finished(run: RunId) -> RunRecord {
    RunRecord {
        input: input(run),
        batch: BatchLimits::default(),
        capture: Some(CapturePart {
            sources: BTreeMap::from([(
                "aircraft".into(),
                CapturedFile {
                    key: format!("runs/{run}/capture/aircraft.parquet").into(),
                    size: 2140,
                    rows: 4,
                },
            )]),
        }),
        prepare: Some(PreparePart {
            rows: 4,
            issues: Some(format!("runs/{run}/issues.jsonl").into()),
            issue_count: 1,
        }),
        send: Some(SendPart {
            created: 2,
            updated: 1,
            archived: 0,
            create_existed: 0,
            update_missing: 0,
            archive_missing: 0,
            failed: vec![FailedEntity {
                batch: 0,
                index: 3,
                entity_id: EntityId {
                    web_id: WebId::new(WEB),
                    entity_uuid: EntityUuid::new(id(4)),
                    draft_id: None,
                },
                status: 400,
                message: "the entity type is not known".into(),
            }],
        }),
        failure: Some(Failure {
            stage: Stage::Send,
            code: "graph_refused".into(),
            message: "the Graph refused the batch".into(),
        }),
    }
}

#[tokio::test]
async fn run_json_round_trips() {
    let storage = Storage::memory();
    let run = RunId(id(3));
    let record = finished(run);

    save(&storage, &record, None)
        .await
        .expect("should create run.json");
    let (loaded, _) = load(&storage, run).await.expect("should load run.json");
    assert_eq!(loaded, record, "the record should read back unchanged");

    let (bytes, _) = storage
        .read_versioned(&run_file(run))
        .await
        .expect("should read run.json")
        .expect("run.json should exist");
    insta::assert_snapshot!(String::from_utf8(bytes).expect("run.json should be UTF-8"));
}

#[tokio::test]
async fn activate_refuses_a_stale_version() {
    let storage = Storage::memory();
    let (earlier, first, second) = (RunId(id(5)), RunId(id(6)), RunId(id(7)));
    let (empty, none) = current::read(&storage)
        .await
        .expect("should read the missing current.json");
    assert!(
        current::activate(&storage, empty, none.as_ref(), earlier)
            .await
            .expect("should activate the earlier run"),
        "the first claim of an integration should create current.json"
    );
    current::complete(&storage, earlier)
        .await
        .expect("should complete the earlier run");

    // Two starts read the same `current.json`.
    let (current, version) = current::read(&storage)
        .await
        .expect("should read current.json");
    assert!(
        current::activate(&storage, current, version.as_ref(), first)
            .await
            .expect("should activate the first run"),
        "the first claim should write"
    );
    assert!(
        !current::activate(&storage, current, version.as_ref(), second)
            .await
            .expect("should try to activate the second run"),
        "a claim with the version read before the first claim should not write"
    );
    assert_eq!(
        current::read(&storage)
            .await
            .expect("should read current.json")
            .0,
        Current {
            active: Some(first),
            last_completed: Some(earlier),
        },
        "the refused claim should change nothing"
    );
}

#[tokio::test]
async fn complete_frees_the_integration_once() {
    let storage = Storage::memory();
    let (run, other) = (RunId(id(8)), RunId(id(9)));
    let (empty, none) = current::read(&storage)
        .await
        .expect("should read the missing current.json");
    current::activate(&storage, empty, none.as_ref(), run)
        .await
        .expect("should activate the run");

    current::complete(&storage, run)
        .await
        .expect("should complete the run");
    let (completed, version) = current::read(&storage)
        .await
        .expect("should read current.json");
    assert_eq!(
        completed,
        Current {
            active: None,
            last_completed: Some(run),
        },
        "the run should be the last completed run, and no run active"
    );

    current::complete(&storage, run)
        .await
        .expect("a second complete should succeed");
    assert_eq!(
        current::read(&storage)
            .await
            .expect("should read current.json")
            .1,
        version,
        "a second complete should not write"
    );
    let error = current::complete(&storage, other)
        .await
        .expect_err("a run current.json does not name should not complete");
    assert_eq!(
        *error.current_context(),
        RunError::NotActive,
        "completing another run should be refused as not active"
    );
}

#[tokio::test]
async fn start_writes_the_run_and_activates_it() {
    let storage = Storage::memory();
    let run = RunId(id(10));
    start(&storage, &aviation(), start_input(run))
        .await
        .expect("should start the run");

    let (record, _) = load(&storage, run).await.expect("should load run.json");
    assert_eq!(
        record,
        RunRecord {
            input: Input {
                run,
                web: WebId::new(WEB),
                connector: "aviation".into(),
                actor: ActorEntityUuid::new(id(2)),
                definition: AVIATION.into(),
                id_namespace: "aviation".into(),
                submitted_at: submitted_at(),
            },
            batch: BatchLimits::default(),
            capture: None,
            prepare: None,
            send: None,
            failure: None,
        },
        "run.json should hold only the input and batch parts, with the connector as id namespace"
    );
    assert_eq!(
        current::read(&storage)
            .await
            .expect("should read current.json")
            .0,
        Current {
            active: Some(run),
            last_completed: None,
        },
        "the run should be the active run"
    );
}

#[tokio::test]
async fn start_is_refused_while_a_run_is_active() {
    let storage = Storage::memory();
    let (first, second) = (RunId(id(11)), RunId(id(12)));
    start(&storage, &aviation(), start_input(first))
        .await
        .expect("should start the first run");

    let error = start(&storage, &aviation(), start_input(second))
        .await
        .expect_err("a second run should not start while the first is active");
    assert_eq!(
        *error.current_context(),
        StartError::RunActive { active: first },
        "the refusal should name the active run"
    );
    let error = load(&storage, second)
        .await
        .expect_err("the refused run should have no run.json");
    assert_eq!(
        *error.current_context(),
        RunError::NotFound,
        "a refused start should write nothing"
    );
}

#[tokio::test]
async fn starting_a_run_again_finishes_or_does_nothing() {
    let definition = aviation();
    let run = RunId(id(13));

    let started = Storage::memory();
    start(&started, &definition, start_input(run))
        .await
        .expect("should start the run");
    let before = versions(&started, run).await;
    start(&started, &definition, start_input(run))
        .await
        .expect("starting a started run again should succeed");
    assert_eq!(
        versions(&started, run).await,
        before,
        "starting a started run again should write nothing"
    );

    let interrupted = Storage::memory();
    save(
        &interrupted,
        &RunRecord::new(&definition, start_input(run)),
        None,
    )
    .await
    .expect("should create run.json");
    start(&interrupted, &definition, start_input(run))
        .await
        .expect("should finish a start that stopped after run.json");
    assert_eq!(
        current::read(&interrupted)
            .await
            .expect("should read current.json")
            .0,
        Current {
            active: Some(run),
            last_completed: None,
        },
        "the interrupted start should make the run active"
    );

    let completed = Storage::memory();
    start(&completed, &definition, start_input(run))
        .await
        .expect("should start the run");
    current::complete(&completed, run)
        .await
        .expect("should complete the run");
    let before = versions(&completed, run).await;
    start(&completed, &definition, start_input(run))
        .await
        .expect("starting a completed run again should succeed");
    assert_eq!(
        versions(&completed, run).await,
        before,
        "starting a completed run again should write nothing"
    );
}
