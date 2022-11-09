use core::fmt;

use serde::{Deserialize, Serialize};
use utoipa::{openapi::Schema, ToSchema};

use crate::shared::identifier::account::AccountId;

macro_rules! define_provenance_id {
    ($name:tt) => {
        #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
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
