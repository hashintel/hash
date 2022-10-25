use core::fmt;

use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};
use utoipa::{openapi::Schema, ToSchema};
use uuid::Uuid;

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema, FromSql, ToSql,
)]
#[repr(transparent)]
#[postgres(transparent)]
pub struct AccountId(Uuid);

impl AccountId {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

impl fmt::Display for AccountId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{}", &self.0)
    }
}

macro_rules! define_provenance_id {
    ($name:tt) => {
        #[derive(
            Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, FromSql, ToSql,
        )]
        #[repr(transparent)]
        #[postgres(transparent)]
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
        }

        impl fmt::Display for $name {
            fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(fmt, "{}", &self.0)
            }
        }

        impl ToSchema for $name {
            fn schema() -> Schema {
                AccountId::schema()
            }
        }
    };
}

define_provenance_id!(OwnedById);
define_provenance_id!(CreatedById);
define_provenance_id!(UpdatedById);
define_provenance_id!(RemovedById);
