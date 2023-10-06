use std::fmt;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    account::{AccountGroupId, AccountId},
    provenance::OwnedById,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct WebId(Uuid);

impl From<AccountId> for WebId {
    fn from(account_id: AccountId) -> Self {
        Self(account_id.into_uuid())
    }
}

impl From<AccountGroupId> for WebId {
    fn from(account_group_id: AccountGroupId) -> Self {
        Self(account_group_id.into_uuid())
    }
}

impl From<OwnedById> for WebId {
    fn from(owned_by_id: OwnedById) -> Self {
        Self(owned_by_id.into_uuid())
    }
}

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
