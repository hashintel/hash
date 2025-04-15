use core::fmt;

#[cfg(feature = "postgres")]
use postgres_types::FromSql;
#[cfg(feature = "postgres")]
use postgres_types::ToSql;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::provenance::ActorEntityUuid;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "postgres", derive(FromSql, ToSql), postgres(transparent))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[repr(transparent)]
pub struct WebId(
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "Brand<ActorEntityUuid | ActorGroupId, \"WebId\">")
    )]
    Uuid,
);

impl WebId {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        &self.0
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0
    }
}

impl fmt::Display for WebId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl From<ActorEntityUuid> for WebId {
    fn from(actor_id: ActorEntityUuid) -> Self {
        Self::new(actor_id.into_uuid())
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
pub struct ActorGroupId(
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "Brand<string, \"ActorGroupId\">")
    )]
    Uuid,
);

impl ActorGroupId {
    #[must_use]
    pub const fn new(actor_id: Uuid) -> Self {
        Self(actor_id)
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        &self.0
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0
    }
}

impl fmt::Display for ActorGroupId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{}", &self.0)
    }
}

impl From<ActorGroupId> for WebId {
    fn from(account_group_id: ActorGroupId) -> Self {
        Self::new(account_group_id.into_uuid())
    }
}
