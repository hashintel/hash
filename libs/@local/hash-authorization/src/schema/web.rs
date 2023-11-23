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
        types::{LeveledRelation, Relationship, RelationshipParts, Resource},
        Permission, Relation,
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
    Editor,
}

impl Relation<WebId> for WebResourceRelation {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum WebPermission {
    Update,

    CreateEntity,
    CreateEntityType,
    CreatePropertyType,
    CreateDataType,
}
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
pub enum WebOwnerSubject {
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
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum WebEntityCreatorSubject {
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
#[serde(rename_all = "camelCase", tag = "relation")]
pub enum WebRelationAndSubject {
    Owner {
        subject: WebOwnerSubject,
        #[serde(skip)]
        level: u8,
    },
    EntityCreator {
        subject: WebEntityCreatorSubject,
        #[serde(skip)]
        level: u8,
    },
}

impl Relationship for (WebId, WebRelationAndSubject) {
    type Relation = WebResourceRelation;
    type Resource = WebId;
    type Subject = WebSubject;
    type SubjectSet = WebSubjectSet;

    fn from_parts(parts: RelationshipParts<Self>) -> Result<Self, impl Error> {
        Ok((
            parts.resource,
            match parts.relation.name {
                WebResourceRelation::Owner => match (parts.subject, parts.subject_set) {
                    (WebSubject::Account(id), None) => WebRelationAndSubject::Owner {
                        subject: WebOwnerSubject::Account { id },
                        level: parts.relation.level,
                    },
                    (WebSubject::AccountGroup(id), Some(set)) => WebRelationAndSubject::Owner {
                        subject: WebOwnerSubject::AccountGroup { id, set },
                        level: parts.relation.level,
                    },
                    (WebSubject::Account(_) | WebSubject::AccountGroup(_), _subject_set) => {
                        return Err(InvalidRelationship::invalid_subject_set(parts));
                    }
                },
                WebResourceRelation::Editor => match (parts.subject, parts.subject_set) {
                    (WebSubject::Account(id), None) => WebRelationAndSubject::EntityCreator {
                        subject: WebEntityCreatorSubject::Account { id },
                        level: parts.relation.level,
                    },
                    (WebSubject::AccountGroup(id), Some(set)) => {
                        WebRelationAndSubject::EntityCreator {
                            subject: WebEntityCreatorSubject::AccountGroup { id, set },
                            level: parts.relation.level,
                        }
                    }
                    (WebSubject::Account(_) | WebSubject::AccountGroup(_), _subject_set) => {
                        return Err(InvalidRelationship::invalid_subject_set(parts));
                    }
                },
            },
        ))
    }

    fn to_parts(&self) -> RelationshipParts<Self> {
        Self::into_parts(*self)
    }

    fn into_parts(self) -> RelationshipParts<Self> {
        let (relation, (subject, subject_set)) = match self.1 {
            WebRelationAndSubject::Owner { subject, level } => (
                LeveledRelation {
                    name: WebResourceRelation::Owner,
                    level,
                },
                match subject {
                    WebOwnerSubject::Account { id } => (WebSubject::Account(id), None),
                    WebOwnerSubject::AccountGroup { id, set } => {
                        (WebSubject::AccountGroup(id), Some(set))
                    }
                },
            ),
            WebRelationAndSubject::EntityCreator { subject, level } => (
                LeveledRelation {
                    name: WebResourceRelation::Editor,
                    level,
                },
                match subject {
                    WebEntityCreatorSubject::Account { id } => (WebSubject::Account(id), None),
                    WebEntityCreatorSubject::AccountGroup { id, set } => {
                        (WebSubject::AccountGroup(id), Some(set))
                    }
                },
            ),
        };
        RelationshipParts {
            resource: self.0,
            relation,
            subject,
            subject_set,
        }
    }
}
