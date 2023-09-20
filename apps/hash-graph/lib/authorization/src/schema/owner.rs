use std::fmt;

use graph_types::{
    account::{AccountGroupId, AccountId},
    provenance::OwnedById,
};
use serde::{Deserialize, Serialize};

use crate::zanzibar::{Affiliation, Permission, Relation, Resource};

#[derive(Debug, Copy, Clone)]
pub enum OwnerId {
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
pub enum OwnerRelation {
    DirectOwner,
}

impl fmt::Display for OwnerRelation {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

impl Affiliation<OwnedById> for OwnerRelation {}
impl Relation<OwnedById> for OwnerRelation {}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OwnerPermission {
    CreateEntity,
}

impl fmt::Display for OwnerPermission {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

impl Affiliation<OwnedById> for OwnerPermission {}
impl Permission<OwnedById> for OwnerPermission {}
