use pretty_assertions::assert_eq;
use rstest::rstest;
use serde_json::{Value, value::RawValue};
use type_system::knowledge::entity::id::EntityId;

use super::{Batch, Plan, Position, Writes};
use crate::{
    RunId,
    run::BatchLimits,
    stage::send::{
        request,
        testing::{entity, provenance, row},
    },
    sync_table::{Op, SyncRow},
};

const fn limits(max_writes: u32, max_bytes: u64) -> BatchLimits {
    BatchLimits {
        max_writes,
        max_bytes,
    }
}

fn wide() -> BatchLimits {
    BatchLimits::default()
}

fn plan(rows: &[SyncRow], limits: BatchLimits) -> Plan {
    Plan::new(rows, &provenance(), limits).expect("should plan the rows")
}

/// The op and the entity of each write of `batch`, in order.
fn writes(batch: &Batch) -> Vec<(Op, EntityId)> {
    positions(batch)
        .into_iter()
        .map(|(entity_id, _)| (batch.op(), entity_id))
        .collect()
}

/// The entity and the position of each write of `batch`, in order.
fn positions(batch: &Batch) -> Vec<(EntityId, Position)> {
    let targets = match batch.writes() {
        Writes::Create(writes) => writes.iter().map(|write| write.target).collect::<Vec<_>>(),
        Writes::Update(writes) => writes.iter().map(|write| write.target).collect(),
        Writes::Archive(writes) => writes.iter().map(|write| write.target).collect(),
    };
    targets
        .into_iter()
        .map(|target| (target.entity_id, target.position))
        .collect()
}

fn batches(plan: &Plan) -> Vec<Vec<(Op, EntityId)>> {
    plan.batches().iter().map(writes).collect()
}

/// The bulk request of `batch` as the client sends it: its bodies as one JSON list.
fn listed(batch: &Batch) -> String {
    let bodies = match batch.writes() {
        Writes::Create(writes) => writes
            .iter()
            .map(|write| write.create.get())
            .collect::<Vec<_>>(),
        Writes::Update(writes) => writes.iter().map(|write| write.patch.get()).collect(),
        Writes::Archive(writes) => writes.iter().map(|write| write.archive.get()).collect(),
    };
    format!("[{}]", bodies.join(","))
}

/// The bytes one entity create adds to a list: its own and one separator. It is the same for
/// every `uuid` from 1 to 9, which the name property holds as one digit.
fn listed_create() -> u64 {
    let create = request::create(&row(RunId::new(), Op::CreateEntity, 0, 1), &provenance())
        .expect("should build the body");
    create.get().len() as u64 + 1
}

/// Whether a body creates its entity, holds properties, and what it sets `archived` to.
fn keys(body: &RawValue) -> (bool, bool, Option<Value>) {
    let value: Value = serde_json::from_str(body.get()).expect("the body should be JSON");
    let object = value.as_object().expect("the body should be an object");
    (
        object.contains_key("entityUuid"),
        object.contains_key("properties"),
        object.get("archived").cloned(),
    )
}

#[test]
fn order_by_op_seq_and_entity() {
    let run = RunId::new();
    let rows = [
        row(run, Op::ArchiveEntity, 0, 7),
        row(run, Op::UpdateLink, 0, 6),
        row(run, Op::CreateLink, 1, 5),
        row(run, Op::CreateEntity, 2, 4),
        row(run, Op::UpdateEntity, 0, 3),
        row(run, Op::ArchiveLink, 0, 8),
        row(run, Op::CreateEntity, 1, 9),
        row(run, Op::CreateEntity, 1, 2),
    ];

    assert_eq!(
        batches(&plan(&rows, wide())),
        vec![
            vec![
                (Op::CreateEntity, entity(2)),
                (Op::CreateEntity, entity(9)),
                (Op::CreateEntity, entity(4)),
            ],
            vec![(Op::UpdateEntity, entity(3))],
            vec![(Op::CreateLink, entity(5))],
            vec![(Op::UpdateLink, entity(6))],
            vec![(Op::ArchiveLink, entity(8))],
            vec![(Op::ArchiveEntity, entity(7))],
        ],
        "writes should be ordered by op, then `seq`, then entity, one op per batch"
    );
}

#[rstest]
#[case::count_limit(limits(2, 1_500_000), vec![2, 2, 1])]
#[case::size_limit(limits(128, 1 + 2 * listed_create()), vec![2, 2, 1])]
#[case::size_limit_exact(limits(128, 1 + 5 * listed_create()), vec![5])]
#[case::body_over_size_limit(limits(128, 10), vec![1, 1, 1, 1, 1])]
fn limits_cut_batches(#[case] limits: BatchLimits, #[case] sizes: Vec<usize>) {
    let run = RunId::new();
    let rows = (1..=5)
        .map(|uuid| row(run, Op::CreateEntity, 0, uuid))
        .collect::<Vec<_>>();

    let plan = plan(&rows, limits);

    assert_eq!(
        plan.batches()
            .iter()
            .map(|batch| batch.writes().len())
            .collect::<Vec<_>>(),
        sizes,
        "batches should be cut at the limits"
    );
    for batch in plan.batches() {
        assert!(
            batch.writes().len() == 1 || listed(batch).len() as u64 <= limits.max_bytes,
            "a batch of several writes should be sent within the size limit"
        );
    }
}

#[test]
fn limits_keep_small_writes_after_large_one_together() {
    let run = RunId::new();
    let mut large = row(run, Op::CreateEntity, 1, 2);
    large.properties = serde_json::from_value(serde_json::json!({
        "value": {
            "https://hash.ai/@h/types/property-type/name/": {
                "value": "x".repeat(400),
                "metadata": { "dataTypeId": "https://hash.ai/@h/types/data-type/text/v/1" },
            },
        },
    }))
    .expect("should be properties with metadata");
    let rows = [
        row(run, Op::CreateEntity, 0, 1),
        large,
        row(run, Op::CreateEntity, 2, 3),
        row(run, Op::CreateEntity, 3, 4),
    ];

    let plan = plan(&rows, limits(128, 1 + 2 * listed_create()));

    assert_eq!(
        batches(&plan),
        vec![
            vec![(Op::CreateEntity, entity(1))],
            vec![(Op::CreateEntity, entity(2))],
            vec![(Op::CreateEntity, entity(3)), (Op::CreateEntity, entity(4))],
        ],
        "a body over the size limit should be alone, and the writes after it together"
    );
}

#[test]
fn entity_once_per_batch() {
    let run = RunId::new();
    let rows = [
        row(run, Op::UpdateEntity, 0, 1),
        row(run, Op::UpdateEntity, 1, 2),
        row(run, Op::UpdateEntity, 2, 1),
        row(run, Op::UpdateEntity, 3, 3),
    ];

    assert_eq!(
        batches(&plan(&rows, wide())),
        vec![
            vec![(Op::UpdateEntity, entity(1)), (Op::UpdateEntity, entity(2))],
            vec![(Op::UpdateEntity, entity(1)), (Op::UpdateEntity, entity(3))],
        ],
        "a second write of an entity should start a new batch"
    );
}

#[test]
fn positions_same_for_rows_in_any_order() {
    let run = RunId::new();
    let ops = [Op::CreateEntity, Op::UpdateEntity, Op::ArchiveEntity];
    let rows = ops
        .into_iter()
        .cycle()
        .zip((0..7).cycle())
        .zip((0..11).cycle())
        .take(40)
        .map(|((op, seq), uuid)| row(run, op, seq, uuid))
        .collect::<Vec<_>>();
    let reversed = rows.iter().rev().cloned().collect::<Vec<_>>();

    let first = plan(&rows, limits(3, 1_500_000));
    let second = plan(&reversed, limits(3, 1_500_000));

    assert_eq!(
        batches(&first),
        batches(&second),
        "rows in any order should give the same batches"
    );
    for (number, batch) in (0_u32..).zip(first.batches()) {
        let found = positions(batch)
            .into_iter()
            .map(|(_, position)| position)
            .collect::<Vec<_>>();
        let expected = (0_u32..)
            .take(found.len())
            .map(|index| Position {
                batch: number,
                index,
            })
            .collect::<Vec<_>>();
        assert_eq!(
            found, expected,
            "each write should know its batch and its place in it"
        );
    }
    assert_eq!(first.rows(), 40, "the plan should count its rows");
}

#[test]
fn order_settles_tie_by_body() {
    let run = RunId::new();
    let mut other = row(run, Op::UpdateEntity, 0, 1);
    other.properties = row(run, Op::UpdateEntity, 0, 2).properties;
    let rows = [row(run, Op::UpdateEntity, 0, 1), other];
    let reversed = [rows[1].clone(), rows[0].clone()];

    let first = plan(&rows, wide())
        .batches()
        .iter()
        .map(listed)
        .collect::<Vec<_>>();
    let second = plan(&reversed, wide())
        .batches()
        .iter()
        .map(listed)
        .collect::<Vec<_>>();

    assert_eq!(
        first, second,
        "two rows of one entity with the same `seq` should be sent in the same order"
    );
    assert_eq!(
        first.len(),
        2,
        "the two rows of one entity should be in two batches"
    );
}

#[test]
fn writes_carry_their_fallback() {
    let run = RunId::new();
    let rows = [
        row(run, Op::CreateEntity, 0, 1),
        row(run, Op::UpdateEntity, 0, 2),
        row(run, Op::ArchiveEntity, 0, 3),
    ];

    let plan = plan(&rows, wide());

    let found = plan
        .batches()
        .iter()
        .map(|batch| match batch.writes() {
            Writes::Create(writes) => writes
                .iter()
                .map(|write| {
                    (
                        keys(write.create.as_ref()),
                        Some(keys(write.patch.as_ref())),
                    )
                })
                .collect::<Vec<_>>(),
            Writes::Update(writes) => writes
                .iter()
                .map(|write| {
                    (
                        keys(write.patch.as_ref()),
                        Some(keys(write.create.as_ref())),
                    )
                })
                .collect(),
            Writes::Archive(writes) => writes
                .iter()
                .map(|write| (keys(write.archive.as_ref()), None))
                .collect(),
        })
        .collect::<Vec<_>>();

    let create = (true, true, None);
    let patch = (false, true, Some(Value::Bool(false)));
    let archive = (false, false, Some(Value::Bool(true)));
    assert_eq!(
        found,
        vec![
            vec![(create.clone(), Some(patch.clone()))],
            vec![(patch, Some(create))],
            vec![(archive, None)],
        ],
        "a create should fall back to a patch, an update to a create, and an archive to nothing"
    );
}

#[test]
fn link_without_ends_is_refused() {
    let run = RunId::new();
    let mut link = row(run, Op::CreateLink, 0, 1);
    link.right_entity_id = None;

    let error = Plan::new(&[link], &provenance(), wide())
        .expect_err("a link row without both ends should not be planned");

    assert_eq!(
        error.current_context().entity_id,
        entity(1),
        "the error should name the link"
    );
}
