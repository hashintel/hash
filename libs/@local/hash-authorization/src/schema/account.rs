use std::error::Error;

use graph_types::account::AccountId;
use serde::{Deserialize, Serialize};

use crate::zanzibar::{types::object::Object, Resource};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AccountNamespace {
    #[serde(rename = "graph/account")]
    Account,
}

impl Resource for AccountId {
    type Id = Self;

    fn namespace() -> &'static str {
        "graph/account"
    }

    fn id(&self) -> Self::Id {
        *self
    }
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

impl Resource for PublicAccess {
    type Id = &'static str;

    fn namespace() -> &'static str {
        <AccountId as Resource>::namespace()
    }

    fn id(&self) -> Self::Id {
        "*"
    }
}
