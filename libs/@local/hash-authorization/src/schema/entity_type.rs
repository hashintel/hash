use std::error::Error;

use graph_types::{
    account::{AccountGroupId, AccountId},
    provenance::OwnedById,
};
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
pub enum EntityTypeNamespace {
    #[serde(rename = "graph/entity_type")]
    EntityType,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[repr(transparent)]
pub struct EntityTypeId(Uuid);

impl EntityTypeId {
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

impl Resource for EntityTypeId {
    type Id = Self;
    type Kind = EntityTypeNamespace;

    #[expect(refining_impl_trait)]
    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, !> {
        match kind {
            EntityTypeNamespace::EntityType => Ok(id),
        }
    }

    fn into_parts(self) -> (Self::Kind, Self::Id) {
        (EntityTypeNamespace::EntityType, self)
    }

    fn to_parts(&self) -> (Self::Kind, Self::Id) {
        Resource::into_parts(*self)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntityTypeResourceRelation {
    Owner,
    Setting,
    Editor,
    Viewer,
    Instantiator,
}

impl Relation<EntityTypeId> for EntityTypeResourceRelation {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum EntityTypePermission {
    Update,
    View,
    Instantiate,
}

impl Permission<EntityTypeId> for EntityTypePermission {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub enum EntityTypeSetting {
    UpdateFromWeb,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "id")]
pub enum EntityTypeSubject {
    Web(OwnedById),
    Setting(EntityTypeSetting),
    Public,
    Account(AccountId),
    AccountGroup(AccountGroupId),
}

#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntityTypeSubjectSet {
    #[default]
    Member,
}

impl Relation<EntityTypeSubject> for EntityTypeSubjectSet {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum EntityTypeSubjectNamespace {
    #[serde(rename = "graph/web")]
    Web,
    #[serde(rename = "graph/setting")]
    Setting,
    #[serde(rename = "graph/account")]
    Account,
    #[serde(rename = "graph/account_group")]
    AccountGroup,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum EntityTypeSubjectId {
    Uuid(Uuid),
    Setting(EntityTypeSetting),
    Asteriks(PublicAccess),
}

impl Resource for EntityTypeSubject {
    type Id = EntityTypeSubjectId;
    type Kind = EntityTypeSubjectNamespace;

    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, impl Error> {
        Ok(match (kind, id) {
            (EntityTypeSubjectNamespace::Web, EntityTypeSubjectId::Uuid(uuid)) => {
                Self::Web(OwnedById::new(uuid))
            }
            (EntityTypeSubjectNamespace::Setting, EntityTypeSubjectId::Setting(setting)) => {
                Self::Setting(setting)
            }
            (
                EntityTypeSubjectNamespace::Account,
                EntityTypeSubjectId::Asteriks(PublicAccess::Public),
            ) => Self::Public,
            (EntityTypeSubjectNamespace::Account, EntityTypeSubjectId::Uuid(id)) => {
                Self::Account(AccountId::new(id))
            }
            (EntityTypeSubjectNamespace::AccountGroup, EntityTypeSubjectId::Uuid(id)) => {
                Self::AccountGroup(AccountGroupId::new(id))
            }
            (
                EntityTypeSubjectNamespace::Web
                | EntityTypeSubjectNamespace::Setting
                | EntityTypeSubjectNamespace::Account
                | EntityTypeSubjectNamespace::AccountGroup,
                _,
            ) => {
                return Err(InvalidResource::<Self>::invalid_id(kind, id));
            }
        })
    }

    fn into_parts(self) -> (Self::Kind, Self::Id) {
        match self {
            Self::Web(web_id) => (
                EntityTypeSubjectNamespace::Web,
                EntityTypeSubjectId::Uuid(web_id.into_uuid()),
            ),
            Self::Setting(setting) => (
                EntityTypeSubjectNamespace::Setting,
                EntityTypeSubjectId::Setting(setting),
            ),
            Self::Public => (
                EntityTypeSubjectNamespace::Account,
                EntityTypeSubjectId::Asteriks(PublicAccess::Public),
            ),
            Self::Account(id) => (
                EntityTypeSubjectNamespace::Account,
                EntityTypeSubjectId::Uuid(id.into_uuid()),
            ),
            Self::AccountGroup(id) => (
                EntityTypeSubjectNamespace::AccountGroup,
                EntityTypeSubjectId::Uuid(id.into_uuid()),
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
pub enum EntityTypeOwnerSubject {
    Web {
        #[serde(rename = "subjectId")]
        id: OwnedById,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum EntityTypeSettingSubject {
    Setting {
        #[serde(rename = "subjectId")]
        id: EntityTypeSetting,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum EntityTypeEditorSubject {
    Account {
        #[serde(rename = "subjectId")]
        id: AccountId,
    },
    AccountGroup {
        #[serde(rename = "subjectId")]
        id: AccountGroupId,
        #[serde(skip)]
        set: EntityTypeSubjectSet,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum EntityTypeViewerSubject {
    Public,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum EntityTypeInstantiatorSubject {
    Public,
    Account {
        #[serde(rename = "subjectId")]
        id: AccountId,
    },
    AccountGroup {
        #[serde(rename = "subjectId")]
        id: AccountGroupId,
        #[serde(skip)]
        set: EntityTypeSubjectSet,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "relation")]
pub enum EntityTypeRelationAndSubject {
    Owner {
        subject: EntityTypeOwnerSubject,
        #[serde(skip)]
        level: u8,
    },
    Setting {
        subject: EntityTypeSettingSubject,
        #[serde(skip)]
        level: u8,
    },
    Editor {
        subject: EntityTypeEditorSubject,
        #[serde(skip)]
        level: u8,
    },
    Viewer {
        subject: EntityTypeViewerSubject,
        #[serde(skip)]
        level: u8,
    },
    Instantiator {
        subject: EntityTypeInstantiatorSubject,
        #[serde(skip)]
        level: u8,
    },
}

impl Relationship for (EntityTypeId, EntityTypeRelationAndSubject) {
    type Relation = EntityTypeResourceRelation;
    type Resource = EntityTypeId;
    type Subject = EntityTypeSubject;
    type SubjectSet = EntityTypeSubjectSet;

    #[expect(clippy::too_many_lines)]
    fn from_parts(parts: RelationshipParts<Self>) -> Result<Self, impl Error> {
        Ok((
            parts.resource,
            match parts.relation.name {
                EntityTypeResourceRelation::Owner => match (parts.subject, parts.subject_set) {
                    (EntityTypeSubject::Web(id), None) => EntityTypeRelationAndSubject::Owner {
                        subject: EntityTypeOwnerSubject::Web { id },
                        level: parts.relation.level,
                    },
                    (EntityTypeSubject::Web(_), _) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                    }
                    (
                        EntityTypeSubject::Setting(_)
                        | EntityTypeSubject::Public
                        | EntityTypeSubject::Account(_)
                        | EntityTypeSubject::AccountGroup(_),
                        _,
                    ) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                    }
                },
                EntityTypeResourceRelation::Setting => EntityTypeRelationAndSubject::Setting {
                    subject: match (parts.subject, parts.subject_set) {
                        (EntityTypeSubject::Setting(id), None) => {
                            EntityTypeSettingSubject::Setting { id }
                        }
                        (EntityTypeSubject::Setting(_), _) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                        }
                        (
                            EntityTypeSubject::Web(_)
                            | EntityTypeSubject::Public
                            | EntityTypeSubject::Account(_)
                            | EntityTypeSubject::AccountGroup(_),
                            _,
                        ) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                        }
                    },
                    level: parts.relation.level,
                },
                EntityTypeResourceRelation::Editor => EntityTypeRelationAndSubject::Editor {
                    subject: match (parts.subject, parts.subject_set) {
                        (EntityTypeSubject::Account(id), None) => {
                            EntityTypeEditorSubject::Account { id }
                        }
                        (EntityTypeSubject::AccountGroup(id), Some(set)) => {
                            EntityTypeEditorSubject::AccountGroup { id, set }
                        }
                        (EntityTypeSubject::Account(_) | EntityTypeSubject::AccountGroup(_), _) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                        }
                        (
                            EntityTypeSubject::Web(_)
                            | EntityTypeSubject::Setting(_)
                            | EntityTypeSubject::Public,
                            _,
                        ) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                        }
                    },
                    level: parts.relation.level,
                },
                EntityTypeResourceRelation::Viewer => EntityTypeRelationAndSubject::Viewer {
                    subject: match (parts.subject, parts.subject_set) {
                        (EntityTypeSubject::Public, None) => EntityTypeViewerSubject::Public,
                        (EntityTypeSubject::Public, _) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject_set(parts));
                        }
                        (
                            EntityTypeSubject::Web(_)
                            | EntityTypeSubject::Setting(_)
                            | EntityTypeSubject::Account(_)
                            | EntityTypeSubject::AccountGroup(_),
                            _,
                        ) => {
                            return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                        }
                    },
                    level: parts.relation.level,
                },
                EntityTypeResourceRelation::Instantiator => {
                    EntityTypeRelationAndSubject::Instantiator {
                        subject: match (parts.subject, parts.subject_set) {
                            (EntityTypeSubject::Public, None) => {
                                EntityTypeInstantiatorSubject::Public
                            }
                            (EntityTypeSubject::Account(id), None) => {
                                EntityTypeInstantiatorSubject::Account { id }
                            }
                            (EntityTypeSubject::AccountGroup(id), Some(set)) => {
                                EntityTypeInstantiatorSubject::AccountGroup { id, set }
                            }
                            (
                                EntityTypeSubject::Account(_) | EntityTypeSubject::AccountGroup(_),
                                _,
                            ) => {
                                return Err(InvalidRelationship::<Self>::invalid_subject_set(
                                    parts,
                                ));
                            }
                            (
                                EntityTypeSubject::Web(_)
                                | EntityTypeSubject::Setting(_)
                                | EntityTypeSubject::Public,
                                _,
                            ) => {
                                return Err(InvalidRelationship::<Self>::invalid_subject(parts));
                            }
                        },
                        level: parts.relation.level,
                    }
                }
            },
        ))
    }

    fn to_parts(&self) -> RelationshipParts<Self> {
        Self::into_parts(*self)
    }

    fn into_parts(self) -> RelationshipParts<Self> {
        let (relation, (subject, subject_set)) = match self.1 {
            EntityTypeRelationAndSubject::Owner { subject, level } => (
                LeveledRelation {
                    name: EntityTypeResourceRelation::Owner,
                    level,
                },
                match subject {
                    EntityTypeOwnerSubject::Web { id } => (EntityTypeSubject::Web(id), None),
                },
            ),
            EntityTypeRelationAndSubject::Setting { subject, level } => (
                LeveledRelation {
                    name: EntityTypeResourceRelation::Setting,
                    level,
                },
                match subject {
                    EntityTypeSettingSubject::Setting { id } => {
                        (EntityTypeSubject::Setting(id), None)
                    }
                },
            ),
            EntityTypeRelationAndSubject::Editor { subject, level } => (
                LeveledRelation {
                    name: EntityTypeResourceRelation::Editor,
                    level,
                },
                match subject {
                    EntityTypeEditorSubject::Account { id } => {
                        (EntityTypeSubject::Account(id), None)
                    }
                    EntityTypeEditorSubject::AccountGroup { id, set } => {
                        (EntityTypeSubject::AccountGroup(id), Some(set))
                    }
                },
            ),
            EntityTypeRelationAndSubject::Viewer { subject, level } => (
                LeveledRelation {
                    name: EntityTypeResourceRelation::Viewer,
                    level,
                },
                match subject {
                    EntityTypeViewerSubject::Public => (EntityTypeSubject::Public, None),
                },
            ),
            EntityTypeRelationAndSubject::Instantiator { subject, level } => (
                LeveledRelation {
                    name: EntityTypeResourceRelation::Instantiator,
                    level,
                },
                match subject {
                    EntityTypeInstantiatorSubject::Public => (EntityTypeSubject::Public, None),
                    EntityTypeInstantiatorSubject::Account { id } => {
                        (EntityTypeSubject::Account(id), None)
                    }
                    EntityTypeInstantiatorSubject::AccountGroup { id, set } => {
                        (EntityTypeSubject::AccountGroup(id), Some(set))
                    }
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
