use std::{error::Error, fmt};

use graph_types::account::AccountGroupId;
use serde::{Deserialize, Serialize};

use crate::zanzibar::{
    types::{Object, Subject},
    Affiliation, Permission, Relation,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AccountGroupNamespace {
    #[serde(rename = "graph/account_group")]
    AccountGroup,
}

impl Object for AccountGroupId {
    type Id = Self;
    type Namespace = AccountGroupNamespace;

    fn from_parts(namespace: Self::Namespace, id: Self::Id) -> Result<Self, impl Error> {
        match namespace {
            AccountGroupNamespace::AccountGroup => Ok::<_, !>(id),
        }
    }

    fn into_parts(self) -> (Self::Namespace, Self::Id) {
        (AccountGroupNamespace::AccountGroup, self)
    }

    fn to_parts(&self) -> (Self::Namespace, Self::Id) {
        Object::into_parts(*self)
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

impl Subject for (AccountGroupId, AccountGroupRelation) {
    type Object = AccountGroupId;
    type Relation = AccountGroupRelation;

    fn from_parts(
        object: Self::Object,
        relation: Option<Self::Relation>,
    ) -> Result<Self, impl Error> {
        relation.map(|relation| (object, relation)).ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::Other, "Permission not specified")
        })
    }

    fn into_parts(self) -> (Self::Object, Option<Self::Relation>) {
        (self.0, Some(self.1))
    }

    fn to_parts(&self) -> (Self::Object, Option<Self::Relation>) {
        Subject::into_parts(*self)
    }
}

impl Subject for (AccountGroupId, AccountGroupPermission) {
    type Object = AccountGroupId;
    type Relation = AccountGroupPermission;

    fn from_parts(
        object: Self::Object,
        relation: Option<Self::Relation>,
    ) -> Result<Self, impl Error> {
        relation.map(|relation| (object, relation)).ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::Other, "Permission not specified")
        })
    }

    fn into_parts(self) -> (Self::Object, Option<Self::Relation>) {
        (self.0, Some(self.1))
    }

    fn to_parts(&self) -> (Self::Object, Option<Self::Relation>) {
        Subject::into_parts(*self)
    }
}
