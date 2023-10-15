use std::error::Error;

use graph_types::account::AccountId;
use serde::{Deserialize, Serialize};

use crate::{
    zanzibar::types::{object::Object, subject::Subject},
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

    fn new(namespace: Self::Namespace, id: Self::Id) -> Result<Self, impl Error> {
        match namespace {
            AccountNamespace::Account => Ok::<_, !>(id),
        }
    }

    fn namespace(&self) -> &Self::Namespace {
        &AccountNamespace::Account
    }

    fn id(&self) -> &Self::Id {
        self
    }
}

impl Subject for AccountId {
    type Object = Self;
    type Relation = !;

    fn new(object: Self::Object, _relation: Option<!>) -> Result<Self, impl Error> {
        Ok::<_, !>(object)
    }

    fn object(&self) -> &Self::Object {
        self
    }

    fn relation(&self) -> Option<&Self::Relation> {
        None
    }
}

#[derive(Debug, Copy, Clone, Serialize, Deserialize)]
pub enum PublicAccess {
    #[serde(rename = "*")]
    Public,
}

impl Object for PublicAccess {
    type Id = Self;
    type Namespace = AccountNamespace;

    fn new(namespace: Self::Namespace, id: Self::Id) -> Result<Self, impl Error> {
        match namespace {
            AccountNamespace::Account => Ok::<_, !>(id),
        }
    }

    fn namespace(&self) -> &Self::Namespace {
        &AccountNamespace::Account
    }

    fn id(&self) -> &Self::Id {
        self
    }
}

impl Subject for PublicAccess {
    type Object = Self;
    type Relation = !;

    fn new(object: Self::Object, _relation: Option<!>) -> Result<Self, impl Error> {
        Ok::<_, !>(object)
    }

    fn object(&self) -> &Self::Object {
        self
    }

    fn relation(&self) -> Option<&Self::Relation> {
        None
    }
}

impl Object for AccountOrPublic {
    type Id = Self;
    type Namespace = AccountNamespace;

    fn new(namespace: Self::Namespace, id: Self::Id) -> Result<Self, impl Error> {
        match namespace {
            AccountNamespace::Account => Ok::<_, !>(id),
        }
    }

    fn namespace(&self) -> &Self::Namespace {
        &AccountNamespace::Account
    }

    fn id(&self) -> &Self::Id {
        self
    }
}

impl Subject for AccountOrPublic {
    type Object = Self;
    type Relation = !;

    fn new(object: Self::Object, _relation: Option<!>) -> Result<Self, impl Error> {
        Ok::<_, !>(object)
    }

    fn object(&self) -> &Self::Object {
        self
    }

    fn relation(&self) -> Option<&Self::Relation> {
        None
    }
}
