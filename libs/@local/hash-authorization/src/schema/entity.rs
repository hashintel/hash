use std::error::Error;

use graph_types::{
    account::{AccountGroupId, AccountId},
    knowledge::entity::EntityUuid,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    schema::{
        error::{InvalidRelationship, InvalidResource},
        PublicAccess,
    },
    zanzibar::{
        types::{LeveledRelation, Relationship, RelationshipParts, Resource},
        Permission, Relation,
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum EntityNamespace {
    #[serde(rename = "graph/entity")]
    Entity,
}

impl Resource for EntityUuid {
    type Id = Self;
    type Kind = EntityNamespace;

    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, impl Error> {
        match kind {
            EntityNamespace::Entity => Ok::<_, !>(id),
        }
    }

    fn into_parts(self) -> (Self::Kind, Self::Id) {
        (EntityNamespace::Entity, self)
    }

    fn to_parts(&self) -> (Self::Kind, Self::Id) {
        Resource::into_parts(*self)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntityResourceRelation {
    Owner,
    Editor,
    Viewer,
}

impl Relation<EntityUuid> for EntityResourceRelation {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum EntityPermission {
    Update,
    View,
}

impl Permission<EntityUuid> for EntityPermission {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "id")]
pub enum EntitySubject {
    Public,
    Account(AccountId),
    AccountGroup(AccountGroupId),
}

#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntitySubjectSet {
    #[default]
    Member,
}

impl Relation<EntitySubject> for EntitySubjectSet {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum EntitySubjectNamespace {
    #[serde(rename = "graph/account")]
    Account,
    #[serde(rename = "graph/account_group")]
    AccountGroup,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum EntitySubjectId {
    Uuid(Uuid),
    Asteriks(PublicAccess),
}

impl Resource for EntitySubject {
    type Id = EntitySubjectId;
    type Kind = EntitySubjectNamespace;

    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, impl Error> {
        Ok(match (kind, id) {
            (EntitySubjectNamespace::Account, EntitySubjectId::Asteriks(PublicAccess::Public)) => {
                Self::Public
            }
            (EntitySubjectNamespace::Account, EntitySubjectId::Uuid(id)) => {
                Self::Account(AccountId::new(id))
            }
            (EntitySubjectNamespace::AccountGroup, EntitySubjectId::Uuid(id)) => {
                Self::AccountGroup(AccountGroupId::new(id))
            }
            (
                EntitySubjectNamespace::AccountGroup,
                EntitySubjectId::Asteriks(PublicAccess::Public),
            ) => {
                return Err(InvalidResource::<Self>::invalid_id(kind, id));
            }
        })
    }

    fn into_parts(self) -> (Self::Kind, Self::Id) {
        match self {
            Self::Public => (
                EntitySubjectNamespace::Account,
                EntitySubjectId::Asteriks(PublicAccess::Public),
            ),
            Self::Account(id) => (
                EntitySubjectNamespace::Account,
                EntitySubjectId::Uuid(id.into_uuid()),
            ),
            Self::AccountGroup(id) => (
                EntitySubjectNamespace::AccountGroup,
                EntitySubjectId::Uuid(id.into_uuid()),
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
pub enum EntityOwnerSubject {
    Account {
        #[serde(rename = "subjectId")]
        id: AccountId,
    },
    AccountGroup {
        #[serde(rename = "subjectId")]
        id: AccountGroupId,
        #[serde(skip)]
        set: EntitySubjectSet,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum EntityGeneralEditorSubject {
    Account {
        #[serde(rename = "subjectId")]
        id: AccountId,
    },
    AccountGroup {
        #[serde(rename = "subjectId")]
        id: AccountGroupId,
        #[serde(skip)]
        set: EntitySubjectSet,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum EntityGeneralViewerSubject {
    Public,
    Account {
        #[serde(rename = "subjectId")]
        id: AccountId,
    },
    AccountGroup {
        #[serde(rename = "subjectId")]
        id: AccountGroupId,
        #[serde(skip)]
        set: EntitySubjectSet,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "relation")]
pub enum EntityRelationAndSubject {
    Owner { subject: EntityOwnerSubject },
    GeneralEditor { subject: EntityGeneralEditorSubject },
    GeneralViewer { subject: EntityGeneralViewerSubject },
}

impl Relationship for (EntityUuid, EntityRelationAndSubject) {
    type Relation = EntityResourceRelation;
    type Resource = EntityUuid;
    type Subject = EntitySubject;
    type SubjectSet = EntitySubjectSet;

    fn from_parts(parts: RelationshipParts<Self>) -> Result<Self, impl Error> {
        Ok((
            parts.resource,
            match parts.relation.name {
                EntityResourceRelation::Owner => match (parts.subject, parts.subject_set) {
                    (EntitySubject::Account(id), None) => EntityRelationAndSubject::Owner {
                        subject: EntityOwnerSubject::Account { id },
                    },
                    (EntitySubject::AccountGroup(id), Some(set)) => {
                        EntityRelationAndSubject::Owner {
                            subject: EntityOwnerSubject::AccountGroup { id, set },
                        }
                    }
                    (EntitySubject::Public, _subject_set) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                    }
                    (EntitySubject::Account(_) | EntitySubject::AccountGroup(_), _subject_set) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                    }
                },
                EntityResourceRelation::Editor => match (parts.subject, parts.subject_set) {
                    (EntitySubject::Account(id), None) => EntityRelationAndSubject::GeneralEditor {
                        subject: EntityGeneralEditorSubject::Account { id },
                    },
                    (EntitySubject::AccountGroup(id), Some(set)) => {
                        EntityRelationAndSubject::GeneralEditor {
                            subject: EntityGeneralEditorSubject::AccountGroup { id, set },
                        }
                    }
                    (EntitySubject::Public, _subject_set) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                    }
                    (EntitySubject::Account(_) | EntitySubject::AccountGroup(_), _subject_set) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                    }
                },
                EntityResourceRelation::Viewer => match (parts.subject, parts.subject_set) {
                    (EntitySubject::Public, None) => EntityRelationAndSubject::GeneralViewer {
                        subject: EntityGeneralViewerSubject::Public,
                    },
                    (EntitySubject::Account(id), None) => EntityRelationAndSubject::GeneralViewer {
                        subject: EntityGeneralViewerSubject::Account { id },
                    },
                    (EntitySubject::AccountGroup(id), Some(set)) => {
                        EntityRelationAndSubject::GeneralViewer {
                            subject: EntityGeneralViewerSubject::AccountGroup { id, set },
                        }
                    }
                    (
                        EntitySubject::Account(_)
                        | EntitySubject::AccountGroup(_)
                        | EntitySubject::Public,
                        _subject_set,
                    ) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
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
            EntityRelationAndSubject::Owner { subject } => (
                LeveledRelation {
                    name: EntityResourceRelation::Owner,
                    level: 0,
                },
                match subject {
                    EntityOwnerSubject::Account { id } => (EntitySubject::Account(id), None),
                    EntityOwnerSubject::AccountGroup { id, set } => {
                        (EntitySubject::AccountGroup(id), Some(set))
                    }
                },
            ),
            EntityRelationAndSubject::GeneralEditor { subject } => (
                LeveledRelation {
                    name: EntityResourceRelation::Editor,
                    level: 0,
                },
                match subject {
                    EntityGeneralEditorSubject::Account { id } => {
                        (EntitySubject::Account(id), None)
                    }
                    EntityGeneralEditorSubject::AccountGroup { id, set } => {
                        (EntitySubject::AccountGroup(id), Some(set))
                    }
                },
            ),
            EntityRelationAndSubject::GeneralViewer { subject } => (
                LeveledRelation {
                    name: EntityResourceRelation::Viewer,
                    level: 0,
                },
                match subject {
                    EntityGeneralViewerSubject::Account { id } => {
                        (EntitySubject::Account(id), None)
                    }
                    EntityGeneralViewerSubject::AccountGroup { id, set } => {
                        (EntitySubject::AccountGroup(id), Some(set))
                    }
                    EntityGeneralViewerSubject::Public => (EntitySubject::Public, None),
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
