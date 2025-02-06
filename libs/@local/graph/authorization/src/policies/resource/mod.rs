#![expect(
    clippy::empty_enum,
    reason = "serde::Deseiriealize does not use the never-type"
)]

use alloc::sync::Arc;
use core::{error::Error, str::FromStr as _};
use std::sync::LazyLock;

use cedar_policy_core::ast;
use error_stack::Report;
use uuid::Uuid;

pub use self::entity::EntityResourceConstraint;
use crate::policies::cedar::CedarEntityId;
mod entity;

use hash_graph_types::owned_by_id::OwnedById;

impl CedarEntityId for OwnedById {
    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Web"]));
        &ENTITY_TYPE
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new(self.to_string())
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Report<impl Error + Send + Sync + 'static>> {
        Ok(Self::new(Uuid::from_str(eid.as_ref())?))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ResourceConstraint {
    #[expect(
        clippy::empty_enum_variants_with_brackets,
        reason = "Serialization is different"
    )]
    Global {},
    Web {
        #[serde(deserialize_with = "Option::deserialize")]
        web_id: Option<OwnedById>,
    },
    Entity(EntityResourceConstraint),
}

impl ResourceConstraint {
    #[must_use]
    pub const fn has_slot(&self) -> bool {
        match self {
            Self::Global {} | Self::Web { web_id: Some(_) } => false,
            Self::Web { web_id: None } => true,
            Self::Entity(entity) => entity.has_slot(),
        }
    }
}

#[cfg(test)]
mod tests {
    use cedar_policy_core::ast;
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

        let has_slot = constraint.has_slot();
        let cedar_policy = ast::ResourceConstraint::from(constraint);
        assert_eq!(cedar_policy.to_string(), cedar_string.as_ref());
        if !has_slot {
            ResourceConstraint::try_from(cedar_policy)
                .expect("should be able to convert Cedar policy back");
        }
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
                web_id: Some(web_id),
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
