use core::error::Error;

use graph_types::{
    account::{AccountGroupId, AccountId},
    owned_by_id::OwnedById,
};
use serde::{Deserialize, Serialize};
use type_system::schema::PropertyTypeId;
use uuid::Uuid;

use crate::{
    schema::{
        PublicAccess,
        error::{InvalidRelationship, InvalidResource},
    },
    zanzibar::{
        Permission, Relation,
        types::{LeveledRelation, Relationship, RelationshipParts, Resource},
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PropertyTypeNamespace {
    #[serde(rename = "graph/property_type")]
    PropertyType,
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

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PropertyTypeResourceRelation {
    Owner,
    Setting,
    Editor,
    Viewer,
}

impl Relation<PropertyTypeId> for PropertyTypeResourceRelation {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum PropertyTypePermission {
    Update,
    View,
}

impl Permission<PropertyTypeId> for PropertyTypePermission {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub enum PropertyTypeSetting {
    UpdateFromWeb,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "id")]
pub enum PropertyTypeSubject {
    Web(OwnedById),
    Setting(PropertyTypeSetting),
    Public,
    Account(AccountId),
    AccountGroup(AccountGroupId),
}

#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PropertyTypeSubjectSet {
    #[default]
    Member,
}

impl Relation<PropertyTypeSubject> for PropertyTypeSubjectSet {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PropertyTypeSubjectNamespace {
    #[serde(rename = "graph/web")]
    Web,
    #[serde(rename = "graph/setting")]
    Setting,
    #[serde(rename = "graph/account")]
    Account,
    #[serde(rename = "graph/account_group")]
    AccountGroup,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PropertyTypeSubjectId {
    Uuid(Uuid),
    Setting(PropertyTypeSetting),
    Asteriks(PublicAccess),
}

impl Resource for PropertyTypeSubject {
    type Id = PropertyTypeSubjectId;
    type Kind = PropertyTypeSubjectNamespace;

    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, impl Error> {
        Ok(match (kind, id) {
            (PropertyTypeSubjectNamespace::Web, PropertyTypeSubjectId::Uuid(uuid)) => {
                Self::Web(OwnedById::new(uuid))
            }
            (PropertyTypeSubjectNamespace::Setting, PropertyTypeSubjectId::Setting(setting)) => {
                Self::Setting(setting)
            }
            (
                PropertyTypeSubjectNamespace::Account,
                PropertyTypeSubjectId::Asteriks(PublicAccess::Public),
            ) => Self::Public,
            (PropertyTypeSubjectNamespace::Account, PropertyTypeSubjectId::Uuid(id)) => {
                Self::Account(AccountId::new(id))
            }
            (PropertyTypeSubjectNamespace::AccountGroup, PropertyTypeSubjectId::Uuid(id)) => {
                Self::AccountGroup(AccountGroupId::new(id))
            }
            (
                PropertyTypeSubjectNamespace::Web
                | PropertyTypeSubjectNamespace::Setting
                | PropertyTypeSubjectNamespace::Account
                | PropertyTypeSubjectNamespace::AccountGroup,
                _,
            ) => {
                return Err(InvalidResource::<Self>::invalid_id(kind, id));
            }
        })
    }

    fn into_parts(self) -> (Self::Kind, Self::Id) {
        match self {
            Self::Web(web_id) => (
                PropertyTypeSubjectNamespace::Web,
                PropertyTypeSubjectId::Uuid(web_id.into_uuid()),
            ),
            Self::Setting(setting) => (
                PropertyTypeSubjectNamespace::Setting,
                PropertyTypeSubjectId::Setting(setting),
            ),
            Self::Public => (
                PropertyTypeSubjectNamespace::Account,
                PropertyTypeSubjectId::Asteriks(PublicAccess::Public),
            ),
            Self::Account(id) => (
                PropertyTypeSubjectNamespace::Account,
                PropertyTypeSubjectId::Uuid(id.into_uuid()),
            ),
            Self::AccountGroup(id) => (
                PropertyTypeSubjectNamespace::AccountGroup,
                PropertyTypeSubjectId::Uuid(id.into_uuid()),
            ),
        }
    }

    fn to_parts(&self) -> (Self::Kind, Self::Id) {
        Resource::into_parts(*self)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum PropertyTypeOwnerSubject {
    Web {
        #[serde(rename = "subjectId")]
        id: OwnedById,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum PropertyTypeSettingSubject {
    Setting {
        #[serde(rename = "subjectId")]
        id: PropertyTypeSetting,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum PropertyTypeEditorSubject {
    Account {
        #[serde(rename = "subjectId")]
        id: AccountId,
    },
    AccountGroup {
        #[serde(rename = "subjectId")]
        id: AccountGroupId,
        #[serde(skip)]
        set: PropertyTypeSubjectSet,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum PropertyTypeViewerSubject {
    Public,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "relation")]
pub enum PropertyTypeRelationAndSubject {
    Owner {
        subject: PropertyTypeOwnerSubject,
        #[serde(skip)]
        level: u8,
    },
    Setting {
        subject: PropertyTypeSettingSubject,
        #[serde(skip)]
        level: u8,
    },
    Editor {
        subject: PropertyTypeEditorSubject,
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
    type SubjectSet = PropertyTypeSubjectSet;

    fn from_parts(parts: RelationshipParts<Self>) -> Result<Self, impl Error> {
        Ok((parts.resource, match parts.relation.name {
            PropertyTypeResourceRelation::Owner => match (parts.subject, parts.subject_set) {
                (PropertyTypeSubject::Web(id), None) => PropertyTypeRelationAndSubject::Owner {
                    subject: PropertyTypeOwnerSubject::Web { id },
                    level: parts.relation.level,
                },
                (PropertyTypeSubject::Web(_), _) => {
                    return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                }
                (
                    PropertyTypeSubject::Setting(_)
                    | PropertyTypeSubject::Public
                    | PropertyTypeSubject::Account(_)
                    | PropertyTypeSubject::AccountGroup(_),
                    _,
                ) => {
                    return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                }
            },
            PropertyTypeResourceRelation::Setting => PropertyTypeRelationAndSubject::Setting {
                subject: match (parts.subject, parts.subject_set) {
                    (PropertyTypeSubject::Setting(id), None) => {
                        PropertyTypeSettingSubject::Setting { id }
                    }
                    (PropertyTypeSubject::Setting(_), _) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                    }
                    (
                        PropertyTypeSubject::Web(_)
                        | PropertyTypeSubject::Public
                        | PropertyTypeSubject::Account(_)
                        | PropertyTypeSubject::AccountGroup(_),
                        _,
                    ) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                    }
                },
                level: parts.relation.level,
            },
            PropertyTypeResourceRelation::Editor => PropertyTypeRelationAndSubject::Editor {
                subject: match (parts.subject, parts.subject_set) {
                    (PropertyTypeSubject::Account(id), None) => {
                        PropertyTypeEditorSubject::Account { id }
                    }
                    (PropertyTypeSubject::AccountGroup(id), Some(set)) => {
                        PropertyTypeEditorSubject::AccountGroup { id, set }
                    }
                    (PropertyTypeSubject::Account(_) | PropertyTypeSubject::AccountGroup(_), _) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                    }
                    (
                        PropertyTypeSubject::Web(_)
                        | PropertyTypeSubject::Setting(_)
                        | PropertyTypeSubject::Public,
                        _,
                    ) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                    }
                },
                level: parts.relation.level,
            },
            PropertyTypeResourceRelation::Viewer => PropertyTypeRelationAndSubject::Viewer {
                subject: match (parts.subject, parts.subject_set) {
                    (PropertyTypeSubject::Public, None) => PropertyTypeViewerSubject::Public,
                    (PropertyTypeSubject::Public, _) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                    }
                    (
                        PropertyTypeSubject::Web(_)
                        | PropertyTypeSubject::Setting(_)
                        | PropertyTypeSubject::Account(_)
                        | PropertyTypeSubject::AccountGroup(_),
                        _,
                    ) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                    }
                },
                level: parts.relation.level,
            },
        }))
    }

    fn to_parts(&self) -> RelationshipParts<Self> {
        Self::into_parts(*self)
    }

    fn into_parts(self) -> RelationshipParts<Self> {
        let (relation, (subject, subject_set)) = match self.1 {
            PropertyTypeRelationAndSubject::Owner { subject, level } => (
                LeveledRelation {
                    name: PropertyTypeResourceRelation::Owner,
                    level,
                },
                match subject {
                    PropertyTypeOwnerSubject::Web { id } => (PropertyTypeSubject::Web(id), None),
                },
            ),
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
            PropertyTypeRelationAndSubject::Editor { subject, level } => (
                LeveledRelation {
                    name: PropertyTypeResourceRelation::Editor,
                    level,
                },
                match subject {
                    PropertyTypeEditorSubject::Account { id } => {
                        (PropertyTypeSubject::Account(id), None)
                    }
                    PropertyTypeEditorSubject::AccountGroup { id, set } => {
                        (PropertyTypeSubject::AccountGroup(id), Some(set))
                    }
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
