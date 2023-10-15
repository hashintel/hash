use std::{error::Error, fmt};

use graph_types::account::AccountGroupId;
use serde::{Deserialize, Serialize};

use crate::zanzibar::{types::object::Object, Affiliation, Permission, Relation, Resource};

impl Resource for AccountGroupId {
    type Id = Self;

    fn namespace() -> &'static str {
        "graph/account_group"
    }

    fn id(&self) -> Self::Id {
        *self
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AccountGroupNamespace {
    #[serde(rename = "graph/account_group")]
    AccountGroup,
}

impl Object for AccountGroupId {
    type Id = Self;
    type Namespace = AccountGroupNamespace;

    fn new(namespace: Self::Namespace, id: Self::Id) -> Result<Self, impl Error> {
        match namespace {
            AccountGroupNamespace::AccountGroup => Ok::<_, !>(id),
        }
    }

    fn namespace(&self) -> &Self::Namespace {
        &AccountGroupNamespace::AccountGroup
    }

    fn id(&self) -> &Self::Id {
        self
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccountGroupRelation {
    DirectOwner,
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

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccountGroupPermission {
    AddOwner,
    RemoveOwner,
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
