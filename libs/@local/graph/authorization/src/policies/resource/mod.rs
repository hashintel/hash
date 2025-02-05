pub use self::entity::EntityResourceConstraint;

mod entity;

use hash_graph_types::owned_by_id::OwnedById;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ResourceConstraint {
    Global {},
    Web {
        #[serde(deserialize_with = "Option::deserialize")]
        web_id: Option<OwnedById>,
    },
    Entity(EntityResourceConstraint),
}

#[cfg(test)]
mod tests {
    use hash_graph_types::owned_by_id::OwnedById;
    use pretty_assertions::assert_eq;
    use serde_json::{Value as JsonValue, json};
    use uuid::Uuid;

    use super::ResourceConstraint;
    use crate::test_utils::{check_deserialization_error, check_serialization};

    #[track_caller]
    pub(crate) fn check_resource(
        constraint: ResourceConstraint,
        value: JsonValue,
        cedar_string: impl AsRef<str>,
    ) {
        check_serialization(&constraint, value);

        #[cfg(feature = "cedar")]
        assert_eq!(
            cedar_policy_core::ast::ResourceConstraint::from(constraint).to_string(),
            cedar_string.as_ref(),
        );
    }

    #[test]
    fn constraint_any() {
        check_resource(
            ResourceConstraint::Global {},
            json!({
                "type": "global",
            }),
            "resource",
        );

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "global",
                "additional": "unexpected"
            }),
            "unknown field `additional`, there are no fields",
        );
    }

    #[test]
    fn constraint_in_web() {
        let web_id = OwnedById::new(Uuid::new_v4());
        check_resource(
            ResourceConstraint::Web {
                web_id: Some(web_id.clone()),
            },
            json!({
                "type": "web",
                "webId": web_id,
            }),
            format!(r#"resource in HASH::Web::"{web_id}""#),
        );

        check_resource(
            ResourceConstraint::Web { web_id: None },
            json!({
                "type": "web",
                "webId": null,
            }),
            "resource in ?resource",
        );

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "web",
            }),
            "missing field `webId`",
        );

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "web",
                "webId": web_id,
                "additional": "unexpected",
            }),
            "unknown field `additional`, expected `webId`",
        );
    }
}
