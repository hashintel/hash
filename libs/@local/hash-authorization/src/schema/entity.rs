use std::error::Error;

use graph_types::{
    account::{AccountGroupId, AccountId},
    knowledge::entity::EntityUuid,
    provenance::OwnedById,
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
    Web,
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
    Web(OwnedById),
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
    #[serde(rename = "graph/web")]
    Web,
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
            (EntitySubjectNamespace::Web, EntitySubjectId::Uuid(id)) => {
                Self::Web(OwnedById::new(id))
            }
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
                EntitySubjectNamespace::Web | EntitySubjectNamespace::AccountGroup,
                EntitySubjectId::Asteriks(PublicAccess::Public),
            ) => {
                return Err(InvalidResource::<Self>::invalid_id(kind, id));
            }
        })
    }

    fn into_parts(self) -> (Self::Kind, Self::Id) {
        match self {
            Self::Web(id) => (
                EntitySubjectNamespace::Web,
                EntitySubjectId::Uuid(id.into_uuid()),
            ),
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
pub enum EntityWebSubject {
    Web {
        #[serde(rename = "subjectId")]
        id: OwnedById,
    },
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
pub enum EntityEditorSubject {
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
pub enum EntityViewerSubject {
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
    Web {
        subject: EntityWebSubject,
        #[serde(skip)]
        level: u8,
    },
    Owner {
        subject: EntityOwnerSubject,
        #[serde(skip)]
        level: u8,
    },
    Editor {
        subject: EntityEditorSubject,
        #[serde(skip)]
        level: u8,
    },
    Viewer {
        subject: EntityViewerSubject,
        #[serde(skip)]
        level: u8,
    },
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
                EntityResourceRelation::Web => match (parts.subject, parts.subject_set) {
                    (EntitySubject::Web(id), None) => EntityRelationAndSubject::Web {
                        subject: EntityWebSubject::Web { id },
                        level: parts.relation.level,
                    },
                    (
                        EntitySubject::Public
                        | EntitySubject::Account(_)
                        | EntitySubject::AccountGroup(_),
                        _subject_set,
                    ) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                    }
                    (EntitySubject::Web(_), _subject_set) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                    }
                },
                EntityResourceRelation::Owner => match (parts.subject, parts.subject_set) {
                    (EntitySubject::Account(id), None) => EntityRelationAndSubject::Owner {
                        subject: EntityOwnerSubject::Account { id },
                        level: parts.relation.level,
                    },
                    (EntitySubject::AccountGroup(id), Some(set)) => {
                        EntityRelationAndSubject::Owner {
                            subject: EntityOwnerSubject::AccountGroup { id, set },
                            level: parts.relation.level,
                        }
                    }
                    (EntitySubject::Web(_) | EntitySubject::Public, _subject_set) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                    }
                    (EntitySubject::Account(_) | EntitySubject::AccountGroup(_), _subject_set) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                    }
                },
                EntityResourceRelation::Editor => match (parts.subject, parts.subject_set) {
                    (EntitySubject::Account(id), None) => EntityRelationAndSubject::Editor {
                        subject: EntityEditorSubject::Account { id },
                        level: parts.relation.level,
                    },
                    (EntitySubject::AccountGroup(id), Some(set)) => {
                        EntityRelationAndSubject::Editor {
                            subject: EntityEditorSubject::AccountGroup { id, set },
                            level: parts.relation.level,
                        }
                    }
                    (EntitySubject::Web(_) | EntitySubject::Public, _subject_set) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                    }
                    (EntitySubject::Account(_) | EntitySubject::AccountGroup(_), _subject_set) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                    }
                },
                EntityResourceRelation::Viewer => match (parts.subject, parts.subject_set) {
                    (EntitySubject::Public, None) => EntityRelationAndSubject::Viewer {
                        subject: EntityViewerSubject::Public,
                        level: parts.relation.level,
                    },
                    (EntitySubject::Account(id), None) => EntityRelationAndSubject::Viewer {
                        subject: EntityViewerSubject::Account { id },
                        level: parts.relation.level,
                    },
                    (EntitySubject::AccountGroup(id), Some(set)) => {
                        EntityRelationAndSubject::Viewer {
                            subject: EntityViewerSubject::AccountGroup { id, set },
                            level: parts.relation.level,
                        }
                    }
                    (EntitySubject::Web(_), _subject_set) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject(parts));
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
            EntityRelationAndSubject::Web { subject, level } => (
                LeveledRelation {
                    name: EntityResourceRelation::Web,
                    level,
                },
                match subject {
                    EntityWebSubject::Web { id } => (EntitySubject::Web(id), None),
                },
            ),
            EntityRelationAndSubject::Owner { subject, level } => (
                LeveledRelation {
                    name: EntityResourceRelation::Owner,
                    level,
                },
                match subject {
                    EntityOwnerSubject::Account { id } => (EntitySubject::Account(id), None),
                    EntityOwnerSubject::AccountGroup { id, set } => {
                        (EntitySubject::AccountGroup(id), Some(set))
                    }
                },
            ),
            EntityRelationAndSubject::Editor { subject, level } => (
                LeveledRelation {
                    name: EntityResourceRelation::Editor,
                    level,
                },
                match subject {
                    EntityEditorSubject::Account { id } => (EntitySubject::Account(id), None),
                    EntityEditorSubject::AccountGroup { id, set } => {
                        (EntitySubject::AccountGroup(id), Some(set))
                    }
                },
            ),
            EntityRelationAndSubject::Viewer { subject, level } => (
                LeveledRelation {
                    name: EntityResourceRelation::Viewer,
                    level,
                },
                match subject {
                    EntityViewerSubject::Account { id } => (EntitySubject::Account(id), None),
                    EntityViewerSubject::AccountGroup { id, set } => {
                        (EntitySubject::AccountGroup(id), Some(set))
                    }
                    EntityViewerSubject::Public => (EntitySubject::Public, None),
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
