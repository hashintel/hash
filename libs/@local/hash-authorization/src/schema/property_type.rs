use std::error::Error;

use graph_types::provenance::OwnedById;
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
pub enum PropertyTypeNamespace {
    #[serde(rename = "graph/property_type")]
    PropertyType,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[repr(transparent)]
pub struct PropertyTypeId(Uuid);

impl PropertyTypeId {
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

impl Resource for PropertyTypeId {
    type Id = Self;
    type Kind = PropertyTypeNamespace;

    #[expect(refining_impl_trait)]
    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, !> {
        match kind {
            PropertyTypeNamespace::PropertyType => Ok(id),
        }
    }

    fn into_parts(self) -> (Self::Kind, Self::Id) {
        (PropertyTypeNamespace::PropertyType, self)
    }

    fn to_parts(&self) -> (Self::Kind, Self::Id) {
        Resource::into_parts(*self)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PropertyTypeResourceRelation {
    Setting,
    Owner,
    Viewer,
}

impl Relation<PropertyTypeId> for PropertyTypeResourceRelation {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum PropertyTypePermission {
    Update,
    View,
}

impl Permission<PropertyTypeId> for PropertyTypePermission {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub enum PropertyTypeSetting {
    UpdateFromWeb,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "id")]
pub enum PropertyTypeSubject {
    Setting(PropertyTypeSetting),
    Web(OwnedById),
    Public,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PropertyTypeSubjectNamespace {
    #[serde(rename = "graph/setting")]
    Setting,
    #[serde(rename = "graph/web")]
    Web,
    #[serde(rename = "graph/account")]
    Account,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PropertyTypeSubjectId {
    Setting(PropertyTypeSetting),
    Uuid(Uuid),
    Asteriks(PublicAccess),
}

impl Resource for PropertyTypeSubject {
    type Id = PropertyTypeSubjectId;
    type Kind = PropertyTypeSubjectNamespace;

    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, impl Error> {
        Ok(match (kind, id) {
            (PropertyTypeSubjectNamespace::Setting, PropertyTypeSubjectId::Setting(setting)) => {
                Self::Setting(setting)
            }
            (PropertyTypeSubjectNamespace::Web, PropertyTypeSubjectId::Uuid(uuid)) => {
                Self::Web(OwnedById::new(uuid))
            }
            (
                PropertyTypeSubjectNamespace::Account,
                PropertyTypeSubjectId::Setting(_)
                | PropertyTypeSubjectId::Asteriks(PublicAccess::Public),
            ) => Self::Public,
            (
                PropertyTypeSubjectNamespace::Setting | PropertyTypeSubjectNamespace::Account,
                PropertyTypeSubjectId::Uuid(_),
            )
            | (PropertyTypeSubjectNamespace::Web, PropertyTypeSubjectId::Setting(_))
            | (
                PropertyTypeSubjectNamespace::Setting | PropertyTypeSubjectNamespace::Web,
                PropertyTypeSubjectId::Asteriks(PublicAccess::Public),
            ) => {
                return Err(InvalidResource::<Self>::invalid_id(kind, id));
            }
        })
    }

    fn into_parts(self) -> (Self::Kind, Self::Id) {
        match self {
            Self::Setting(setting) => (
                PropertyTypeSubjectNamespace::Setting,
                PropertyTypeSubjectId::Setting(setting),
            ),
            Self::Web(web_id) => (
                PropertyTypeSubjectNamespace::Web,
                PropertyTypeSubjectId::Uuid(web_id.into_uuid()),
            ),
            Self::Public => (
                PropertyTypeSubjectNamespace::Account,
                PropertyTypeSubjectId::Asteriks(PublicAccess::Public),
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
pub enum PropertyTypeSettingSubject {
    Setting {
        #[serde(rename = "subjectId")]
        id: PropertyTypeSetting,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum PropertyTypeOwnerSubject {
    Web {
        #[serde(rename = "subjectId")]
        id: OwnedById,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum PropertyTypeViewerSubject {
    Public,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "relation")]
pub enum PropertyTypeRelationAndSubject {
    Setting {
        subject: PropertyTypeSettingSubject,
        #[serde(skip)]
        level: u8,
    },
    Owner {
        subject: PropertyTypeOwnerSubject,
        #[serde(skip)]
        level: u8,
    },
    Viewer {
        subject: PropertyTypeViewerSubject,
        #[serde(skip)]
        level: u8,
    },
}

impl Relationship for (PropertyTypeId, PropertyTypeRelationAndSubject) {
    type Relation = PropertyTypeResourceRelation;
    type Resource = PropertyTypeId;
    type Subject = PropertyTypeSubject;
    type SubjectSet = !;

    fn from_parts(parts: RelationshipParts<Self>) -> Result<Self, impl Error> {
        Ok((
            parts.resource,
            match parts.relation.name {
                PropertyTypeResourceRelation::Setting => PropertyTypeRelationAndSubject::Setting {
                    subject: match (parts.subject, parts.subject_set) {
                        (PropertyTypeSubject::Setting(id), None) => {
                            PropertyTypeSettingSubject::Setting { id }
                        }
                        (PropertyTypeSubject::Web(_) | PropertyTypeSubject::Public, _) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                        }
                    },
                    level: parts.relation.level,
                },
                PropertyTypeResourceRelation::Owner => match (parts.subject, parts.subject_set) {
                    (PropertyTypeSubject::Web(id), None) => PropertyTypeRelationAndSubject::Owner {
                        subject: PropertyTypeOwnerSubject::Web { id },
                        level: parts.relation.level,
                    },
                    (PropertyTypeSubject::Setting(_) | PropertyTypeSubject::Public, None) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                    }
                },
                PropertyTypeResourceRelation::Viewer => match (parts.subject, parts.subject_set) {
                    (PropertyTypeSubject::Public, None) => PropertyTypeRelationAndSubject::Viewer {
                        subject: PropertyTypeViewerSubject::Public,
                        level: parts.relation.level,
                    },
                    (PropertyTypeSubject::Setting(_) | PropertyTypeSubject::Web(_), None) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject(parts));
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
            PropertyTypeRelationAndSubject::Setting { subject, level } => (
                LeveledRelation {
                    name: PropertyTypeResourceRelation::Setting,
                    level,
                },
                match subject {
                    PropertyTypeSettingSubject::Setting { id } => {
                        (PropertyTypeSubject::Setting(id), None)
                    }
                },
            ),
            PropertyTypeRelationAndSubject::Owner { subject, level } => (
                LeveledRelation {
                    name: PropertyTypeResourceRelation::Owner,
                    level,
                },
                match subject {
                    PropertyTypeOwnerSubject::Web { id } => (PropertyTypeSubject::Web(id), None),
                },
            ),
            PropertyTypeRelationAndSubject::Viewer { subject, level } => (
                LeveledRelation {
                    name: PropertyTypeResourceRelation::Viewer,
                    level,
                },
                match subject {
                    PropertyTypeViewerSubject::Public => (PropertyTypeSubject::Public, None),
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
