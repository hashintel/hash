use std::{error::Error, fmt};

use graph_types::{
    account::{AccountGroupId, AccountId},
    web::WebId,
};
use serde::{Deserialize, Serialize};

use crate::zanzibar::{types::object::Object, Affiliation, Permission, Relation};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum WebNamespace {
    #[serde(rename = "graph/web")]
    Web,
}

impl Object for WebId {
    type Id = Self;
    type Namespace = WebNamespace;

    fn new(namespace: Self::Namespace, id: Self::Id) -> Result<Self, impl Error> {
        match namespace {
            WebNamespace::Web => Ok::<_, !>(id),
        }
    }

    fn namespace(&self) -> &Self::Namespace {
        &WebNamespace::Web
    }

    fn id(&self) -> &Self::Id {
        self
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "id")]
pub enum OwnerId {
    Account(AccountId),
    AccountGroupMembers(AccountGroupId),
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
