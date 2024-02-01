#[cfg(feature = "postgres")]
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};

use crate::knowledge::entity::EntityId;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[repr(transparent)]
#[cfg_attr(feature = "postgres", derive(FromSql, ToSql), postgres(transparent))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
pub struct LinkOrder(i32);

impl LinkOrder {
    #[must_use]
    pub const fn new(order: i32) -> Self {
        Self(order)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields)]
pub struct EntityLinkOrder {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        rename = "leftToRightOrder"
    )]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub left_to_right: Option<LinkOrder>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        rename = "rightToLeftOrder"
    )]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub right_to_left: Option<LinkOrder>,
}

/// The associated information for 'Link' entities
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct LinkData {
    pub left_entity_id: EntityId,
    pub right_entity_id: EntityId,
    // TODO: Remove link ordering
    //   see https://linear.app/hash/issue/H-162
    #[serde(flatten)]
    pub order: EntityLinkOrder,
}
