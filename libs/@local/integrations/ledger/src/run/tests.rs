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

async fn started(storage: &Storage, run: RunId) {
    start(storage, &aviation(), start_input(run))
        .await
        .expect("should start the run");
}

async fn current_of(storage: &Storage) -> Current {
    current::read(storage)
        .await
        .expect("should read current.json")
        .0
}

async fn text(storage: &Storage, key: &str) -> String {
    let (bytes, _) = storage
        .read_versioned(key)
        .await
        .expect("should read the file")
        .expect("the file should exist");
    String::from_utf8(bytes).expect("the file should be UTF-8")
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

    insta::assert_snapshot!(text(&storage, &run_file(run)).await);
}

#[tokio::test]
async fn save_stale_version() {
    let storage = Storage::memory();
    let run = RunId(id(3));
    let record = finished(run);
    save(&storage, &record, None)
        .await
        .expect("should create run.json");
    let (mut cleared, version) = load(&storage, run).await.expect("should load run.json");
    cleared.failure = None;
    save(&storage, &cleared, Some(&version))
        .await
        .expect("a save with the loaded version should write");

    let error = save(&storage, &record, Some(&version))
        .await
        .expect_err("a save with a stale version should not write");
    assert_eq!(
        *error.current_context(),
        RunError::Changed,
        "a stale save should be reported as a change"
    );
    assert_eq!(
        load(&storage, run).await.expect("should load run.json").0,
        cleared,
        "a stale save should change nothing"
    );
}

#[tokio::test]
async fn load_unknown_field() {
    let storage = Storage::memory();
    let run = RunId(id(3));
    let mut json = serde_json::to_value(finished(run)).expect("a run record should serialize");
    json.as_object_mut()
        .expect("a run record should be an object")
        .insert("failures".to_owned(), serde_json::Value::Null);
    storage
        .replace_if(&run_file(run), None, json.to_string().into())
        .await
        .expect("should write run.json");

    let error = load(&storage, run)
        .await
        .expect_err("a record with a field it does not know should not load");
    assert_eq!(
        *error.current_context(),
        RunError::Unreadable,
        "a misspelt part should make run.json unreadable"
    );
}

#[tokio::test]
async fn activate_stale_version() {
    let storage = Storage::memory();
    let (earlier, first, second) = (RunId(id(5)), RunId(id(6)), RunId(id(7)));
    started(&storage, earlier).await;
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
        current_of(&storage).await,
        Current {
            active: Some(first),
            last_completed: Some(earlier),
        },
        "the refused claim should change nothing"
    );
}

#[tokio::test]
async fn complete_repeated() {
    let storage = Storage::memory();
    let run = RunId(id(8));
    started(&storage, run).await;
    current::complete(&storage, run)
        .await
        .expect("should complete the run");
    let before = versions(&storage, run).await;

    current::complete(&storage, run)
        .await
        .expect("a second complete should succeed");
    assert_eq!(
        current_of(&storage).await,
        Current {
            active: None,
            last_completed: Some(run),
        },
        "the run should be the last completed run, and no run active"
    );
    assert_eq!(
        versions(&storage, run).await,
        before,
        "a second complete should not write"
    );
}

#[tokio::test]
async fn complete_other_run() {
    let storage = Storage::memory();
    started(&storage, RunId(id(8))).await;

    let error = current::complete(&storage, RunId(id(9)))
        .await
        .expect_err("a run current.json does not name should not complete");
    assert_eq!(
        *error.current_context(),
        RunError::NotActive,
        "completing another run should be refused as not active"
    );
}

#[tokio::test]
async fn start_new_run() {
    let storage = Storage::memory();
    let run = RunId(id(10));
    let input = StartInput {
        id_namespace: Some("flights".into()),
        ..start_input(run)
    };
    start(&storage, &aviation(), input)
        .await
        .expect("should start the run");

    insta::assert_snapshot!(text(&storage, &run_file(run)).await);
    assert_eq!(
        current_of(&storage).await,
        Current {
            active: Some(run),
            last_completed: None,
        },
        "the run should be the active run"
    );
}

#[tokio::test]
async fn start_other_run_active() {
    let storage = Storage::memory();
    let (first, second) = (RunId(id(11)), RunId(id(12)));
    started(&storage, first).await;

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
        "a refused start should write no run.json"
    );
}

#[tokio::test]
async fn start_current_unknown_field() {
    let storage = Storage::memory();
    let edited = br#"{ "activ": null, "last_completed": null }"#;
    storage
        .replace_if("current.json", None, edited.as_slice().into())
        .await
        .expect("should write current.json");

    let error = start(&storage, &aviation(), start_input(RunId(id(13))))
        .await
        .expect_err("a start should not run on a current.json it cannot read");
    assert_eq!(
        *error.current_context(),
        StartError::Unreadable,
        "a misspelt field should make current.json unreadable, not free the integration"
    );
    assert_eq!(
        text(&storage, "current.json").await.as_bytes(),
        edited,
        "a refused start should leave current.json as it was"
    );
}

#[tokio::test]
async fn start_repeated() {
    let storage = Storage::memory();
    let run = RunId(id(14));
    started(&storage, run).await;
    let before = versions(&storage, run).await;

    started(&storage, run).await;
    assert_eq!(
        versions(&storage, run).await,
        before,
        "starting the active run again should write nothing"
    );
}

#[tokio::test]
async fn start_repeated_completed() {
    let storage = Storage::memory();
    let run = RunId(id(15));
    started(&storage, run).await;
    current::complete(&storage, run)
        .await
        .expect("should complete the run");
    let before = versions(&storage, run).await;

    started(&storage, run).await;
    assert_eq!(
        versions(&storage, run).await,
        before,
        "starting the last completed run again should write nothing"
    );
}

#[tokio::test]
async fn start_interrupted() {
    let storage = Storage::memory();
    let run = RunId(id(16));
    save(
        &storage,
        &RunRecord::new(&aviation(), start_input(run)),
        None,
    )
    .await
    .expect("should create run.json");

    started(&storage, run).await;
    assert_eq!(
        current_of(&storage).await,
        Current {
            active: Some(run),
            last_completed: None,
        },
        "a start that stopped after run.json should be finished by the next start"
    );
}
