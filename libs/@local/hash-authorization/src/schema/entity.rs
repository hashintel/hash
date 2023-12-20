use std::error::Error;

use graph_types::{
    account::{AccountGroupId, AccountId},
    knowledge::entity::EntityUuid,
    owned_by_id::OwnedById,
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

    #[expect(refining_impl_trait)]
    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, !> {
        match kind {
            EntityNamespace::Entity => Ok(id),
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
    Setting,
    Owner,
    Administrator,
    Editor,
    Viewer,
}

impl Relation<EntityUuid> for EntityResourceRelation {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum EntityPermission {
    FullAccess,
    Update,
    View,
}

impl Permission<EntityUuid> for EntityPermission {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub enum EntitySetting {
    AdministratorFromWeb,
    UpdateFromWeb,
    ViewFromWeb,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "id")]
pub enum EntitySubject {
    Setting(EntitySetting),
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
    #[serde(rename = "graph/setting")]
    Setting,
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
    Setting(EntitySetting),
    Uuid(Uuid),
    Asteriks(PublicAccess),
}

impl Resource for EntitySubject {
    type Id = EntitySubjectId;
    type Kind = EntitySubjectNamespace;

    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, impl Error> {
        Ok(match (kind, id) {
            (EntitySubjectNamespace::Setting, EntitySubjectId::Setting(setting)) => {
                Self::Setting(setting)
            }
            (EntitySubjectNamespace::Web, EntitySubjectId::Uuid(uuid)) => {
                Self::Web(OwnedById::new(uuid))
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
                EntitySubjectId::Asteriks(PublicAccess::Public) | EntitySubjectId::Setting(_),
            )
            | (EntitySubjectNamespace::Account, EntitySubjectId::Setting(_))
            | (
                EntitySubjectNamespace::Setting,
                EntitySubjectId::Uuid(_) | EntitySubjectId::Asteriks(_),
            ) => {
                return Err(InvalidResource::<Self>::invalid_id(kind, id));
            }
        })
    }

    fn into_parts(self) -> (Self::Kind, Self::Id) {
        match self {
            Self::Setting(setting) => (
                EntitySubjectNamespace::Setting,
                EntitySubjectId::Setting(setting),
            ),
            Self::Web(web_id) => (
                EntitySubjectNamespace::Web,
                EntitySubjectId::Uuid(web_id.into_uuid()),
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
pub enum EntitySettingSubject {
    Setting {
        #[serde(rename = "subjectId")]
        id: EntitySetting,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum EntityOwnerSubject {
    Web {
        #[serde(rename = "subjectId")]
        id: OwnedById,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum EntityAdministratorSubject {
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
    Setting {
        subject: EntitySettingSubject,
        #[serde(skip)]
        level: u8,
    },
    Owner {
        subject: EntityOwnerSubject,
        #[serde(skip)]
        level: u8,
    },
    Administrator {
        subject: EntityAdministratorSubject,
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

    #[expect(clippy::too_many_lines)]
    fn from_parts(parts: RelationshipParts<Self>) -> Result<Self, impl Error> {
        Ok((
            parts.resource,
            match parts.relation.name {
                EntityResourceRelation::Setting => EntityRelationAndSubject::Setting {
                    subject: match (parts.subject, parts.subject_set) {
                        (EntitySubject::Setting(id), None) => EntitySettingSubject::Setting { id },
                        (EntitySubject::Setting(_), Some(_)) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                        }
                        (
                            EntitySubject::Web(_)
                            | EntitySubject::Public
                            | EntitySubject::Account(_)
                            | EntitySubject::AccountGroup(_),
                            _,
                        ) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                        }
                    },
                    level: parts.relation.level,
                },
                EntityResourceRelation::Owner => EntityRelationAndSubject::Owner {
                    subject: match (parts.subject, parts.subject_set) {
                        (EntitySubject::Web(id), None) => EntityOwnerSubject::Web { id },
                        (EntitySubject::Web(_), Some(_)) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                        }
                        (
                            EntitySubject::Setting(_)
                            | EntitySubject::Public
                            | EntitySubject::Account(_)
                            | EntitySubject::AccountGroup(_),
                            _,
                        ) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                        }
                    },
                    level: parts.relation.level,
                },
                EntityResourceRelation::Administrator => EntityRelationAndSubject::Administrator {
                    subject: match (parts.subject, parts.subject_set) {
                        (EntitySubject::Account(id), None) => {
                            EntityAdministratorSubject::Account { id }
                        }
                        (EntitySubject::AccountGroup(id), Some(set)) => {
                            EntityAdministratorSubject::AccountGroup { id, set }
                        }
                        (EntitySubject::Account(_) | EntitySubject::AccountGroup(_), _) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                        }
                        (
                            EntitySubject::Web(_)
                            | EntitySubject::Public
                            | EntitySubject::Setting(_),
                            _,
                        ) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                        }
                    },
                    level: parts.relation.level,
                },
                EntityResourceRelation::Editor => EntityRelationAndSubject::Editor {
                    subject: match (parts.subject, parts.subject_set) {
                        (EntitySubject::Account(id), None) => EntityEditorSubject::Account { id },
                        (EntitySubject::AccountGroup(id), Some(set)) => {
                            EntityEditorSubject::AccountGroup { id, set }
                        }
                        (EntitySubject::Account(_) | EntitySubject::AccountGroup(_), _) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                        }
                        (
                            EntitySubject::Web(_)
                            | EntitySubject::Public
                            | EntitySubject::Setting(_),
                            _,
                        ) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                        }
                    },
                    level: parts.relation.level,
                },
                EntityResourceRelation::Viewer => EntityRelationAndSubject::Viewer {
                    subject: match (parts.subject, parts.subject_set) {
                        (EntitySubject::Public, None) => EntityViewerSubject::Public,
                        (EntitySubject::Account(id), None) => EntityViewerSubject::Account { id },
                        (EntitySubject::AccountGroup(id), Some(set)) => {
                            EntityViewerSubject::AccountGroup { id, set }
                        }
                        (
                            EntitySubject::Public
                            | EntitySubject::Account(_)
                            | EntitySubject::AccountGroup(_),
                            _,
                        ) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                        }
                        (EntitySubject::Web(_) | EntitySubject::Setting(_), _) => {
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
            EntityRelationAndSubject::Setting { subject, level } => (
                LeveledRelation {
                    name: EntityResourceRelation::Setting,
                    level,
                },
                match subject {
                    EntitySettingSubject::Setting { id } => (EntitySubject::Setting(id), None),
                },
            ),
            EntityRelationAndSubject::Owner { subject, level } => (
                LeveledRelation {
                    name: EntityResourceRelation::Owner,
                    level,
                },
                match subject {
                    EntityOwnerSubject::Web { id } => (EntitySubject::Web(id), None),
                },
            ),
            EntityRelationAndSubject::Administrator { subject, level } => (
                LeveledRelation {
                    name: EntityResourceRelation::Administrator,
                    level,
                },
                match subject {
                    EntityAdministratorSubject::Account { id } => {
                        (EntitySubject::Account(id), None)
                    }
                    EntityAdministratorSubject::AccountGroup { id, set } => {
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
