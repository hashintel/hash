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
        types::{Relationship, Resource},
        Affiliation, Permission, Relation,
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
    DirectOwner,
    DirectEditor,
    DirectViewer,
}

impl Affiliation<EntityUuid> for EntityResourceRelation {}
impl Relation<EntityUuid> for EntityResourceRelation {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum EntityPermission {
    Update,
    View,
}

impl Affiliation<EntityUuid> for EntityPermission {}
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

impl Affiliation<EntitySubject> for EntitySubjectSet {}
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
pub enum EntityDirectOwnerSubject {
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
pub enum EntityDirectEditorSubject {
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
pub enum EntityDirectViewerSubject {
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
#[serde(rename_all = "camelCase", tag = "relation", content = "subject")]
pub enum EntityRelationAndSubject {
    DirectOwner(EntityDirectOwnerSubject),
    DirectEditor(EntityDirectEditorSubject),
    DirectViewer(EntityDirectViewerSubject),
}

impl Relationship for (EntityUuid, EntityRelationAndSubject) {
    type Relation = EntityResourceRelation;
    type Resource = EntityUuid;
    type Subject = EntitySubject;
    type SubjectSet = EntitySubjectSet;

    fn from_parts(
        resource: Self::Resource,
        relation: Self::Relation,
        subject: Self::Subject,
        subject_set: Option<Self::SubjectSet>,
    ) -> Result<Self, impl Error> {
        Ok((
            resource,
            match relation {
                EntityResourceRelation::DirectOwner => match (subject, subject_set) {
                    (EntitySubject::Account(id), None) => {
                        EntityRelationAndSubject::DirectOwner(EntityDirectOwnerSubject::Account {
                            id,
                        })
                    }
                    (EntitySubject::AccountGroup(id), Some(set)) => {
                        EntityRelationAndSubject::DirectOwner(
                            EntityDirectOwnerSubject::AccountGroup { id, set },
                        )
                    }
                    (EntitySubject::Public, subject_set) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject(
                            resource,
                            relation,
                            subject,
                            subject_set,
                        ));
                    }
                    (EntitySubject::Account(_) | EntitySubject::AccountGroup(_), subject_set) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject_set(
                            resource,
                            relation,
                            subject,
                            subject_set,
                        ));
                    }
                },
                EntityResourceRelation::DirectEditor => match (subject, subject_set) {
                    (EntitySubject::Account(id), None) => {
                        EntityRelationAndSubject::DirectEditor(EntityDirectEditorSubject::Account {
                            id,
                        })
                    }
                    (EntitySubject::AccountGroup(id), Some(set)) => {
                        EntityRelationAndSubject::DirectEditor(
                            EntityDirectEditorSubject::AccountGroup { id, set },
                        )
                    }
                    (EntitySubject::Public, subject_set) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject(
                            resource,
                            relation,
                            subject,
                            subject_set,
                        ));
                    }
                    (EntitySubject::Account(_) | EntitySubject::AccountGroup(_), subject_set) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject_set(
                            resource,
                            relation,
                            subject,
                            subject_set,
                        ));
                    }
                },
                EntityResourceRelation::DirectViewer => match (subject, subject_set) {
                    (EntitySubject::Public, None) => {
                        EntityRelationAndSubject::DirectViewer(EntityDirectViewerSubject::Public)
                    }
                    (EntitySubject::Account(id), None) => {
                        EntityRelationAndSubject::DirectViewer(EntityDirectViewerSubject::Account {
                            id,
                        })
                    }
                    (EntitySubject::AccountGroup(id), Some(set)) => {
                        EntityRelationAndSubject::DirectViewer(
                            EntityDirectViewerSubject::AccountGroup { id, set },
                        )
                    }
                    (
                        EntitySubject::Account(_)
                        | EntitySubject::AccountGroup(_)
                        | EntitySubject::Public,
                        subject_set,
                    ) => {
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
            EntityRelationAndSubject::DirectOwner(subject) => (
                EntityResourceRelation::DirectOwner,
                match subject {
                    EntityDirectOwnerSubject::Account { id } => (EntitySubject::Account(id), None),
                    EntityDirectOwnerSubject::AccountGroup { id, set } => {
                        (EntitySubject::AccountGroup(id), Some(set))
                    }
                },
            ),
            EntityRelationAndSubject::DirectEditor(subject) => (
                EntityResourceRelation::DirectEditor,
                match subject {
                    EntityDirectEditorSubject::Account { id } => (EntitySubject::Account(id), None),
                    EntityDirectEditorSubject::AccountGroup { id, set } => {
                        (EntitySubject::AccountGroup(id), Some(set))
                    }
                },
            ),
            EntityRelationAndSubject::DirectViewer(subject) => (
                EntityResourceRelation::DirectViewer,
                match subject {
                    EntityDirectViewerSubject::Account { id } => (EntitySubject::Account(id), None),
                    EntityDirectViewerSubject::AccountGroup { id, set } => {
                        (EntitySubject::AccountGroup(id), Some(set))
                    }
                    EntityDirectViewerSubject::Public => (EntitySubject::Public, None),
                },
            ),
        };
        (self.0, relation, subject, subject_set)
    }
}
