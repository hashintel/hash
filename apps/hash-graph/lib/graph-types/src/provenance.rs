use core::fmt;

#[cfg(feature = "postgres")]
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};
#[cfg(feature = "utoipa")]
use utoipa::{openapi, ToSchema};
use uuid::Uuid;

use crate::account::AccountId;

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
            pub const fn as_uuid(self) -> Uuid {
                self.0.as_uuid()
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

define_provenance_id!(RecordCreatedById);
define_provenance_id!(RecordArchivedById);

// TODO: Restrict field mutation when `#[feature(mut_restriction)]` is available.
//   see https://github.com/rust-lang/rust/issues/105077
//   see https://app.asana.com/0/0/1203977361907407/f
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ProvenanceMetadata {
    pub record_created_by_id: RecordCreatedById,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub record_archived_by_id: Option<RecordArchivedById>,
}

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
    pub const fn as_uuid(self) -> Uuid {
        self.0
    }
}

impl fmt::Display for OwnedById {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}
