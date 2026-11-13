use serde_json::{Value as JsonValue, json};
use similar_asserts::assert_eq;
use type_system::knowledge::{PropertyValue, property::Property};
use uuid::Uuid;

use super::{DEFINITION, Harness, MASS, MODEL, body, editions, entity, raw};
use crate::{
    OperationRequest,
    graph::{Graph as _, GraphResponse},
};

#[tokio::test]
async fn statuses_atomicity_and_read_only_actor() {
    let mut harness = Harness::new().await;
    let first = harness.apply(DEFINITION).await;
    let initial = harness.database.read().await;
    let aircraft = body(&first.bodies, "AC-SEXXX");
    let create = aircraft
        .create
        .as_deref()
        .expect("should plan an aircraft create");
    let actor = harness.database.actor.into();
    assert_eq!(
        harness.graph.create(actor, &[create]).await,
        GraphResponse::Status(409)
    );
    let mut missing: JsonValue =
        serde_json::from_str(aircraft.patch.get()).expect("should decode the planned patch");
    missing["entityId"] = json!(format!("{}~{}", harness.database.web, Uuid::new_v4()));
    assert_eq!(
        harness.graph.patch(actor, &[&raw(&missing)]).await,
        GraphResponse::Status(404)
    );

    // Valid wire shapes reach the Graph's semantic validation. A failed bulk may not
    // retain the first valid write, for either create or root-replacement patch.
    let mut valid_create: JsonValue =
        serde_json::from_str(create.get()).expect("should decode a planned create");
    valid_create["entityUuid"] = json!(Uuid::new_v4());
    let mut invalid_create = valid_create.clone();
    invalid_create["entityUuid"] = json!(Uuid::new_v4());
    invalid_create["properties"]["value"][MODEL]["value"] = json!(42);
    let response = harness
        .graph
        .create(actor, &[&raw(&valid_create), &raw(&invalid_create)])
        .await;
    assert!(
        matches!(response, GraphResponse::Status(400 | 422)),
        "should receive a semantic bulk-create refusal: {response:?}"
    );
    assert_eq!(
        harness.database.read().await,
        initial,
        "should apply no entity from a failed bulk create"
    );
    let mut valid_patch: JsonValue =
        serde_json::from_str(aircraft.patch.get()).expect("should decode a planned patch");
    valid_patch["properties"][0]["property"]["value"][MODEL]["value"] = json!("Must roll back");
    let mut invalid_patch: JsonValue =
        serde_json::from_str(body(&first.bodies, "AC-N100").patch.get())
            .expect("should decode another planned patch");
    invalid_patch["properties"][0]["property"]["value"][MODEL]["value"] = json!(42);
    let response = harness
        .graph
        .patch(actor, &[&raw(&valid_patch), &raw(&invalid_patch)])
        .await;
    assert!(
        matches!(response, GraphResponse::Status(400 | 422)),
        "should receive a semantic bulk-patch refusal: {response:?}"
    );
    assert_eq!(
        harness.database.read().await,
        initial,
        "should apply no property or edition from a failed bulk patch"
    );

    assert_eq!(
        harness
            .graph
            .patch(harness.database.user.into(), &[&raw(&valid_patch)])
            .await,
        GraphResponse::Status(403),
        "should forbid a user from updating a read-only integration entity"
    );
    let archive = raw(
        &json!({"entityId": aircraft.entity_id, "archived": true, "provenance": {"actorType": "user", "origin": {"type":"api"}}}),
    );
    assert_eq!(
        harness
            .graph
            .patch(harness.database.user.into(), &[&archive])
            .await,
        GraphResponse::Status(403),
        "should forbid a user from archiving a read-only integration entity"
    );
    assert_eq!(harness.database.read().await, initial);
}

#[tokio::test]
async fn long_number_transport_and_replay() {
    let mut harness = Harness::new().await;
    let definition = DEFINITION.replace("'8030'", "'9007199254740993'");
    let first = harness.apply(&definition).await;
    let planned = body(&first.bodies, "AC-SEXXX")
        .create
        .as_ref()
        .expect("should plan a numeric create")
        .get();
    assert!(
        planned.contains("9007199254740992.0"),
        "should expose the agreed Real-to-f64 rounding in the actual planned body"
    );
    assert!(
        !planned.contains("9007199254740993"),
        "should distinguish source precision from transported precision"
    );
    let initial = harness.database.read().await;
    let aircraft = entity(&initial, "AC-SEXXX");
    let raw_stored: String = harness
        .database
        .store
        .as_ref()
        .query_one(
            "SELECT properties ->> $2 FROM entity_editions WHERE entity_edition_id = $1",
            &[&aircraft.metadata.record_id.edition_id, &MASS],
        )
        .await
        .expect("should inspect the raw stored JSON without a Real conversion")
        .get(0);
    assert_eq!(
        raw_stored, "9007199254740990.0",
        "should record the additional Graph-side rounding independently of the read API"
    );
    let stored = aircraft
        .properties
        .iter()
        .find(|(url, _)| url.as_str() == MASS)
        .map(|(_, value)| value)
        .expect("should store the transported mass property");
    let Property::Value(PropertyValue::Number(number)) = stored else {
        panic!("should retain a numeric Graph property");
    };
    assert_eq!(
        number.to_string(),
        "9007199254740990",
        "should inspect stored Real precision without serializing through f64 again"
    );
    let replay = harness
        .execute(OperationRequest::Apply {
            definition: definition.into(),
            namespace: harness.namespace().into(),
            resend_all: true,
        })
        .await;
    assert_eq!(replay.output.counts.patched, 6);
    assert_eq!(
        editions(&harness.database.read().await),
        editions(&initial),
        "should not add an edition when replaying the already rounded planned HTTP value"
    );
}
