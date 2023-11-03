use std::error::Error;

use graph_types::account::{AccountGroupId, AccountId};
use serde::{Deserialize, Serialize};
use type_system::url::VersionedUrl;
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
pub enum DataTypeNamespace {
    #[serde(rename = "graph/data_type")]
    DataType,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[repr(transparent)]
pub struct DataTypeId(Uuid);

impl DataTypeId {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }

    #[must_use]
    pub fn from_url(url: &VersionedUrl) -> Self {
        Self(Uuid::new_v5(
            &Uuid::NAMESPACE_URL,
            url.to_string().as_bytes(),
        ))
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        &self.0
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0
    }
}

impl Resource for DataTypeId {
    type Id = Self;
    type Kind = DataTypeNamespace;

    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, impl Error> {
        match kind {
            DataTypeNamespace::DataType => Ok::<_, !>(id),
        }
    }

    fn into_parts(self) -> (Self::Kind, Self::Id) {
        (DataTypeNamespace::DataType, self)
    }

    fn to_parts(&self) -> (Self::Kind, Self::Id) {
        Resource::into_parts(*self)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DataTypeResourceRelation {
    Owner,
    Viewer,
}

impl Relation<DataTypeId> for DataTypeResourceRelation {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum DataTypePermission {
    Update,
    View,
}

impl Permission<DataTypeId> for DataTypePermission {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "id")]
pub enum DataTypeSubject {
    Public,
    Account(AccountId),
    AccountGroup(AccountGroupId),
}

#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DataTypeSubjectSet {
    #[default]
    Member,
}

impl Relation<DataTypeSubject> for DataTypeSubjectSet {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum DataTypeSubjectNamespace {
    #[serde(rename = "graph/account")]
    Account,
    #[serde(rename = "graph/account_group")]
    AccountGroup,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum DataTypeSubjectId {
    Uuid(Uuid),
    Asteriks(PublicAccess),
}

impl Resource for DataTypeSubject {
    type Id = DataTypeSubjectId;
    type Kind = DataTypeSubjectNamespace;

    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, impl Error> {
        Ok(match (kind, id) {
            (
                DataTypeSubjectNamespace::Account,
                DataTypeSubjectId::Asteriks(PublicAccess::Public),
            ) => Self::Public,
            (DataTypeSubjectNamespace::Account, DataTypeSubjectId::Uuid(id)) => {
                Self::Account(AccountId::new(id))
            }
            (DataTypeSubjectNamespace::AccountGroup, DataTypeSubjectId::Uuid(id)) => {
                Self::AccountGroup(AccountGroupId::new(id))
            }
            (
                DataTypeSubjectNamespace::AccountGroup,
                DataTypeSubjectId::Asteriks(PublicAccess::Public),
            ) => {
                return Err(InvalidResource::<Self>::invalid_id(kind, id));
            }
        })
    }

    fn into_parts(self) -> (Self::Kind, Self::Id) {
        match self {
            Self::Public => (
                DataTypeSubjectNamespace::Account,
                DataTypeSubjectId::Asteriks(PublicAccess::Public),
            ),
            Self::Account(id) => (
                DataTypeSubjectNamespace::Account,
                DataTypeSubjectId::Uuid(id.into_uuid()),
            ),
            Self::AccountGroup(id) => (
                DataTypeSubjectNamespace::AccountGroup,
                DataTypeSubjectId::Uuid(id.into_uuid()),
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
pub enum DataTypeOwnerSubject {
    Account {
        #[serde(rename = "subjectId")]
        id: AccountId,
    },
    AccountGroup {
        #[serde(rename = "subjectId")]
        id: AccountGroupId,
        #[serde(skip)]
        set: DataTypeSubjectSet,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum DataTypeGeneralViewerSubject {
    Public,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "relation")]
pub enum DataTypeRelationAndSubject {
    Owner {
        subject: DataTypeOwnerSubject,
    },
    GeneralViewer {
        subject: DataTypeGeneralViewerSubject,
    },
}

impl Relationship for (DataTypeId, DataTypeRelationAndSubject) {
    type Relation = DataTypeResourceRelation;
    type Resource = DataTypeId;
    type Subject = DataTypeSubject;
    type SubjectSet = DataTypeSubjectSet;

    fn from_parts(parts: RelationshipParts<Self>) -> Result<Self, impl Error> {
        Ok((
            parts.resource,
            match parts.relation.name {
                DataTypeResourceRelation::Owner => match (parts.subject, parts.subject_set) {
                    (DataTypeSubject::Account(id), None) => DataTypeRelationAndSubject::Owner {
                        subject: DataTypeOwnerSubject::Account { id },
                    },
                    (DataTypeSubject::AccountGroup(id), Some(set)) => {
                        DataTypeRelationAndSubject::Owner {
                            subject: DataTypeOwnerSubject::AccountGroup { id, set },
                        }
                    }
                    (DataTypeSubject::Public, _subject_set) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                    }
                    (
                        DataTypeSubject::Account(_) | DataTypeSubject::AccountGroup(_),
                        _subject_set,
                    ) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                    }
                },
                DataTypeResourceRelation::Viewer => match (parts.subject, parts.subject_set) {
                    (DataTypeSubject::Public, None) => DataTypeRelationAndSubject::GeneralViewer {
                        subject: DataTypeGeneralViewerSubject::Public,
                    },
                    (
                        DataTypeSubject::Account(_)
                        | DataTypeSubject::AccountGroup(_)
                        | DataTypeSubject::Public,
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
            DataTypeRelationAndSubject::Owner { subject } => (
                LeveledRelation {
                    name: DataTypeResourceRelation::Owner,
                    level: 0,
                },
                match subject {
                    DataTypeOwnerSubject::Account { id } => (DataTypeSubject::Account(id), None),
                    DataTypeOwnerSubject::AccountGroup { id, set } => {
                        (DataTypeSubject::AccountGroup(id), Some(set))
                    }
                },
            ),
            DataTypeRelationAndSubject::GeneralViewer { subject } => (
                LeveledRelation {
                    name: DataTypeResourceRelation::Viewer,
                    level: 0,
                },
                match subject {
                    DataTypeGeneralViewerSubject::Public => (DataTypeSubject::Public, None),
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
