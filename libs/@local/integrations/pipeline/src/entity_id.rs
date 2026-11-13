use duckdb::types::Value;
use type_system::{
    knowledge::entity::id::{EntityId, EntityUuid},
    ontology::id::VersionedUrl,
    principal::actor_group::WebId,
};
use uuid::Uuid;

use crate::workspace::value::{is_blank, text};

const NAMESPACE: Uuid = Uuid::from_u128(0xD6E2_C7A1_F84B_4E3A_9C0D_5B7F_1E3A_2D4C);

/// Derives a live entity ID from the integration namespace, entity type, and source record ID.
#[must_use]
pub fn derive_entity_id(
    web_id: WebId,
    namespace: &str,
    entity_type: &VersionedUrl,
    source_id: &str,
) -> EntityId {
    let name = format!("{namespace}::{entity_type}::{source_id}");
    EntityId {
        web_id,
        entity_uuid: EntityUuid::new(Uuid::new_v5(&NAMESPACE, name.as_bytes())),
        draft_id: None,
    }
}

/// One end of a link, identified by its entity type and source record.
#[derive(Debug, Clone, Copy)]
pub struct LinkEndpoint<'a> {
    pub entity_type: &'a VersionedUrl,
    pub source_id: &'a str,
}

/// Stable identities derived together from a link's endpoint records.
#[derive(Debug, Clone, PartialEq, Eq)]
#[expect(
    clippy::struct_field_names,
    reason = "names distinguish the four IDs in the shared contract"
)]
pub(crate) struct LinkIds {
    pub link_id: EntityId,
    pub left_entity_id: EntityId,
    pub right_entity_id: EntityId,
    pub source_id: String,
}

/// Renders a nonblank source identifier without trimming its identity-bearing whitespace.
#[must_use]
pub(crate) fn source_id(value: &Value) -> Option<String> {
    if is_blank(value) { None } else { text(value) }
}

/// Derives the link and endpoint IDs from the same typed source identity rule.
#[must_use]
pub(crate) fn derive_link_ids(
    web_id: WebId,
    namespace: &str,
    link_type: &VersionedUrl,
    left: LinkEndpoint<'_>,
    right: LinkEndpoint<'_>,
) -> LinkIds {
    let source_id = format!(
        "{}::{}::{}::{}",
        left.entity_type, left.source_id, right.entity_type, right.source_id
    );
    LinkIds {
        link_id: derive_entity_id(web_id, namespace, link_type, &source_id),
        left_entity_id: derive_entity_id(web_id, namespace, left.entity_type, left.source_id),
        right_entity_id: derive_entity_id(web_id, namespace, right.entity_type, right.source_id),
        source_id,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::Value;
    use similar_asserts::assert_eq;
    use type_system::{ontology::VersionedUrl, principal::actor_group::WebId};
    use uuid::Uuid;

    use super::{LinkEndpoint, derive_link_ids};

    #[test]
    fn link_ids_scenario_vectors() {
        let fixture: Value =
            serde_json::from_str(include_str!("../tests/fixtures/entity-ids.json"))
                .expect("should decode independent entity identities");
        let web = WebId::new(
            fixture["web"]
                .as_str()
                .expect("should specify the web")
                .parse::<Uuid>()
                .expect("should parse the web"),
        );
        for expected in fixture["entities"]
            .as_object()
            .expect("should contain scenario entities")
            .values()
            .filter(|entity| entity["kind"] == "link")
        {
            let source = expected["source_id"]
                .as_str()
                .expect("should specify the link source");
            let parts: Vec<_> = source.split("::").collect();
            let [left_type, left_source, right_type, right_source] = parts.as_slice() else {
                panic!("should supply the independently expanded endpoint identity");
            };
            let left_type: VersionedUrl = left_type.parse().expect("should parse left type");
            let right_type: VersionedUrl = right_type.parse().expect("should parse right type");
            let link_type = expected["entity_type"]
                .as_str()
                .expect("should specify link type")
                .parse()
                .expect("should parse link type");
            let ids = derive_link_ids(
                web,
                "aviation",
                &link_type,
                LinkEndpoint {
                    entity_type: &left_type,
                    source_id: left_source,
                },
                LinkEndpoint {
                    entity_type: &right_type,
                    source_id: right_source,
                },
            );
            assert_eq!(ids.source_id, source);
            for (actual, field) in [
                (ids.link_id, "entity_id"),
                (ids.left_entity_id, "left_entity_id"),
                (ids.right_entity_id, "right_entity_id"),
            ] {
                assert_eq!(
                    actual.to_string(),
                    expected[field].as_str().expect("should supply identity")
                );
            }
        }
    }
}
