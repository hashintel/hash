use std::{error::Error, fmt};

use graph_types::account::AccountGroupId;
use serde::{Deserialize, Serialize};

use crate::zanzibar::{
    types::{object::Object, subject::Subject},
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

impl Subject for (AccountGroupId, Option<AccountGroupRelation>) {
    type Object = AccountGroupId;
    type Relation = AccountGroupRelation;

    fn new(
        object: Self::Object,
        relation: Option<AccountGroupRelation>,
    ) -> Result<Self, impl Error> {
        Ok::<_, !>((object, relation))
    }

    fn object(&self) -> &Self::Object {
        &self.0
    }

    fn relation(&self) -> Option<&Self::Relation> {
        self.1.as_ref()
    }
}

impl Subject for (AccountGroupId, AccountGroupPermission) {
    type Object = AccountGroupId;
    type Relation = AccountGroupPermission;

    fn new(
        object: Self::Object,
        relation: Option<AccountGroupPermission>,
    ) -> Result<Self, impl Error> {
        if let Some(relation) = relation {
            return Ok((object, relation));
        }
        // TODO: This should be a real error type
        Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            "Permission not specified",
        ))
    }

    fn object(&self) -> &Self::Object {
        &self.0
    }

    fn relation(&self) -> Option<&Self::Relation> {
        Some(&self.1)
    }
}
