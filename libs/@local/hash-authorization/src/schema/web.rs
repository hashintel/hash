use std::{error::Error, fmt};

use graph_types::{
    account::{AccountGroupId, AccountId},
    web::WebId,
};
use serde::{Deserialize, Serialize};

use crate::zanzibar::{types::Resource, Affiliation, Permission, Relation};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum WebNamespace {
    #[serde(rename = "graph/web")]
    Web,
}

impl Resource for WebId {
    type Id = Self;
    type Kind = WebNamespace;

    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, impl Error> {
        match kind {
            WebNamespace::Web => Ok::<_, !>(id),
        }
    }

    fn into_parts(self) -> (Self::Kind, Self::Id) {
        (WebNamespace::Web, self)
    }

    fn to_parts(&self) -> (Self::Kind, Self::Id) {
        Resource::into_parts(*self)
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
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
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
