use alloc::{borrow::Cow, sync::Arc};
use core::{error::Error, fmt, iter, str::FromStr as _};
use std::sync::LazyLock;

use cedar_policy_core::{ast, extensions::Extensions};
use error_stack::Report;
use hash_graph_types::owned_by_id::OwnedById;
use smol_str::SmolStr;
use type_system::url::VersionedUrl;

use crate::policies::cedar::CedarEntityId;

#[derive(
    Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, serde::Serialize, serde::Deserialize,
)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[repr(transparent)]
pub struct EntityTypeId(VersionedUrl);

impl EntityTypeId {
    #[must_use]
    pub const fn new(url: VersionedUrl) -> Self {
        Self(url)
    }

    #[must_use]
    pub fn into_url(self) -> VersionedUrl {
        self.0
    }

    #[must_use]
    pub const fn as_url(&self) -> &VersionedUrl {
        &self.0
    }
}

impl fmt::Display for EntityTypeId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

#[derive(Debug)]
pub struct EntityTypeResource<'a> {
    pub web_id: OwnedById,
    pub id: Cow<'a, EntityTypeId>,
}

impl EntityTypeResource<'_> {
    pub(crate) fn to_cedar_entity(&self) -> ast::Entity {
        ast::Entity::new(
            self.id.to_euid(),
            [
                (
                    SmolStr::new_static("base_url"),
                    ast::RestrictedExpr::val(self.id.as_url().base_url.to_string()),
                ),
                (
                    SmolStr::new_static("version"),
                    ast::RestrictedExpr::val(i64::from(self.id.as_url().version.inner())),
                ),
            ],
            iter::once(self.web_id.to_euid()).collect(),
            iter::empty(),
            Extensions::none(),
        )
        .expect("Entity type should be a valid Cedar entity")
    }
}

impl CedarEntityId for EntityTypeId {
    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["EntityType"]));
        &ENTITY_TYPE
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new(self.as_url().to_string())
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Report<impl Error + Send + Sync + 'static>> {
        Ok(Self::new(VersionedUrl::from_str(eid.as_ref())?))
    }
}

#[derive(Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(untagged, rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum EntityTypeResourceConstraint {
    #[expect(
        clippy::empty_enum_variants_with_brackets,
        reason = "Serialization is different"
    )]
    Any {},
    Exact {
        #[serde(deserialize_with = "Option::deserialize")]
        id: Option<EntityTypeId>,
    },
    Web {
        #[serde(deserialize_with = "Option::deserialize")]
        web_id: Option<OwnedById>,
    },
}

impl EntityTypeResourceConstraint {
    #[must_use]
    pub const fn has_slot(&self) -> bool {
        match self {
            Self::Any {} | Self::Exact { id: Some(_) } | Self::Web { web_id: Some(_) } => false,
            Self::Exact { id: None } | Self::Web { web_id: None } => true,
        }
    }

    #[must_use]
    pub(crate) fn to_cedar(&self) -> ast::ResourceConstraint {
        match self {
            Self::Any {} => {
                ast::ResourceConstraint::is_entity_type(Arc::clone(EntityTypeId::entity_type()))
            }
            Self::Exact { id } => id
                .as_ref()
                .map_or_else(ast::ResourceConstraint::is_eq_slot, |id| {
                    ast::ResourceConstraint::is_eq(Arc::new(id.to_euid()))
                }),
            Self::Web { web_id } => web_id.map_or_else(
                || {
                    ast::ResourceConstraint::is_entity_type_in_slot(Arc::clone(
                        EntityTypeId::entity_type(),
                    ))
                },
                |web_id| {
                    ast::ResourceConstraint::is_entity_type_in(
                        Arc::clone(EntityTypeId::entity_type()),
                        Arc::new(web_id.to_euid()),
                    )
                },
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use core::{error::Error, str::FromStr as _};

    use hash_graph_types::{knowledge::entity::EntityUuid, owned_by_id::OwnedById};
    use serde_json::json;
    use type_system::url::VersionedUrl;
    use uuid::Uuid;

    use super::{EntityTypeId, EntityTypeResourceConstraint};
    use crate::{
        policies::{ResourceConstraint, resource::tests::check_resource},
        test_utils::check_deserialization_error,
    };

    #[test]
    fn constraint_any() -> Result<(), Box<dyn Error>> {
        check_resource(
            ResourceConstraint::EntityType(EntityTypeResourceConstraint::Any {}),
            json!({
                "type": "entityType"
            }),
            "resource is HASH::EntityType",
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "entityType",
                "additional": "unexpected"
            }),
            "data did not match any variant of untagged enum EntityTypeResourceConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn constraint_exact() -> Result<(), Box<dyn Error>> {
        let entity_type_id = EntityTypeId::new(VersionedUrl::from_str(
            "https://hash.ai/@hash/types/entity-type/user/v/1",
        )?);

        check_resource(
            ResourceConstraint::EntityType(EntityTypeResourceConstraint::Exact {
                id: Some(entity_type_id.clone()),
            }),
            json!({
                "type": "entityType",
                "id": entity_type_id,
            }),
            format!(r#"resource == HASH::EntityType::"{entity_type_id}""#),
        )?;

        check_resource(
            ResourceConstraint::EntityType(EntityTypeResourceConstraint::Exact { id: None }),
            json!({
                "type": "entityType",
                "id": null,
            }),
            "resource == ?resource",
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "entityType",
                "webId": OwnedById::new(Uuid::new_v4()),
                "id": entity_type_id,
            }),
            "data did not match any variant of untagged enum EntityTypeResourceConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn constraint_in_web() -> Result<(), Box<dyn Error>> {
        let web_id = OwnedById::new(Uuid::new_v4());
        check_resource(
            ResourceConstraint::EntityType(EntityTypeResourceConstraint::Web {
                web_id: Some(web_id),
            }),
            json!({
                "type": "entityType",
                "webId": web_id,
            }),
            format!(r#"resource is HASH::EntityType in HASH::Web::"{web_id}""#),
        )?;

        check_resource(
            ResourceConstraint::EntityType(EntityTypeResourceConstraint::Web { web_id: None }),
            json!({
                "type": "entityType",
                "webId": null,
            }),
            "resource is HASH::EntityType in ?resource",
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "entityType",
                "webId": OwnedById::new(Uuid::new_v4()),
                "id": EntityUuid::new(Uuid::new_v4()),
            }),
            "data did not match any variant of untagged enum EntityTypeResourceConstraint",
        )?;

        Ok(())
    }
}
