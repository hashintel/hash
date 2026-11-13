use hash_graph_store::entity::{EntityStore as _, PatchEntityParams};
use serde_json::{Value as JsonValue, json};
use similar_asserts::assert_eq;
use type_system::knowledge::entity::Link;

use super::{
    DEFINITION, Harness, MASS, MODEL, NAME, assert_changed, body, editions, entity, properties,
};
use crate::{OperationRequest, stage::send::SendCounts};

pub(super) fn without_n100() -> String {
    DEFINITION.replace(
        ",\n        ('N100', 'L-1049', '1957-07-15', '69000', 'LB', 'ESSA')",
        "",
    )
}

#[tokio::test]
async fn first_run_replay_editions() {
    let mut harness = Harness::new().await;
    let first = harness.apply(DEFINITION).await;
    assert_eq!(first.output.counts.created, 6);
    let initial = harness.database.read().await;
    assert_eq!(initial.len(), 6);
    for stored in initial.values() {
        assert!(
            stored.metadata.read_only,
            "should create read-only integration entities"
        );
        assert!(!stored.metadata.archived, "should create live entities");
        assert_eq!(
            stored.metadata.provenance.created_by_id,
            harness.database.actor.into()
        );
        let provenance = serde_json::to_value(&stored.metadata.provenance.edition.provided)
            .expect("should encode edition provenance");
        assert_eq!(
            provenance,
            json!({"actorType":"machine","origin":{"type":"api"},"sources":[{"loadedAt":"2026-11-06T12:00:00.000000000Z","location":{"name":"aviation"},"type":"integration"}]})
        );
    }
    assert_eq!(properties(entity(&initial, "AC-SEXXX"))[MODEL], "DC-3");
    assert_eq!(properties(entity(&initial, "AC-SEXXX"))[MASS], 8030.0);
    assert_eq!(properties(entity(&initial, "AC-N100"))[MODEL], "L-1049");
    for (link, aircraft) in [("L-N100-ESSA", "AC-N100"), ("L-SEXXX-ESSA", "AC-SEXXX")] {
        let Some(Link::Directed { source, target }) = &entity(&initial, link).link_data else {
            panic!("should create the specified directed link");
        };
        assert_eq!(
            source.entity_id,
            entity(&initial, aircraft).metadata.record_id.entity_id
        );
        assert_eq!(
            target.entity_id,
            entity(&initial, "AF-ESSA").metadata.record_id.entity_id
        );
    }
    let unchanged = harness.apply(DEFINITION).await;
    assert_eq!(unchanged.output.counts, SendCounts::default());
    assert_eq!(unchanged.bodies.len(), 0);
    assert_eq!(editions(&harness.database.read().await), editions(&initial));
    let replayed = harness
        .execute(OperationRequest::Apply {
            definition: DEFINITION.into(),
            namespace: harness.namespace().into(),
            resend_all: true,
        })
        .await;
    assert_eq!(replayed.output.counts.patched, 6);
    assert_eq!(
        editions(&harness.database.read().await),
        editions(&initial),
        "should replay actual planned HTTP bodies with later edition provenance without creating \
         editions"
    );
}

#[tokio::test]
async fn changes_replace_removed_properties() {
    let mut harness = Harness::new().await;
    harness.apply(DEFINITION).await;
    let initial = harness.database.read().await;
    let changed_definition = DEFINITION.replace("'L-1049'", "'L-1049G'");
    let changed = harness.apply(&changed_definition).await;
    assert_eq!(changed.output.counts.patched, 1);
    let updated = harness.database.read().await;
    assert_changed(&initial, &updated, &["AC-N100"]);
    assert_eq!(properties(entity(&updated, "AC-N100"))[MODEL], "L-1049G");
    let removed = harness
        .apply(&changed_definition.replace("'8030'", "''"))
        .await;
    assert_eq!(removed.output.counts.patched, 1);
    let after_removal = harness.database.read().await;
    assert_changed(&updated, &after_removal, &["AC-SEXXX"]);
    let aircraft = properties(entity(&after_removal, "AC-SEXXX"));
    assert!(
        aircraft.get(MASS).is_none(),
        "should remove a previously stored property through root replacement"
    );
    assert_eq!(aircraft[MODEL], "DC-3");
}

#[tokio::test]
async fn deletion_unarchive_and_empty_coverage() {
    let mut harness = Harness::new().await;
    harness.apply(DEFINITION).await;
    let initial = harness.database.read().await;
    let deleted = harness.apply(&without_n100()).await;
    assert_eq!(deleted.output.counts.archived, 2);
    let archived = harness.database.read().await;
    assert_changed(&initial, &archived, &["AC-N100", "L-N100-ESSA"]);
    for alias in ["AC-N100", "L-N100-ESSA"] {
        assert!(
            entity(&archived, alias).metadata.archived,
            "should archive the removed aircraft and its link"
        );
    }
    let restored = harness.apply(DEFINITION).await;
    assert_eq!(restored.output.counts.patched, 2);
    let live = harness.database.read().await;
    assert_changed(&archived, &live, &["AC-N100", "L-N100-ESSA"]);
    assert!(
        live.values().all(|entity| !entity.metadata.archived),
        "should unarchive the returned source rows"
    );
    let empty = DEFINITION.replace(
        ") t(TAIL, MODEL, FIRST_FLIGHT, EMPTY_MASS, MASS_UNIT, HOME_BASE)",
        ") t(TAIL, MODEL, FIRST_FLIGHT, EMPTY_MASS, MASS_UNIT, HOME_BASE) WHERE false",
    );
    let protected = harness.apply(&empty).await;
    assert_eq!(protected.output.counts, SendCounts::default());
    assert_eq!(editions(&harness.database.read().await), editions(&live));
    let complete_or_empty = empty.replace(
        "  aircraft:\n",
        "  aircraft:\n    coverage: complete-or-empty\n",
    );
    let emptied = harness.apply(&complete_or_empty).await;
    assert_eq!(emptied.output.counts.archived, 4);
    let final_state = harness.database.read().await;
    assert_changed(
        &live,
        &final_state,
        &["AC-N100", "AC-SEXXX", "L-N100-ESSA", "L-SEXXX-ESSA"],
    );
    for alias in ["AC-N100", "AC-SEXXX", "L-N100-ESSA", "L-SEXXX-ESSA"] {
        assert!(
            entity(&final_state, alias).metadata.archived,
            "should archive complete-or-empty source rows"
        );
    }
    assert!(!entity(&final_state, "AF-ESSA").metadata.archived);
    assert!(!entity(&final_state, "AF-ESSB").metadata.archived);
}

#[tokio::test]
async fn reconcile_repairs_and_replays_tombstones() {
    let mut harness = Harness::new().await;
    let first = harness.apply(DEFINITION).await;
    let initial = harness.database.read().await;
    let mut archived: JsonValue = serde_json::from_str(body(&first.bodies, "AC-N100").patch.get())
        .expect("should decode the planned aircraft patch");
    archived["archived"] = json!(true);
    let mut renamed: JsonValue = serde_json::from_str(body(&first.bodies, "AF-ESSA").patch.get())
        .expect("should decode the planned airfield patch");
    renamed["properties"][0]["property"]["value"][NAME]["value"] = json!("Stockholm");
    // These two writes simulate out-of-band changes. Repair below goes through the HTTP runner.
    for value in [archived, renamed] {
        let params: PatchEntityParams =
            serde_json::from_value(value).expect("should form an out-of-band store patch");
        harness
            .database
            .store
            .patch_entity(harness.database.actor, params)
            .await
            .expect("should simulate an external Graph change");
    }
    let altered = harness.database.read().await;
    assert_changed(&initial, &altered, &["AC-N100", "AF-ESSA"]);
    let reconciled = harness.execute(OperationRequest::Reconcile).await;
    assert_eq!(reconciled.output.counts.patched, 6);
    let repaired = harness.database.read().await;
    assert_changed(&altered, &repaired, &["AC-N100", "AF-ESSA"]);
    assert!(!entity(&repaired, "AC-N100").metadata.archived);
    assert_eq!(properties(entity(&repaired, "AF-ESSA"))[NAME], "Arlanda");
    let deleted = harness.apply(&without_n100()).await;
    assert_eq!(deleted.output.counts.archived, 2);
    let tombstones = harness.database.read().await;
    let repeated = harness.execute(OperationRequest::Reconcile).await;
    assert_eq!(repeated.output.counts.patched, 4);
    assert_eq!(repeated.output.counts.archived, 2);
    assert_eq!(
        editions(&harness.database.read().await),
        editions(&tombstones),
        "should replay live and archived planned HTTP bodies without new editions"
    );
}
