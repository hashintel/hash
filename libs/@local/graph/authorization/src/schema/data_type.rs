use core::error::Error;

use serde::{Deserialize, Serialize};
use type_system::{
    knowledge::entity::id::EntityUuid,
    ontology::data_type::DataTypeUuid,
    principal::{
        actor::ActorEntityUuid,
        actor_group::{ActorGroupEntityUuid, WebId},
    },
};

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
pub enum DataTypeNamespace {
    #[serde(rename = "graph/data_type")]
    DataType,
}

impl Resource for DataTypeUuid {
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

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DataTypeResourceRelation {
    Owner,
    Setting,
    Editor,
    Viewer,
}

impl Relation<DataTypeUuid> for DataTypeResourceRelation {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum DataTypePermission {
    Update,
    View,
}

impl Permission<DataTypeUuid> for DataTypePermission {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub enum DataTypeSetting {
    UpdateFromWeb,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "id")]
pub enum DataTypeSubject {
    Web(WebId),
    Setting(DataTypeSetting),
    Public,
    Account(ActorEntityUuid),
    AccountGroup(ActorGroupEntityUuid),
}

#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DataTypeSubjectSet {
    #[default]
    Member,
}

impl Relation<DataTypeSubject> for DataTypeSubjectSet {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum DataTypeSubjectNamespace {
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
pub enum DataTypeSubjectId {
    Uuid(EntityUuid),
    Setting(DataTypeSetting),
    Asteriks(PublicAccess),
}

impl Resource for DataTypeSubject {
    type Id = DataTypeSubjectId;
    type Kind = DataTypeSubjectNamespace;

    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, impl Error> {
        Ok(match (kind, id) {
            (DataTypeSubjectNamespace::Web, DataTypeSubjectId::Uuid(uuid)) => {
                Self::Web(WebId::new(uuid))
            }
            (DataTypeSubjectNamespace::Setting, DataTypeSubjectId::Setting(setting)) => {
                Self::Setting(setting)
            }
            (
                DataTypeSubjectNamespace::Account,
                DataTypeSubjectId::Asteriks(PublicAccess::Public),
            ) => Self::Public,
            (DataTypeSubjectNamespace::Account, DataTypeSubjectId::Uuid(uuid)) => {
                Self::Account(ActorEntityUuid::new(uuid))
            }
            (DataTypeSubjectNamespace::AccountGroup, DataTypeSubjectId::Uuid(uuid)) => {
                Self::AccountGroup(ActorGroupEntityUuid::new(uuid))
            }
            (
                DataTypeSubjectNamespace::Web
                | DataTypeSubjectNamespace::Setting
                | DataTypeSubjectNamespace::Account
                | DataTypeSubjectNamespace::AccountGroup,
                _,
            ) => {
                return Err(InvalidResource::<Self>::invalid_id(kind, id));
            }
        })
    }

    fn into_parts(self) -> (Self::Kind, Self::Id) {
        match self {
            Self::Web(web_id) => (
                DataTypeSubjectNamespace::Web,
                DataTypeSubjectId::Uuid(web_id.into()),
            ),
            Self::Setting(setting) => (
                DataTypeSubjectNamespace::Setting,
                DataTypeSubjectId::Setting(setting),
            ),
            Self::Public => (
                DataTypeSubjectNamespace::Account,
                DataTypeSubjectId::Asteriks(PublicAccess::Public),
            ),
            Self::Account(id) => (
                DataTypeSubjectNamespace::Account,
                DataTypeSubjectId::Uuid(id.into()),
            ),
            Self::AccountGroup(id) => (
                DataTypeSubjectNamespace::AccountGroup,
                DataTypeSubjectId::Uuid(id.into()),
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
pub enum DataTypeOwnerSubject {
    Web {
        #[serde(rename = "subjectId")]
        id: WebId,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum DataTypeSettingSubject {
    Setting {
        #[serde(rename = "subjectId")]
        id: DataTypeSetting,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum DataTypeEditorSubject {
    Account {
        #[serde(rename = "subjectId")]
        id: ActorEntityUuid,
    },
    AccountGroup {
        #[serde(rename = "subjectId")]
        id: ActorGroupEntityUuid,
        #[serde(skip)]
        set: DataTypeSubjectSet,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum DataTypeViewerSubject {
    Public,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "relation")]
pub enum DataTypeRelationAndSubject {
    Owner {
        subject: DataTypeOwnerSubject,
        #[serde(skip)]
        level: u8,
    },
    Setting {
        subject: DataTypeSettingSubject,
        #[serde(skip)]
        level: u8,
    },
    Editor {
        subject: DataTypeEditorSubject,
        #[serde(skip)]
        level: u8,
    },
    Viewer {
        subject: DataTypeViewerSubject,
        #[serde(skip)]
        level: u8,
    },
}

impl Relationship for (DataTypeUuid, DataTypeRelationAndSubject) {
    type Relation = DataTypeResourceRelation;
    type Resource = DataTypeUuid;
    type Subject = DataTypeSubject;
    type SubjectSet = DataTypeSubjectSet;

    fn from_parts(parts: RelationshipParts<Self>) -> Result<Self, impl Error> {
        Ok((
            parts.resource,
            match parts.relation.name {
                DataTypeResourceRelation::Owner => match (parts.subject, parts.subject_set) {
                    (DataTypeSubject::Web(id), None) => DataTypeRelationAndSubject::Owner {
                        subject: DataTypeOwnerSubject::Web { id },
                        level: parts.relation.level,
                    },
                    (DataTypeSubject::Web(_), _) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                    }
                    (
                        DataTypeSubject::Setting(_)
                        | DataTypeSubject::Public
                        | DataTypeSubject::Account(_)
                        | DataTypeSubject::AccountGroup(_),
                        _,
                    ) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                    }
                },
                DataTypeResourceRelation::Setting => DataTypeRelationAndSubject::Setting {
                    subject: match (parts.subject, parts.subject_set) {
                        (DataTypeSubject::Setting(id), None) => {
                            DataTypeSettingSubject::Setting { id }
                        }
                        (DataTypeSubject::Setting(_), _) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                        }
                        (
                            DataTypeSubject::Web(_)
                            | DataTypeSubject::Public
                            | DataTypeSubject::Account(_)
                            | DataTypeSubject::AccountGroup(_),
                            _,
                        ) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                        }
                    },
                    level: parts.relation.level,
                },
                DataTypeResourceRelation::Editor => DataTypeRelationAndSubject::Editor {
                    subject: match (parts.subject, parts.subject_set) {
                        (DataTypeSubject::Account(id), None) => {
                            DataTypeEditorSubject::Account { id }
                        }
                        (DataTypeSubject::AccountGroup(id), Some(set)) => {
                            DataTypeEditorSubject::AccountGroup { id, set }
                        }
                        (DataTypeSubject::Account(_) | DataTypeSubject::AccountGroup(_), _) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                        }
                        (
                            DataTypeSubject::Web(_)
                            | DataTypeSubject::Setting(_)
                            | DataTypeSubject::Public,
                            _,
                        ) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                        }
                    },
                    level: parts.relation.level,
                },
                DataTypeResourceRelation::Viewer => DataTypeRelationAndSubject::Viewer {
                    subject: match (parts.subject, parts.subject_set) {
                        (DataTypeSubject::Public, None) => DataTypeViewerSubject::Public,
                        (DataTypeSubject::Public, _) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                        }
                        (
                            DataTypeSubject::Web(_)
                            | DataTypeSubject::Setting(_)
                            | DataTypeSubject::Account(_)
                            | DataTypeSubject::AccountGroup(_),
                            _,
                        ) => {
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
            DataTypeRelationAndSubject::Setting { subject, level } => (
                LeveledRelation {
                    name: DataTypeResourceRelation::Setting,
                    level,
                },
                match subject {
                    DataTypeSettingSubject::Setting { id } => (DataTypeSubject::Setting(id), None),
                },
            ),
            DataTypeRelationAndSubject::Editor { subject, level } => (
                LeveledRelation {
                    name: DataTypeResourceRelation::Editor,
                    level,
                },
                match subject {
                    DataTypeEditorSubject::Account { id } => (DataTypeSubject::Account(id), None),
                    DataTypeEditorSubject::AccountGroup { id, set } => {
                        (DataTypeSubject::AccountGroup(id), Some(set))
                    }
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
