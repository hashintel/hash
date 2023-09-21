use std::fmt;

use graph_types::{
    account::{AccountGroupId, AccountId},
    web::WebId,
};
use serde::{Deserialize, Serialize};

use crate::zanzibar::{Affiliation, Permission, Relation, Resource};

#[derive(Debug, Copy, Clone)]
pub enum OwnerId {
    Account(AccountId),
    AccountGroup(AccountGroupId),
}

impl From<AccountId> for OwnerId {
    fn from(account_id: AccountId) -> Self {
        Self::Account(account_id)
    }
}

impl From<AccountGroupId> for OwnerId {
    fn from(account_group_id: AccountGroupId) -> Self {
        Self::AccountGroup(account_group_id)
    }
}

impl Resource for WebId {
    type Id = Self;

    fn namespace() -> &'static str {
        "graph/web"
    }

    fn id(&self) -> &Self::Id {
        self
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WebRelation {
    DirectOwner,
}

impl fmt::Display for WebRelation {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

impl Affiliation<WebId> for WebRelation {}

impl Relation<WebId> for WebRelation {}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WebPermission {
    CreateEntity,
}

impl fmt::Display for WebPermission {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

impl Affiliation<WebId> for WebPermission {}

impl Permission<WebId> for WebPermission {}
