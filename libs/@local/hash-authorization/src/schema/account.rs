use std::error::Error;

use graph_types::account::AccountId;
use serde::{Deserialize, Serialize};

use crate::{
    zanzibar::types::{Object, Subject},
    AccountOrPublic,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AccountNamespace {
    #[serde(rename = "graph/account")]
    Account,
}

impl Object for AccountId {
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
        Object::into_parts(*self)
    }
}

impl Subject for AccountId {
    type Object = Self;
    type Relation = !;

    fn from_parts(object: Self::Object, _relation: Option<!>) -> Result<Self, impl Error> {
        Ok::<_, !>(object)
    }

    fn into_parts(self) -> (Self::Object, Option<Self::Relation>) {
        (self, None)
    }

    fn to_parts(&self) -> (Self::Object, Option<Self::Relation>) {
        Subject::into_parts(*self)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PublicAccess {
    #[serde(rename = "*")]
    Public,
}

impl Object for PublicAccess {
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
        Object::into_parts(*self)
    }
}

impl Subject for PublicAccess {
    type Object = Self;
    type Relation = !;

    fn from_parts(object: Self::Object, _relation: Option<!>) -> Result<Self, impl Error> {
        Ok::<_, !>(object)
    }

    fn into_parts(self) -> (Self::Object, Option<Self::Relation>) {
        (self, None)
    }

    fn to_parts(&self) -> (Self::Object, Option<Self::Relation>) {
        Subject::into_parts(*self)
    }
}

impl Object for AccountOrPublic {
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
        Object::into_parts(*self)
    }
}

impl Subject for AccountOrPublic {
    type Object = Self;
    type Relation = !;

    fn from_parts(object: Self::Object, _relation: Option<!>) -> Result<Self, impl Error> {
        Ok::<_, !>(object)
    }

    fn into_parts(self) -> (Self::Object, Option<Self::Relation>) {
        (self, None)
    }

    fn to_parts(&self) -> (Self::Object, Option<Self::Relation>) {
        Subject::into_parts(*self)
    }
}
