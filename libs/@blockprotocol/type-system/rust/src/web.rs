use core::fmt;

#[cfg(feature = "postgres")]
use postgres_types::FromSql;
#[cfg(feature = "postgres")]
use postgres_types::ToSql;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::provenance::UntaggedActorId;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "postgres", derive(FromSql, ToSql), postgres(transparent))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[repr(transparent)]
pub struct OwnedById(
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "Brand<UntaggedActorId | UntaggedTeamId, \"WebId\">")
    )]
    Uuid,
);

impl OwnedById {
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

impl fmt::Display for OwnedById {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl From<UntaggedActorId> for OwnedById {
    fn from(actor_id: UntaggedActorId) -> Self {
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
pub struct UntaggedTeamId(
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "Brand<string, \"UntaggedTeamId\">")
    )]
    Uuid,
);

impl UntaggedTeamId {
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

impl fmt::Display for UntaggedTeamId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{}", &self.0)
    }
}

impl From<UntaggedTeamId> for OwnedById {
    fn from(account_group_id: UntaggedTeamId) -> Self {
        Self::new(account_group_id.into_uuid())
    }
}
