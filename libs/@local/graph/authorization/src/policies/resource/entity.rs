use hash_graph_types::{knowledge::entity::EntityUuid, owned_by_id::OwnedById};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(untagged, rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum EntityResourceConstraint {
    Any {},
    Exact {
        #[serde(deserialize_with = "Option::deserialize")]
        entity_uuid: Option<EntityUuid>,
    },
    Web {
        #[serde(deserialize_with = "Option::deserialize")]
        web_id: Option<OwnedById>,
    },
}

#[cfg(test)]
mod tests {
    use hash_graph_types::{knowledge::entity::EntityUuid, owned_by_id::OwnedById};
    use serde_json::json;
    use uuid::Uuid;

    use super::EntityResourceConstraint;
    use crate::{
        policies::{ResourceConstraint, resource::tests::check_resource},
        test_utils::check_deserialization_error,
    };

    #[test]
    fn constraint_any() {
        check_resource(
            ResourceConstraint::Entity(EntityResourceConstraint::Any {}),
            json!({
                "type": "entity"
            }),
            "resource is HASH::Entity",
        );

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "entity",
                "additional": "unexpected"
            }),
            "data did not match any variant of untagged enum EntityResourceConstraint",
        );
    }

    #[test]
    fn constraint_exact() {
        let entity_uuid = EntityUuid::new(Uuid::new_v4());
        check_resource(
            ResourceConstraint::Entity(EntityResourceConstraint::Exact {
                entity_uuid: Some(entity_uuid),
            }),
            json!({
                "type": "entity",
                "entityUuid": entity_uuid,
            }),
            format!(r#"resource == HASH::Entity::"{entity_uuid}""#),
        );
        check_resource(
            ResourceConstraint::Entity(EntityResourceConstraint::Exact { entity_uuid: None }),
            json!({
                "type": "entity",
                "entityUuid": null,
            }),
            "resource == ?resource",
        );

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "entity",
                "webId": OwnedById::new(Uuid::new_v4()),
                "entityUuid": entity_uuid,
            }),
            "data did not match any variant of untagged enum EntityResourceConstraint",
        );
    }

    #[test]
    fn constraint_in_web() {
        let web_id = OwnedById::new(Uuid::new_v4());
        check_resource(
            ResourceConstraint::Entity(EntityResourceConstraint::Web {
                web_id: Some(web_id),
            }),
            json!({
                "type": "entity",
                "webId": web_id,
            }),
            format!(r#"resource is HASH::Entity in HASH::Web::"{web_id}""#),
        );

        check_resource(
            ResourceConstraint::Entity(EntityResourceConstraint::Web { web_id: None }),
            json!({
                "type": "entity",
                "webId": null,
            }),
            "resource is HASH::Entity in ?resource",
        );

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "entity",
                "webId": OwnedById::new(Uuid::new_v4()),
                "entityUuid": EntityUuid::new(Uuid::new_v4()),
            }),
            "data did not match any variant of untagged enum EntityResourceConstraint",
        );
    }
}
