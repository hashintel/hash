use alloc::sync::Arc;
use core::{error::Error, str::FromStr as _};
use std::sync::LazyLock;

use cedar_policy_core::ast;
use error_stack::Report;
use hash_graph_types::{knowledge::entity::EntityUuid, owned_by_id::OwnedById};
use uuid::Uuid;

use crate::policies::cedar::CedarEntityId;

impl CedarEntityId for EntityUuid {
    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Entity"]));
        &ENTITY_TYPE
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new(self.to_string())
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Report<impl Error + Send + Sync + 'static>> {
        Ok(Self::new(Uuid::from_str(eid.as_ref())?))
    }
}

#[derive(Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(untagged, rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum EntityResourceConstraint {
    #[expect(
        clippy::empty_enum_variants_with_brackets,
        reason = "Serialization is different"
    )]
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

impl EntityResourceConstraint {
    #[must_use]
    pub const fn has_slot(&self) -> bool {
        match self {
            Self::Any {}
            | Self::Exact {
                entity_uuid: Some(_),
            }
            | Self::Web { web_id: Some(_) } => false,
            Self::Exact { entity_uuid: None } | Self::Web { web_id: None } => true,
        }
    }

    #[must_use]
    pub(crate) fn to_cedar(&self) -> ast::ResourceConstraint {
        match self {
            Self::Any {} => {
                ast::ResourceConstraint::is_entity_type(Arc::clone(EntityUuid::entity_type()))
            }
            Self::Exact { entity_uuid } => entity_uuid
                .map_or_else(ast::ResourceConstraint::is_eq_slot, |entity_uuid| {
                    ast::ResourceConstraint::is_eq(Arc::new(entity_uuid.to_euid()))
                }),
            Self::Web { web_id } => web_id.map_or_else(
                || {
                    ast::ResourceConstraint::is_entity_type_in_slot(Arc::clone(
                        EntityUuid::entity_type(),
                    ))
                },
                |web_id| {
                    ast::ResourceConstraint::is_entity_type_in(
                        Arc::clone(EntityUuid::entity_type()),
                        Arc::new(web_id.to_euid()),
                    )
                },
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use core::error::Error;

    use hash_graph_types::{knowledge::entity::EntityUuid, owned_by_id::OwnedById};
    use serde_json::json;
    use uuid::Uuid;

    use super::EntityResourceConstraint;
    use crate::{
        policies::{ResourceConstraint, resource::tests::check_resource},
        test_utils::check_deserialization_error,
    };

    #[test]
    fn constraint_any() -> Result<(), Box<dyn Error>> {
        check_resource(
            &ResourceConstraint::Entity(EntityResourceConstraint::Any {}),
            json!({
                "type": "entity"
            }),
            "resource is HASH::Entity",
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "entity",
                "additional": "unexpected"
            }),
            "data did not match any variant of untagged enum EntityResourceConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn constraint_exact() -> Result<(), Box<dyn Error>> {
        let entity_uuid = EntityUuid::new(Uuid::new_v4());
        check_resource(
            &ResourceConstraint::Entity(EntityResourceConstraint::Exact {
                entity_uuid: Some(entity_uuid),
            }),
            json!({
                "type": "entity",
                "entityUuid": entity_uuid,
            }),
            format!(r#"resource == HASH::Entity::"{entity_uuid}""#),
        )?;

        check_resource(
            &ResourceConstraint::Entity(EntityResourceConstraint::Exact { entity_uuid: None }),
            json!({
                "type": "entity",
                "entityUuid": null,
            }),
            "resource == ?resource",
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "entity",
                "webId": OwnedById::new(Uuid::new_v4()),
                "entityUuid": entity_uuid,
            }),
            "data did not match any variant of untagged enum EntityResourceConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn constraint_in_web() -> Result<(), Box<dyn Error>> {
        let web_id = OwnedById::new(Uuid::new_v4());
        check_resource(
            &ResourceConstraint::Entity(EntityResourceConstraint::Web {
                web_id: Some(web_id),
            }),
            json!({
                "type": "entity",
                "webId": web_id,
            }),
            format!(r#"resource is HASH::Entity in HASH::Web::"{web_id}""#),
        )?;

        check_resource(
            &ResourceConstraint::Entity(EntityResourceConstraint::Web { web_id: None }),
            json!({
                "type": "entity",
                "webId": null,
            }),
            "resource is HASH::Entity in ?resource",
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "entity",
                "webId": OwnedById::new(Uuid::new_v4()),
                "entityUuid": EntityUuid::new(Uuid::new_v4()),
            }),
            "data did not match any variant of untagged enum EntityResourceConstraint",
        )?;

        Ok(())
    }
}
