use std::error::Error;

use graph_types::account::{AccountGroupId, AccountId};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    schema::error::InvalidRelationship,
    zanzibar::{
        types::{Relationship, Resource},
        Affiliation, Permission, Relation,
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AccountGroupNamespace {
    #[serde(rename = "graph/account_group")]
    AccountGroup,
}

impl Resource for AccountGroupId {
    type Id = Self;
    type Kind = AccountGroupNamespace;

    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, impl Error> {
        match kind {
            AccountGroupNamespace::AccountGroup => Ok::<_, !>(id),
        }
    }

    fn into_parts(self) -> (Self::Kind, Self::Id) {
        (AccountGroupNamespace::AccountGroup, self)
    }

    fn to_parts(&self) -> (Self::Kind, Self::Id) {
        Resource::into_parts(*self)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccountGroupResourceRelation {
    DirectOwner,
    DirectAdmin,
    DirectMember,
}

impl Affiliation<AccountGroupId> for AccountGroupResourceRelation {}
impl Relation<AccountGroupId> for AccountGroupResourceRelation {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum AccountGroupPermission {
    AddOwner,
    RemoveOwner,
    AddAdmin,
    RemoveAdmin,
    AddMember,
    RemoveMember,
}

impl Affiliation<AccountGroupId> for AccountGroupPermission {}
impl Permission<AccountGroupId> for AccountGroupPermission {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "id")]
pub enum AccountGroupSubject {
    Account(AccountId),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AccountGroupSubjectNamespace {
    #[serde(rename = "graph/account")]
    Account,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AccountGroupSubjectId {
    Uuid(Uuid),
}

impl Resource for AccountGroupSubject {
    type Id = AccountGroupSubjectId;
    type Kind = AccountGroupSubjectNamespace;

    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, impl Error> {
        Ok::<_, !>(match (kind, id) {
            (AccountGroupSubjectNamespace::Account, AccountGroupSubjectId::Uuid(id)) => {
                Self::Account(AccountId::new(id))
            }
        })
    }

    fn into_parts(self) -> (Self::Kind, Self::Id) {
        match self {
            Self::Account(id) => (
                AccountGroupSubjectNamespace::Account,
                AccountGroupSubjectId::Uuid(id.into_uuid()),
            ),
        }
    }

    fn to_parts(&self) -> (Self::Kind, Self::Id) {
        Resource::into_parts(*self)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum AccountGroupDirectOwnerSubject {
    Account {
        #[serde(rename = "subjectId")]
        id: AccountId,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum AccountGroupDirectAdminSubject {
    Account {
        #[serde(rename = "subjectId")]
        id: AccountId,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum AccountGroupDirectMemberSubject {
    Account {
        #[serde(rename = "subjectId")]
        id: AccountId,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "relation", content = "subject")]
pub enum AccountGroupRelationAndSubject {
    DirectOwner(AccountGroupDirectOwnerSubject),
    DirectAdmin(AccountGroupDirectAdminSubject),
    DirectMember(AccountGroupDirectMemberSubject),
}

impl Relationship for (AccountGroupId, AccountGroupRelationAndSubject) {
    type Relation = AccountGroupResourceRelation;
    type Resource = AccountGroupId;
    type Subject = AccountGroupSubject;
    type SubjectSet = !;

    fn from_parts(
        resource: Self::Resource,
        relation: Self::Relation,
        subject: Self::Subject,
        subject_set: Option<Self::SubjectSet>,
    ) -> Result<Self, impl Error> {
        Ok((
            resource,
            match relation {
                AccountGroupResourceRelation::DirectOwner => match (subject, subject_set) {
                    (AccountGroupSubject::Account(id), None) => {
                        AccountGroupRelationAndSubject::DirectOwner(
                            AccountGroupDirectOwnerSubject::Account { id },
                        )
                    }
                    (AccountGroupSubject::Account(_), subject_set) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject_set(
                            resource,
                            relation,
                            subject,
                            subject_set,
                        ));
                    }
                },
                AccountGroupResourceRelation::DirectAdmin => match (subject, subject_set) {
                    (AccountGroupSubject::Account(id), None) => {
                        AccountGroupRelationAndSubject::DirectAdmin(
                            AccountGroupDirectAdminSubject::Account { id },
                        )
                    }
                    (AccountGroupSubject::Account(_), subject_set) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject_set(
                            resource,
                            relation,
                            subject,
                            subject_set,
                        ));
                    }
                },
                AccountGroupResourceRelation::DirectMember => match (subject, subject_set) {
                    (AccountGroupSubject::Account(id), None) => {
                        AccountGroupRelationAndSubject::DirectMember(
                            AccountGroupDirectMemberSubject::Account { id },
                        )
                    }
                    (AccountGroupSubject::Account(_), subject_set) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject_set(
                            resource,
                            relation,
                            subject,
                            subject_set,
                        ));
                    }
                },
            },
        ))
    }

    fn to_parts(
        &self,
    ) -> (
        Self::Resource,
        Self::Relation,
        Self::Subject,
        Option<Self::SubjectSet>,
    ) {
        Self::into_parts(*self)
    }

    fn into_parts(
        self,
    ) -> (
        Self::Resource,
        Self::Relation,
        Self::Subject,
        Option<Self::SubjectSet>,
    ) {
        let (relation, (subject, subject_set)) = match self.1 {
            AccountGroupRelationAndSubject::DirectOwner(subject) => (
                AccountGroupResourceRelation::DirectOwner,
                match subject {
                    AccountGroupDirectOwnerSubject::Account { id } => {
                        (AccountGroupSubject::Account(id), None)
                    }
                },
            ),
            AccountGroupRelationAndSubject::DirectAdmin(subject) => (
                AccountGroupResourceRelation::DirectAdmin,
                match subject {
                    AccountGroupDirectAdminSubject::Account { id } => {
                        (AccountGroupSubject::Account(id), None)
                    }
                },
            ),
            AccountGroupRelationAndSubject::DirectMember(subject) => (
                AccountGroupResourceRelation::DirectMember,
                match subject {
                    AccountGroupDirectMemberSubject::Account { id } => {
                        (AccountGroupSubject::Account(id), None)
                    }
                },
            ),
        };
        (self.0, relation, subject, subject_set)
    }
}
