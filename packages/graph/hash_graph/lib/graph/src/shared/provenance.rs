use core::fmt;

use serde::{Deserialize, Serialize};
use utoipa::{openapi::Schema, ToSchema};
use uuid::Uuid;

use crate::shared::identifier::account::AccountId;

macro_rules! define_provenance_id {
    ($name:tt) => {
        #[derive(
            Debug, Copy, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize,
        )]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ProvenanceMetadata {
    created_by_id: CreatedById,
    updated_by_id: UpdatedById,
}

impl ProvenanceMetadata {
    #[must_use]
    pub const fn new(created_by_id: CreatedById, updated_by_id: UpdatedById) -> Self {
        Self {
            created_by_id,
            updated_by_id,
        }
    }

    #[must_use]
    pub const fn created_by_id(&self) -> CreatedById {
        self.created_by_id
    }

    #[must_use]
    pub const fn updated_by_id(&self) -> UpdatedById {
        self.updated_by_id
    }
}
