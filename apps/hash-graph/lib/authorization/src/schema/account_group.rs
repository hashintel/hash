use std::fmt;

use graph_types::account::AccountGroupId;
use serde::{Deserialize, Serialize};

use crate::zanzibar::{Affiliation, Permission, Relation, Resource};

impl Resource for AccountGroupId {
    type Id = Self;

    fn namespace() -> &'static str {
        "graph/account_group"
    }

    fn id(&self) -> &Self::Id {
        self
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccountGroupRelation {
    DirectAdmin,
    DirectMember,
}

impl fmt::Display for AccountGroupRelation {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

impl Affiliation<AccountGroupId> for AccountGroupRelation {}
impl Relation<AccountGroupId> for AccountGroupRelation {}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccountGroupPermission {
    AddAdmin,
    RemoveAdmin,
    AddMember,
    RemoveMember,

    Member,
}

impl fmt::Display for AccountGroupPermission {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

impl Affiliation<AccountGroupId> for AccountGroupPermission {}
impl Permission<AccountGroupId> for AccountGroupPermission {}
