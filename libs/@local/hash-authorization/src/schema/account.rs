use std::error::Error;

use graph_types::account::AccountId;
use serde::{Deserialize, Serialize};

use crate::zanzibar::types::{Resource, Subject};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AccountNamespace {
    #[serde(rename = "graph/account")]
    Account,
}

impl Resource for AccountId {
    type Id = Self;
    type Namespace = AccountNamespace;

    fn from_parts(namespace: Self::Namespace, id: Self::Id) -> Result<Self, impl Error> {
        match namespace {
            AccountNamespace::Account => Ok::<_, !>(id),
        }
    }

    fn into_parts(self) -> (Self::Namespace, Self::Id) {
        (AccountNamespace::Account, self)
    }

    fn to_parts(&self) -> (Self::Namespace, Self::Id) {
        Resource::into_parts(*self)
    }
}

impl Subject for AccountId {
    type Relation = !;
    type Resource = Self;

    fn from_parts(resource: Self::Resource, _relation: Option<!>) -> Result<Self, impl Error> {
        Ok::<_, !>(resource)
    }

    fn into_parts(self) -> (Self::Resource, Option<Self::Relation>) {
        (self, None)
    }

    fn to_parts(&self) -> (Self::Resource, Option<Self::Relation>) {
        Subject::into_parts(*self)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PublicAccess {
    #[serde(rename = "*")]
    Public,
}

impl Resource for PublicAccess {
    type Id = Self;
    type Namespace = AccountNamespace;

    fn from_parts(namespace: Self::Namespace, id: Self::Id) -> Result<Self, impl Error> {
        match namespace {
            AccountNamespace::Account => Ok::<_, !>(id),
        }
    }

    fn into_parts(self) -> (Self::Namespace, Self::Id) {
        (AccountNamespace::Account, self)
    }

    fn to_parts(&self) -> (Self::Namespace, Self::Id) {
        Resource::into_parts(*self)
    }
}

impl Subject for PublicAccess {
    type Relation = !;
    type Resource = Self;

    fn from_parts(resource: Self::Resource, _relation: Option<!>) -> Result<Self, impl Error> {
        Ok::<_, !>(resource)
    }

    fn into_parts(self) -> (Self::Resource, Option<Self::Relation>) {
        (self, None)
    }

    fn to_parts(&self) -> (Self::Resource, Option<Self::Relation>) {
        Subject::into_parts(*self)
    }
}
