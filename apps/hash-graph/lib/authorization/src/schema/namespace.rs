use std::fmt;

use graph_types::{
    account::{AccountGroupId, AccountId},
    provenance::OwnedById,
};
use serde::{Deserialize, Serialize};

use crate::zanzibar::{Affiliation, Permission, Relation, Resource};

#[derive(Debug, Copy, Clone)]
pub enum Owner {
    Account(AccountId),
    AccountGroup(AccountGroupId),
}

impl Resource for OwnedById {
    type Id = Self;

    fn namespace() -> &'static str {
        "graph/namespace"
    }

    fn id(&self) -> &Self::Id {
        self
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NamespaceRelation {
    DirectOwner,
}

impl fmt::Display for NamespaceRelation {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

impl Affiliation<OwnedById> for NamespaceRelation {}
impl Relation<OwnedById> for NamespaceRelation {}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NamespacePermission {
    CreateEntity,
}

impl fmt::Display for NamespacePermission {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

impl Affiliation<OwnedById> for NamespacePermission {}
impl Permission<OwnedById> for NamespacePermission {}
