use std::error::Error;

use graph_types::{
    account::{AccountGroupId, AccountId},
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
pub enum WebNamespace {
    #[serde(rename = "graph/web")]
    Web,
}

impl Resource for OwnedById {
    type Id = Self;
    type Kind = WebNamespace;

    #[expect(refining_impl_trait)]
    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, !> {
        match kind {
            WebNamespace::Web => Ok(id),
        }
    }

    fn into_parts(self) -> (Self::Kind, Self::Id) {
        (WebNamespace::Web, self)
    }

    fn to_parts(&self) -> (Self::Kind, Self::Id) {
        Resource::into_parts(*self)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WebResourceRelation {
    Owner,

    EntityCreator,
    EntityEditor,
    EntityViewer,

    EntityTypeViewer,
    PropertyTypeViewer,
    DataTypeViewer,
}

impl Relation<OwnedById> for WebResourceRelation {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum WebPermission {
    ChangePermission,

    CreateEntity,
    UpdateEntity,
    ViewEntity,

    CreateEntityType,
    CreatePropertyType,
    CreateDataType,
}
impl Permission<OwnedById> for WebPermission {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "id")]
pub enum WebSubject {
    Public,
    Account(AccountId),
    AccountGroup(AccountGroupId),
}

#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WebSubjectSet {
    #[default]
    Member,
}

impl Relation<WebSubject> for WebSubjectSet {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum WebSubjectNamespace {
    #[serde(rename = "graph/account")]
    Account,
    #[serde(rename = "graph/account_group")]
    AccountGroup,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum WebSubjectId {
    Uuid(Uuid),
    Asteriks(PublicAccess),
}

impl Resource for WebSubject {
    type Id = WebSubjectId;
    type Kind = WebSubjectNamespace;

    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, impl Error> {
        Ok(match (kind, id) {
            (WebSubjectNamespace::Account, WebSubjectId::Asteriks(PublicAccess::Public)) => {
                Self::Public
            }
            (WebSubjectNamespace::Account, WebSubjectId::Uuid(id)) => {
                Self::Account(AccountId::new(id))
            }
            (WebSubjectNamespace::AccountGroup, WebSubjectId::Uuid(id)) => {
                Self::AccountGroup(AccountGroupId::new(id))
            }
            (WebSubjectNamespace::AccountGroup, WebSubjectId::Asteriks(PublicAccess::Public)) => {
                return Err(InvalidResource::<Self>::invalid_id(kind, id));
            }
        })
    }

    fn into_parts(self) -> (Self::Kind, Self::Id) {
        match self {
            Self::Public => (
                WebSubjectNamespace::Account,
                WebSubjectId::Asteriks(PublicAccess::Public),
            ),
            Self::Account(id) => (
                WebSubjectNamespace::Account,
                WebSubjectId::Uuid(id.into_uuid()),
            ),
            Self::AccountGroup(id) => (
                WebSubjectNamespace::AccountGroup,
                WebSubjectId::Uuid(id.into_uuid()),
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
pub enum WebOwnerSubject {
    Account {
        #[serde(rename = "subjectId")]
        id: AccountId,
    },
    AccountGroup {
        #[serde(rename = "subjectId")]
        id: AccountGroupId,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum WebEntityCreatorSubject {
    Account {
        #[serde(rename = "subjectId")]
        id: AccountId,
    },
    AccountGroup {
        #[serde(rename = "subjectId")]
        id: AccountGroupId,
        #[serde(skip)]
        set: WebSubjectSet,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum WebEntityEditorSubject {
    Account {
        #[serde(rename = "subjectId")]
        id: AccountId,
    },
    AccountGroup {
        #[serde(rename = "subjectId")]
        id: AccountGroupId,
        #[serde(skip)]
        set: WebSubjectSet,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum WebEntityViewerSubject {
    Public,
    Account {
        #[serde(rename = "subjectId")]
        id: AccountId,
    },
    AccountGroup {
        #[serde(rename = "subjectId")]
        id: AccountGroupId,
        #[serde(skip)]
        set: WebSubjectSet,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum WebEntityTypeViewerSubject {
    Public,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum WebPropertyTypeViewerSubject {
    Public,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum WebDataTypeViewerSubject {
    Public,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "relation")]
pub enum WebRelationAndSubject {
    Owner {
        subject: WebOwnerSubject,
        #[serde(skip)]
        level: u8,
    },
    EntityCreator {
        subject: WebEntityCreatorSubject,
        #[serde(skip)]
        level: u8,
    },
    EntityEditor {
        subject: WebEntityEditorSubject,
        #[serde(skip)]
        level: u8,
    },
    EntityViewer {
        subject: WebEntityViewerSubject,
        #[serde(skip)]
        level: u8,
    },
    EntityTypeViewer {
        subject: WebEntityTypeViewerSubject,
        #[serde(skip)]
        level: u8,
    },
    PropertyTypeViewer {
        subject: WebPropertyTypeViewerSubject,
        #[serde(skip)]
        level: u8,
    },
    DataTypeViewer {
        subject: WebDataTypeViewerSubject,
        #[serde(skip)]
        level: u8,
    },
}

impl Relationship for (OwnedById, WebRelationAndSubject) {
    type Relation = WebResourceRelation;
    type Resource = OwnedById;
    type Subject = WebSubject;
    type SubjectSet = WebSubjectSet;

    #[expect(clippy::too_many_lines)]
    fn from_parts(parts: RelationshipParts<Self>) -> Result<Self, impl Error> {
        Ok((
            parts.resource,
            match parts.relation.name {
                WebResourceRelation::Owner => WebRelationAndSubject::Owner {
                    subject: match (parts.subject, parts.subject_set) {
                        (WebSubject::Account(id), None) => WebOwnerSubject::Account { id },
                        (WebSubject::AccountGroup(id), None) => {
                            WebOwnerSubject::AccountGroup { id }
                        }
                        (WebSubject::Account(_) | WebSubject::AccountGroup(_), Some(_)) => {
                            return Err(InvalidRelationship::invalid_subject_set(parts));
                        }
                        (WebSubject::Public, _) => {
                            return Err(InvalidRelationship::invalid_subject(parts));
                        }
                    },
                    level: parts.relation.level,
                },
                WebResourceRelation::EntityCreator => WebRelationAndSubject::EntityCreator {
                    subject: match (parts.subject, parts.subject_set) {
                        (WebSubject::Account(id), None) => WebEntityCreatorSubject::Account { id },
                        (WebSubject::AccountGroup(id), Some(set)) => {
                            WebEntityCreatorSubject::AccountGroup { id, set }
                        }
                        (WebSubject::Account(_) | WebSubject::AccountGroup(_), _) => {
                            return Err(InvalidRelationship::invalid_subject_set(parts));
                        }
                        (WebSubject::Public, _) => {
                            return Err(InvalidRelationship::invalid_subject(parts));
                        }
                    },
                    level: parts.relation.level,
                },
                WebResourceRelation::EntityEditor => WebRelationAndSubject::EntityEditor {
                    subject: match (parts.subject, parts.subject_set) {
                        (WebSubject::Account(id), None) => WebEntityEditorSubject::Account { id },
                        (WebSubject::AccountGroup(id), Some(set)) => {
                            WebEntityEditorSubject::AccountGroup { id, set }
                        }
                        (WebSubject::Account(_) | WebSubject::AccountGroup(_), _) => {
                            return Err(InvalidRelationship::invalid_subject_set(parts));
                        }
                        (WebSubject::Public, _) => {
                            return Err(InvalidRelationship::invalid_subject(parts));
                        }
                    },
                    level: parts.relation.level,
                },
                WebResourceRelation::EntityViewer => WebRelationAndSubject::EntityViewer {
                    subject: match (parts.subject, parts.subject_set) {
                        (WebSubject::Account(id), None) => WebEntityViewerSubject::Account { id },
                        (WebSubject::AccountGroup(id), Some(set)) => {
                            WebEntityViewerSubject::AccountGroup { id, set }
                        }
                        (WebSubject::Public, None) => WebEntityViewerSubject::Public,
                        (
                            WebSubject::Account(_)
                            | WebSubject::AccountGroup(_)
                            | WebSubject::Public,
                            _,
                        ) => {
                            return Err(InvalidRelationship::invalid_subject_set(parts));
                        }
                    },
                    level: parts.relation.level,
                },
                WebResourceRelation::EntityTypeViewer => WebRelationAndSubject::EntityTypeViewer {
                    subject: match (parts.subject, parts.subject_set) {
                        (WebSubject::Public, None) => WebEntityTypeViewerSubject::Public,
                        (WebSubject::Public, _) => {
                            return Err(InvalidRelationship::invalid_subject_set(parts));
                        }
                        (WebSubject::Account(_) | WebSubject::AccountGroup(_), _) => {
                            return Err(InvalidRelationship::invalid_subject(parts));
                        }
                    },
                    level: parts.relation.level,
                },
                WebResourceRelation::PropertyTypeViewer => {
                    WebRelationAndSubject::PropertyTypeViewer {
                        subject: match (parts.subject, parts.subject_set) {
                            (WebSubject::Public, None) => WebPropertyTypeViewerSubject::Public,
                            (WebSubject::Public, _) => {
                                return Err(InvalidRelationship::invalid_subject_set(parts));
                            }
                            (WebSubject::Account(_) | WebSubject::AccountGroup(_), _) => {
                                return Err(InvalidRelationship::invalid_subject(parts));
                            }
                        },
                        level: parts.relation.level,
                    }
                }
                WebResourceRelation::DataTypeViewer => WebRelationAndSubject::DataTypeViewer {
                    subject: match (parts.subject, parts.subject_set) {
                        (WebSubject::Public, None) => WebDataTypeViewerSubject::Public,
                        (WebSubject::Public, _) => {
                            return Err(InvalidRelationship::invalid_subject_set(parts));
                        }
                        (WebSubject::Account(_) | WebSubject::AccountGroup(_), _) => {
                            return Err(InvalidRelationship::invalid_subject(parts));
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
            WebRelationAndSubject::Owner { subject, level } => (
                LeveledRelation {
                    name: WebResourceRelation::Owner,
                    level,
                },
                match subject {
                    WebOwnerSubject::Account { id } => (WebSubject::Account(id), None),
                    WebOwnerSubject::AccountGroup { id } => (WebSubject::AccountGroup(id), None),
                },
            ),
            WebRelationAndSubject::EntityCreator { subject, level } => (
                LeveledRelation {
                    name: WebResourceRelation::EntityCreator,
                    level,
                },
                match subject {
                    WebEntityCreatorSubject::Account { id } => (WebSubject::Account(id), None),
                    WebEntityCreatorSubject::AccountGroup { id, set } => {
                        (WebSubject::AccountGroup(id), Some(set))
                    }
                },
            ),
            WebRelationAndSubject::EntityEditor { subject, level } => (
                LeveledRelation {
                    name: WebResourceRelation::EntityEditor,
                    level,
                },
                match subject {
                    WebEntityEditorSubject::Account { id } => (WebSubject::Account(id), None),
                    WebEntityEditorSubject::AccountGroup { id, set } => {
                        (WebSubject::AccountGroup(id), Some(set))
                    }
                },
            ),
            WebRelationAndSubject::EntityViewer { subject, level } => (
                LeveledRelation {
                    name: WebResourceRelation::EntityViewer,
                    level,
                },
                match subject {
                    WebEntityViewerSubject::Public => (WebSubject::Public, None),
                    WebEntityViewerSubject::Account { id } => (WebSubject::Account(id), None),
                    WebEntityViewerSubject::AccountGroup { id, set } => {
                        (WebSubject::AccountGroup(id), Some(set))
                    }
                },
            ),
            WebRelationAndSubject::EntityTypeViewer { subject, level } => (
                LeveledRelation {
                    name: WebResourceRelation::EntityTypeViewer,
                    level,
                },
                match subject {
                    WebEntityTypeViewerSubject::Public => (WebSubject::Public, None),
                },
            ),
            WebRelationAndSubject::PropertyTypeViewer { subject, level } => (
                LeveledRelation {
                    name: WebResourceRelation::PropertyTypeViewer,
                    level,
                },
                match subject {
                    WebPropertyTypeViewerSubject::Public => (WebSubject::Public, None),
                },
            ),
            WebRelationAndSubject::DataTypeViewer { subject, level } => (
                LeveledRelation {
                    name: WebResourceRelation::DataTypeViewer,
                    level,
                },
                match subject {
                    WebDataTypeViewerSubject::Public => (WebSubject::Public, None),
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
