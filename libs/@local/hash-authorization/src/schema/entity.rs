use std::{error::Error, fmt};

use graph_types::{
    account::{AccountGroupId, AccountId},
    knowledge::entity::EntityUuid,
};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

use crate::{
    schema::{account::AccountNamespace, account_group::AccountGroupNamespace, PublicAccess},
    zanzibar::{
        types::{Object, Relationship},
        Affiliation, Permission, Relation,
    },
};

#[derive(Debug, Error)]
enum InvalidSubject {
    #[error("unexpected subject for namespace")]
    Id {
        namespace: EntitySubjectNamespace,
        id: EntitySubjectId,
    },
}

#[derive(Debug, Error)]
enum InvalidRelationship {
    #[error("missing relation for namespace")]
    Missing,
    #[error("unexpected subject for namespace")]
    Subject {
        relation: EntityObjectRelation,
        subject: EntitySubject,
    },
    #[error("unexpected relation for namespace")]
    SubjectSet {
        relation: EntityObjectRelation,
        subject: EntitySubject,
        subject_set: Option<EntitySubjectSet>,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum EntityNamespace {
    #[serde(rename = "graph/entity")]
    Entity,
}

impl Object for EntityUuid {
    type Id = Self;
    type Namespace = EntityNamespace;

    fn from_parts(namespace: Self::Namespace, id: Self::Id) -> Result<Self, impl Error> {
        match namespace {
            EntityNamespace::Entity => Ok::<_, !>(id),
        }
    }

    fn into_parts(self) -> (Self::Namespace, Self::Id) {
        (EntityNamespace::Entity, self)
    }

    fn to_parts(&self) -> (Self::Namespace, Self::Id) {
        Object::into_parts(*self)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum EntityObjectRelation {
    DirectOwner,
    DirectEditor,
    DirectViewer,
}

impl fmt::Display for EntityObjectRelation {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

impl Affiliation<EntityUuid> for EntityObjectRelation {}
impl Relation<EntityUuid> for EntityObjectRelation {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntityPermission {
    Update,
    View,
}

impl fmt::Display for EntityPermission {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

impl Affiliation<EntityUuid> for EntityPermission {}
impl Permission<EntityUuid> for EntityPermission {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum EntitySubjectSet {
    Member,
}

impl Affiliation<EntitySubject> for EntitySubjectSet {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "type", content = "id")]
pub enum EntitySubject {
    #[cfg_attr(feature = "utoipa", schema(title = "EntitySubjectPublic"))]
    Public,
    #[cfg_attr(feature = "utoipa", schema(title = "EntitySubjectAccount"))]
    Account(AccountId),
    #[cfg_attr(feature = "utoipa", schema(title = "EntitySubjectAccountGroup"))]
    AccountGroup(AccountGroupId),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum EntitySubjectId {
    Uuid(Uuid),
    Asteriks(PublicAccess),
}

impl Object for EntitySubject {
    type Id = EntitySubjectId;
    type Namespace = EntitySubjectNamespace;

    fn from_parts(namespace: Self::Namespace, id: Self::Id) -> Result<Self, impl Error> {
        Ok(match (namespace, id) {
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
                return Err(InvalidSubject::Id { namespace, id });
            }
        })
    }

    fn into_parts(self) -> (Self::Namespace, Self::Id) {
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

    fn to_parts(&self) -> (Self::Namespace, Self::Id) {
        Object::into_parts(*self)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "relation")]
pub enum EntitySubjectRelation {
    Member,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum EntityDirectOwnerSubject {
    Account {
        id: AccountId,
    },
    AccountGroup {
        id: AccountGroupId,
        relation: EntitySubjectSet,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum EntityDirectEditorSubject {
    Account {
        id: AccountId,
    },
    AccountGroup {
        id: AccountGroupId,
        relation: EntitySubjectSet,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum EntityDirectViewerSubject {
    Public,
    Account {
        id: AccountId,
    },
    AccountGroup {
        id: AccountGroupId,
        relation: EntitySubjectSet,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "relation")]
pub enum EntityRelation {
    DirectOwner(EntityDirectOwnerSubject),
    DirectEditor(EntityDirectEditorSubject),
    DirectViewer(EntityDirectViewerSubject),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
pub enum EntitySubjectNamespace {
    #[serde(rename = "graph/account")]
    Account,
    #[serde(rename = "graph/account_group")]
    AccountGroup,
}

impl Relationship for (EntityUuid, EntityRelation) {
    type Object = EntityUuid;
    type Relation = EntityObjectRelation;
    type Subject = EntitySubject;
    type SubjectSet = EntitySubjectSet;

    fn from_parts(
        object: Self::Object,
        relation: Self::Relation,
        subject: Self::Subject,
        subject_set: Option<Self::SubjectSet>,
    ) -> Result<Self, impl Error> {
        Ok((
            object,
            match relation {
                EntityObjectRelation::DirectOwner => match (subject, subject_set) {
                    (EntitySubject::Account(id), None) => {
                        EntityRelation::DirectOwner(EntityDirectOwnerSubject::Account { id })
                    }
                    (EntitySubject::AccountGroup(id), Some(relation)) => {
                        EntityRelation::DirectOwner(EntityDirectOwnerSubject::AccountGroup {
                            id,
                            relation,
                        })
                    }
                    (EntitySubject::Public, _) => {
                        return Err(InvalidRelationship::Subject { relation, subject });
                    }
                    (EntitySubject::Account(_) | EntitySubject::AccountGroup(_), _) => {
                        return Err(InvalidRelationship::SubjectSet {
                            relation,
                            subject,
                            subject_set,
                        });
                    }
                },
                EntityObjectRelation::DirectEditor => match (subject, subject_set) {
                    (EntitySubject::Account(id), None) => {
                        EntityRelation::DirectEditor(EntityDirectEditorSubject::Account { id })
                    }
                    (EntitySubject::AccountGroup(id), Some(relation)) => {
                        EntityRelation::DirectEditor(EntityDirectEditorSubject::AccountGroup {
                            id,
                            relation,
                        })
                    }
                    (EntitySubject::Public, _) => {
                        return Err(InvalidRelationship::Subject { relation, subject });
                    }
                    (EntitySubject::Account(_) | EntitySubject::AccountGroup(_), _) => {
                        return Err(InvalidRelationship::SubjectSet {
                            relation,
                            subject,
                            subject_set,
                        });
                    }
                },
                EntityObjectRelation::DirectViewer => match (subject, subject_set) {
                    (EntitySubject::Public, None) => {
                        EntityRelation::DirectViewer(EntityDirectViewerSubject::Public)
                    }
                    (EntitySubject::Account(id), None) => {
                        EntityRelation::DirectViewer(EntityDirectViewerSubject::Account { id })
                    }
                    (EntitySubject::AccountGroup(id), Some(relation)) => {
                        EntityRelation::DirectViewer(EntityDirectViewerSubject::AccountGroup {
                            id,
                            relation,
                        })
                    }
                    (
                        EntitySubject::Account(_)
                        | EntitySubject::AccountGroup(_)
                        | EntitySubject::Public,
                        _,
                    ) => {
                        return Err(InvalidRelationship::SubjectSet {
                            relation,
                            subject,
                            subject_set,
                        });
                    }
                },
            },
        ))
    }

    fn to_parts(
        &self,
    ) -> (
        Self::Object,
        Self::Relation,
        Self::Subject,
        Option<Self::SubjectSet>,
    ) {
        Relationship::into_parts(*self)
    }

    fn into_parts(
        self,
    ) -> (
        Self::Object,
        Self::Relation,
        Self::Subject,
        Option<Self::SubjectSet>,
    ) {
        let (object, relationship) = self;
        let (relation, (subject, subject_set)) = match relationship {
            EntityRelation::DirectOwner(subject) => (
                EntityObjectRelation::DirectOwner,
                match subject {
                    EntityDirectOwnerSubject::Account { id } => (EntitySubject::Account(id), None),
                    EntityDirectOwnerSubject::AccountGroup { id, relation } => {
                        (EntitySubject::AccountGroup(id), Some(relation))
                    }
                },
            ),
            EntityRelation::DirectEditor(subject) => (
                EntityObjectRelation::DirectEditor,
                match subject {
                    EntityDirectEditorSubject::Account { id } => (EntitySubject::Account(id), None),
                    EntityDirectEditorSubject::AccountGroup { id, relation } => {
                        (EntitySubject::AccountGroup(id), Some(relation))
                    }
                },
            ),
            EntityRelation::DirectViewer(subject) => (
                EntityObjectRelation::DirectViewer,
                match subject {
                    EntityDirectViewerSubject::Account { id } => (EntitySubject::Account(id), None),
                    EntityDirectViewerSubject::AccountGroup { id, relation } => {
                        (EntitySubject::AccountGroup(id), Some(relation))
                    }
                    EntityDirectViewerSubject::Public => (EntitySubject::Public, None),
                },
            ),
        };
        (object, relation, subject, subject_set)
    }
}
