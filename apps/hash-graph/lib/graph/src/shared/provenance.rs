use core::fmt;

use serde::{Deserialize, Serialize};
use tokio_postgres::types::{FromSql, ToSql};
use utoipa::{openapi, ToSchema};
use uuid::Uuid;

use crate::identifier::account::AccountId;

macro_rules! define_provenance_id {
    ($name:tt) => {
        #[derive(
            Debug,
            Copy,
            Clone,
            PartialEq,
            Eq,
            Hash,
            PartialOrd,
            Ord,
            Serialize,
            Deserialize,
            FromSql,
            ToSql,
        )]
        #[postgres(transparent)]
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

        impl ToSchema<'_> for $name {
            fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
                (stringify!($name), AccountId::schema().1)
            }
        }
    };
}

define_provenance_id!(OwnedById);
define_provenance_id!(UpdatedById);

// TODO: Make fields `pub` when `#[feature(mut_restriction)]` is available.
//   see https://github.com/rust-lang/rust/issues/105077
//   see https://app.asana.com/0/0/1203977361907407/f
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ProvenanceMetadata {
    updated_by_id: UpdatedById,
}

impl ProvenanceMetadata {
    #[must_use]
    pub const fn new(updated_by_id: UpdatedById) -> Self {
        Self { updated_by_id }
    }

    #[must_use]
    pub const fn updated_by_id(&self) -> UpdatedById {
        self.updated_by_id
    }
}
