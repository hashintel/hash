use core::fmt;

#[cfg(feature = "postgres")]
use postgres_types::FromSql;
#[cfg(feature = "postgres")]
use postgres_types::ToSql;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(feature = "postgres", derive(FromSql, ToSql), postgres(transparent))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[repr(transparent)]
pub struct OwnedById(Uuid);

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
