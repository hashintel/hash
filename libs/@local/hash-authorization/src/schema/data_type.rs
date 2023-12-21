use std::error::Error;

use graph_types::owned_by_id::OwnedById;
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

    #[expect(refining_impl_trait)]
    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, !> {
        match kind {
            DataTypeNamespace::DataType => Ok(id),
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
    Web(OwnedById),
    Public,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum DataTypeSubjectNamespace {
    #[serde(rename = "graph/web")]
    Web,
    #[serde(rename = "graph/account")]
    Account,
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
            (DataTypeSubjectNamespace::Web, DataTypeSubjectId::Uuid(uuid)) => {
                Self::Web(OwnedById::new(uuid))
            }
            (DataTypeSubjectNamespace::Account | DataTypeSubjectNamespace::Web, _) => {
                return Err(InvalidResource::<Self>::invalid_id(kind, id));
            }
        })
    }

    fn into_parts(self) -> (Self::Kind, Self::Id) {
        match self {
            Self::Web(web_id) => (
                DataTypeSubjectNamespace::Web,
                DataTypeSubjectId::Uuid(web_id.into_uuid()),
            ),
            Self::Public => (
                DataTypeSubjectNamespace::Account,
                DataTypeSubjectId::Asteriks(PublicAccess::Public),
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
    Web {
        #[serde(rename = "subjectId")]
        id: OwnedById,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum DataTypeViewerSubject {
    Public,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "relation")]
pub enum DataTypeRelationAndSubject {
    Owner {
        subject: DataTypeOwnerSubject,
        #[serde(skip)]
        level: u8,
    },
    Viewer {
        subject: DataTypeViewerSubject,
        #[serde(skip)]
        level: u8,
    },
}

impl Relationship for (DataTypeId, DataTypeRelationAndSubject) {
    type Relation = DataTypeResourceRelation;
    type Resource = DataTypeId;
    type Subject = DataTypeSubject;
    type SubjectSet = !;

    fn from_parts(parts: RelationshipParts<Self>) -> Result<Self, impl Error> {
        Ok((
            parts.resource,
            match parts.relation.name {
                DataTypeResourceRelation::Owner => DataTypeRelationAndSubject::Owner {
                    subject: match (parts.subject, parts.subject_set) {
                        (DataTypeSubject::Web(id), None) => DataTypeOwnerSubject::Web { id },
                        (DataTypeSubject::Public, None) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                        }
                    },
                    level: parts.relation.level,
                },
                DataTypeResourceRelation::Viewer => DataTypeRelationAndSubject::Viewer {
                    subject: match (parts.subject, parts.subject_set) {
                        (DataTypeSubject::Public, None) => DataTypeViewerSubject::Public,
                        (DataTypeSubject::Web(_), None) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                        }
                    },
                    level: parts.relation.level,
                },
            },
        ))
    }

    fn to_parts(&self) -> RelationshipParts<Self> {
        Self::into_parts(*self)
    }

    fn into_parts(self) -> RelationshipParts<Self> {
        let (relation, (subject, subject_set)) = match self.1 {
            DataTypeRelationAndSubject::Owner { subject, level } => (
                LeveledRelation {
                    name: DataTypeResourceRelation::Owner,
                    level,
                },
                match subject {
                    DataTypeOwnerSubject::Web { id } => (DataTypeSubject::Web(id), None),
                },
            ),
            DataTypeRelationAndSubject::Viewer { subject, level } => (
                LeveledRelation {
                    name: DataTypeResourceRelation::Viewer,
                    level,
                },
                match subject {
                    DataTypeViewerSubject::Public => (DataTypeSubject::Public, None),
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
