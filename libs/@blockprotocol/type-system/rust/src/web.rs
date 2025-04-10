use core::fmt;

#[cfg(feature = "postgres")]
use postgres_types::FromSql;
#[cfg(feature = "postgres")]
use postgres_types::ToSql;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::knowledge::entity::id::EntityUuid;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "postgres", derive(FromSql, ToSql), postgres(transparent))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[repr(transparent)]
pub struct WebId(
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "Brand<ActorEntityUuid | ActorGroupEntityUuid, \"WebId\">")
    )]
    EntityUuid,
);

impl WebId {
    #[must_use]
    pub const fn new(uuid: EntityUuid) -> Self {
        Self(uuid)
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        self.0.as_uuid()
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0.into_uuid()
    }
}

impl fmt::Display for WebId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::ToSql, postgres_types::FromSql),
    postgres(transparent)
)]
#[repr(transparent)]
pub struct ActorGroupEntityUuid(
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "Brand<EntityUuid, \"ActorGroupEntityUuid\">")
    )]
    EntityUuid,
);

impl ActorGroupEntityUuid {
    #[must_use]
    pub const fn new(actor_group_id: EntityUuid) -> Self {
        Self(actor_group_id)
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        self.0.as_uuid()
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0.into_uuid()
    }
}

impl fmt::Display for ActorGroupEntityUuid {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl From<WebId> for ActorGroupEntityUuid {
    fn from(web_id: WebId) -> Self {
        Self::new(EntityUuid::new(web_id.into_uuid()))
    }
}
