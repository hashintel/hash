use std::fmt;

use postgres_types::ToSql;
use serde::{Deserialize, Serialize};
use type_system::uri::VersionedUri;
use utoipa::Component;

use super::EntityId;

/// A Link between a source and a target entity identified by [`EntityId`]s.
///
/// The link is described by a link type [`VersionedUri`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Component)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    source_entity_id: EntityId,
    target_entity_id: EntityId,
    #[component(value_type = String)]
    link_type_uri: VersionedUri,
}

impl Link {
    #[must_use]
    pub const fn new(
        source_entity_id: EntityId,
        target_entity_id: EntityId,
        link_type_uri: VersionedUri,
    ) -> Self {
        Self {
            source_entity_id,
            target_entity_id,
            link_type_uri,
        }
    }

    #[must_use]
    pub const fn source_entity(&self) -> EntityId {
        self.source_entity_id
    }

    #[must_use]
    pub const fn target_entity(&self) -> EntityId {
        self.target_entity_id
    }

    #[must_use]
    pub const fn link_type_uri(&self) -> &VersionedUri {
        &self.link_type_uri
    }
}

impl fmt::Display for Link {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{:?}", &self)
    }
}

/// Specifies whether or not a link is active.
#[derive(Debug, Clone, Copy)]
#[non_exhaustive]
pub enum LinkStatus {
    Active,
    Inactive,
}

impl LinkStatus {
    #[must_use]
    const fn active(self) -> bool {
        match self {
            LinkStatus::Active => true,
            LinkStatus::Inactive => false,
        }
    }
}

impl ToSql for LinkStatus {
    fn to_sql(
        &self,
        ty: &postgres_types::Type,
        out: &mut postgres_types::private::BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn std::error::Error + Sync + Send>>
    where
        Self: Sized,
    {
        self.active().to_sql(ty, out)
    }

    fn accepts(ty: &postgres_types::Type) -> bool
    where
        Self: Sized,
    {
        bool::accepts(ty)
    }

    fn to_sql_checked(
        &self,
        ty: &postgres_types::Type,
        out: &mut postgres_types::private::BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn std::error::Error + Sync + Send>> {
        self.active().to_sql_checked(ty, out)
    }
}
