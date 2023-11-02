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
        types::{Relationship, Resource},
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

    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, impl Error> {
        match kind {
            PropertyTypeNamespace::PropertyType => Ok::<_, !>(id),
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
    Owner,
    GeneralViewer,
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
#[serde(rename_all = "camelCase", tag = "type", content = "id")]
pub enum PropertyTypeSubject {
    Public,
    Account(AccountId),
    AccountGroup(AccountGroupId),
}

#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PropertyTypeSubjectSet {
    #[default]
    Member,
}

impl Relation<PropertyTypeSubject> for PropertyTypeSubjectSet {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PropertyTypeSubjectNamespace {
    #[serde(rename = "graph/account")]
    Account,
    #[serde(rename = "graph/account_group")]
    AccountGroup,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PropertyTypeSubjectId {
    Uuid(Uuid),
    Asteriks(PublicAccess),
}

impl Resource for PropertyTypeSubject {
    type Id = PropertyTypeSubjectId;
    type Kind = PropertyTypeSubjectNamespace;

    fn from_parts(kind: Self::Kind, id: Self::Id) -> Result<Self, impl Error> {
        Ok(match (kind, id) {
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
                PropertyTypeSubjectNamespace::AccountGroup,
                PropertyTypeSubjectId::Asteriks(PublicAccess::Public),
            ) => {
                return Err(InvalidResource::<Self>::invalid_id(kind, id));
            }
        })
    }

    fn into_parts(self) -> (Self::Kind, Self::Id) {
        match self {
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

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum PropertyTypeOwnerSubject {
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

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum PropertyTypeGeneralViewerSubject {
    Public,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "relation", content = "subject")]
pub enum PropertyTypeRelationAndSubject {
    Owner(PropertyTypeOwnerSubject),
    GeneralViewer(PropertyTypeGeneralViewerSubject),
}

impl Relationship for (PropertyTypeId, PropertyTypeRelationAndSubject) {
    type Relation = PropertyTypeResourceRelation;
    type Resource = PropertyTypeId;
    type Subject = PropertyTypeSubject;
    type SubjectSet = PropertyTypeSubjectSet;

    fn from_parts(
        resource: Self::Resource,
        relation: Self::Relation,
        subject: Self::Subject,
        subject_set: Option<Self::SubjectSet>,
    ) -> Result<Self, impl Error> {
        Ok((
            resource,
            match relation {
                PropertyTypeResourceRelation::Owner => match (subject, subject_set) {
                    (PropertyTypeSubject::Account(id), None) => {
                        PropertyTypeRelationAndSubject::Owner(PropertyTypeOwnerSubject::Account {
                            id,
                        })
                    }
                    (PropertyTypeSubject::AccountGroup(id), Some(set)) => {
                        PropertyTypeRelationAndSubject::Owner(
                            PropertyTypeOwnerSubject::AccountGroup { id, set },
                        )
                    }
                    (PropertyTypeSubject::Public, subject_set) => {
                        return Err(InvalidRelationship::<Self>::invalid_subject(
                            resource,
                            relation,
                            subject,
                            subject_set,
                        ));
                    }
                    (
                        PropertyTypeSubject::Account(_) | PropertyTypeSubject::AccountGroup(_),
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
                PropertyTypeResourceRelation::GeneralViewer => match (subject, subject_set) {
                    (PropertyTypeSubject::Public, None) => {
                        PropertyTypeRelationAndSubject::GeneralViewer(
                            PropertyTypeGeneralViewerSubject::Public,
                        )
                    }
                    (
                        PropertyTypeSubject::Account(_)
                        | PropertyTypeSubject::AccountGroup(_)
                        | PropertyTypeSubject::Public,
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
            PropertyTypeRelationAndSubject::Owner(subject) => (
                PropertyTypeResourceRelation::Owner,
                match subject {
                    PropertyTypeOwnerSubject::Account { id } => {
                        (PropertyTypeSubject::Account(id), None)
                    }
                    PropertyTypeOwnerSubject::AccountGroup { id, set } => {
                        (PropertyTypeSubject::AccountGroup(id), Some(set))
                    }
                },
            ),
            PropertyTypeRelationAndSubject::GeneralViewer(subject) => (
                PropertyTypeResourceRelation::GeneralViewer,
                match subject {
                    PropertyTypeGeneralViewerSubject::Public => (PropertyTypeSubject::Public, None),
                },
            ),
        };
        (self.0, relation, subject, subject_set)
    }
}
