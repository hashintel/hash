use alloc::collections::BTreeMap;

use pretty_assertions::assert_eq;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use type_system::{
    knowledge::entity::id::{EntityId, EntityUuid},
    principal::{actor::ActorEntityUuid, actor_group::WebId},
};
use uuid::Uuid;

use super::{
    RunId, load,
    record::{
        BatchLimits, CapturePart, CapturedFile, FailedEntity, Failure, Input, PreparePart,
        RunRecord, SendPart, Stage,
    },
    run_file, save,
};
use crate::Storage;

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
        submitted_at: OffsetDateTime::parse("2026-07-22T10:00:00Z", &Rfc3339)
            .expect("should be an RFC 3339 time"),
    }
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
