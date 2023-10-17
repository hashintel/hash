use std::fmt;

use graph_types::{
    account::{AccountGroupId, AccountId},
    web::WebId,
};
use serde::{Deserialize, Serialize};

use crate::zanzibar::{Affiliation, Permission, Relation, Resource};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "id")]
pub enum OwnerId {
    Account(AccountId),
    AccountGroupMembers(AccountGroupId),
}

impl Resource for WebId {
    type Id = Self;

    fn namespace() -> &'static str {
        "graph/web"
    }

    fn id(&self) -> Self::Id {
        *self
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WebRelation {
    DirectOwner,
    DirectEditor,
}

impl fmt::Display for WebRelation {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

impl Affiliation<WebId> for WebRelation {}

impl Relation<WebId> for WebRelation {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
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
