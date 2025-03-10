use core::fmt;

#[cfg(feature = "postgres")]
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};
use type_system::web::OwnedById;
#[cfg(feature = "utoipa")]
use utoipa::{ToSchema, openapi};
use uuid::Uuid;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(feature = "postgres", derive(FromSql, ToSql), postgres(transparent))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[repr(transparent)]
pub struct AccountId(Uuid);

impl AccountId {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        &self.0
    }
}

impl fmt::Display for AccountId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl From<AccountId> for OwnedById {
    fn from(account_id: AccountId) -> Self {
        Self::new(account_id.into_uuid())
    }
}
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(feature = "postgres", derive(FromSql, ToSql), postgres(transparent))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[repr(transparent)]
pub struct AccountGroupId(Uuid);

impl AccountGroupId {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        &self.0
    }
}

impl fmt::Display for AccountGroupId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl From<AccountGroupId> for OwnedById {
    fn from(account_group_id: AccountGroupId) -> Self {
        Self::new(account_group_id.into_uuid())
    }
}

macro_rules! define_provenance_id {
    ($name:tt) => {
        #[derive(
            Debug, Copy, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize,
        )]
        #[cfg_attr(feature = "postgres", derive(FromSql, ToSql), postgres(transparent))]
        #[repr(transparent)]
        pub struct $name(AccountId);

        impl $name {
            #[must_use]
            pub const fn new(account_id: AccountId) -> Self {
                Self(account_id)
            }

            #[must_use]
            pub const fn as_account_id(self) -> AccountId {
                self.0
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

        impl fmt::Display for $name {
            fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(fmt, "{}", &self.0)
            }
        }

        #[cfg(feature = "utoipa")]
        impl ToSchema<'_> for $name {
            fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
                (stringify!($name), AccountId::schema().1)
            }
        }
    };
}

define_provenance_id!(CreatedById);
define_provenance_id!(EditionArchivedById);
define_provenance_id!(EditionCreatedById);
