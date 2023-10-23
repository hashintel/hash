use std::error::Error;

use graph_types::{
    account::{AccountGroupId, AccountId},
    web::WebId,
};
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
#[serde(rename_all = "snake_case")]
pub enum WebResourceRelation {
    Owner,
}

impl Affiliation<WebId> for WebResourceRelation {}
impl Relation<WebId> for WebResourceRelation {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum WebPermission {
    CreateEntity,
}
impl Affiliation<WebId> for WebPermission {}
impl Permission<WebId> for WebPermission {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "id")]
pub enum WebSubject {
    Account(AccountId),
    AccountGroup(AccountGroupId),
}

#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WebSubjectSet {
    #[default]
    Member,
}

impl Affiliation<WebSubject> for WebSubjectSet {}
impl Relation<WebSubject> for WebSubjectSet {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum WebSubjectNamespace {
    #[serde(rename = "graph/account")]
    Account,
    #[serde(rename = "graph/account_group")]
    AccountGroup,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum WebSubjectId {
    Uuid(Uuid),
}

impl Resource for WebSubject {
    type Id = WebSubjectId;
    type Kind = WebSubjectNamespace;

    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, impl Error> {
        Ok::<_, !>(match (kind, id) {
            (WebSubjectNamespace::Account, WebSubjectId::Uuid(id)) => {
                Self::Account(AccountId::new(id))
            }
            (WebSubjectNamespace::AccountGroup, WebSubjectId::Uuid(id)) => {
                Self::AccountGroup(AccountGroupId::new(id))
            }
        })
    }

    fn into_parts(self) -> (Self::Kind, Self::Id) {
        match self {
            Self::Account(id) => (
                WebSubjectNamespace::Account,
                WebSubjectId::Uuid(id.into_uuid()),
            ),
            Self::AccountGroup(id) => (
                WebSubjectNamespace::AccountGroup,
                WebSubjectId::Uuid(id.into_uuid()),
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
pub enum WebDirectOwnerSubject {
    Account {
        #[serde(rename = "subjectId")]
        id: AccountId,
    },
    AccountGroup {
        #[serde(rename = "subjectId")]
        id: AccountGroupId,
        #[serde(skip)]
        set: WebSubjectSet,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "relation", content = "subject")]
pub enum WebRelationAndSubject {
    DirectOwner(WebDirectOwnerSubject),
}

impl Relationship for (WebId, WebRelationAndSubject) {
    type Relation = WebResourceRelation;
    type Resource = WebId;
    type Subject = WebSubject;
    type SubjectSet = WebSubjectSet;

    fn from_parts(
        resource: Self::Resource,
        relation: Self::Relation,
        subject: Self::Subject,
        subject_set: Option<Self::SubjectSet>,
    ) -> Result<Self, impl Error> {
        Ok((
            resource,
            match relation {
                WebResourceRelation::Owner => match (subject, subject_set) {
                    (WebSubject::Account(id), None) => {
                        WebRelationAndSubject::DirectOwner(WebDirectOwnerSubject::Account { id })
                    }
                    (WebSubject::AccountGroup(id), Some(set)) => {
                        WebRelationAndSubject::DirectOwner(WebDirectOwnerSubject::AccountGroup {
                            id,
                            set,
                        })
                    }
                    (WebSubject::Account(_) | WebSubject::AccountGroup(_), subject_set) => {
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
            WebRelationAndSubject::DirectOwner(subject) => (
                WebResourceRelation::Owner,
                match subject {
                    WebDirectOwnerSubject::Account { id } => (WebSubject::Account(id), None),
                    WebDirectOwnerSubject::AccountGroup { id, set } => {
                        (WebSubject::AccountGroup(id), Some(set))
                    }
                },
            ),
        };
        (self.0, relation, subject, subject_set)
    }
}
