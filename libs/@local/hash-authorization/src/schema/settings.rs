use serde::{Deserialize, Serialize};

use crate::{
    schema::{EntitySetting, PublicAccess},
    zanzibar::{
        types::{LeveledRelation, Relationship, RelationshipParts, Resource},
        Relation,
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SettingNamespace {
    #[serde(rename = "graph/setting")]
    Setting,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SettingName {
    Entity(EntitySetting),
}

impl Resource for SettingName {
    type Id = Self;
    type Kind = SettingNamespace;

    #[expect(refining_impl_trait)]
    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, !> {
        match kind {
            SettingNamespace::Setting => Ok(id),
        }
    }

    fn into_parts(self) -> (Self::Kind, Self::Id) {
        (SettingNamespace::Setting, self)
    }

    fn to_parts(&self) -> (Self::Kind, Self::Id) {
        Resource::into_parts(*self)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SettingResourceRelation {
    Update,
    View,
}

impl Relation<SettingName> for SettingResourceRelation {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "id")]
pub enum SettingSubject {
    Public,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SettingSubjectNamespace {
    #[serde(rename = "graph/account")]
    Account,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SettingSubjectId {
    Asteriks(PublicAccess),
}

impl Resource for SettingSubject {
    type Id = SettingSubjectId;
    type Kind = SettingSubjectNamespace;

    #[expect(refining_impl_trait)]
    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, !> {
        Ok(match (kind, id) {
            (
                SettingSubjectNamespace::Account,
                SettingSubjectId::Asteriks(PublicAccess::Public),
            ) => Self::Public,
        })
    }

    fn into_parts(self) -> (Self::Kind, Self::Id) {
        match self {
            Self::Public => (
                SettingSubjectNamespace::Account,
                SettingSubjectId::Asteriks(PublicAccess::Public),
            ),
        }
    }

    fn to_parts(&self) -> (Self::Kind, Self::Id) {
        Resource::into_parts(*self)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "relation")]
pub enum SettingRelationAndSubject {
    Update {
        subject: SettingSubject,
        #[serde(skip)]
        level: u8,
    },
    View {
        subject: SettingSubject,
        #[serde(skip)]
        level: u8,
    },
}

impl Relationship for (SettingName, SettingRelationAndSubject) {
    type Relation = SettingResourceRelation;
    type Resource = SettingName;
    type Subject = SettingSubject;
    type SubjectSet = !;

    #[expect(refining_impl_trait)]
    fn from_parts(parts: RelationshipParts<Self>) -> Result<Self, !> {
        Ok((
            parts.resource,
            match parts.relation.name {
                SettingResourceRelation::Update => match (parts.subject, parts.subject_set) {
                    (SettingSubject::Public, None) => SettingRelationAndSubject::Update {
                        subject: SettingSubject::Public,
                        level: parts.relation.level,
                    },
                },
                SettingResourceRelation::View => match (parts.subject, parts.subject_set) {
                    (SettingSubject::Public, None) => SettingRelationAndSubject::View {
                        subject: SettingSubject::Public,
                        level: parts.relation.level,
                    },
                },
            },
        ))
    }

    fn to_parts(&self) -> RelationshipParts<Self> {
        Self::into_parts(*self)
    }

    fn into_parts(self) -> RelationshipParts<Self> {
        let (relation, (subject, subject_set)) = match self.1 {
            SettingRelationAndSubject::Update { subject, level } => (
                LeveledRelation {
                    name: SettingResourceRelation::Update,
                    level,
                },
                (subject, None),
            ),
            SettingRelationAndSubject::View { subject, level } => (
                LeveledRelation {
                    name: SettingResourceRelation::View,
                    level,
                },
                (subject, None),
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
