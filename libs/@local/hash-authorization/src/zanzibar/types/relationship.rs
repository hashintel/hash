use std::error::Error;

use crate::zanzibar::{
    types::{
        resource::{Resource, ResourceFilter},
        subject::SubjectFilter,
        LeveledRelation,
    },
    Relation,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct RelationshipFilter<ON, OI, R, SN, SI, SR> {
    pub resource: ResourceFilter<ON, OI>,
    pub relation: Option<R>,
    pub subject: Option<SubjectFilter<SN, SI, SR>>,
}

impl RelationshipFilter<!, !, !, !, !, !> {
    #[must_use]
    pub fn from_resource<N, I>(
        resource: impl Into<ResourceFilter<N, I>>,
    ) -> RelationshipFilter<N, I, !, !, !, !> {
        RelationshipFilter {
            resource: resource.into(),
            relation: None,
            subject: None,
        }
    }
}

impl<ON, OI, SN, SI, SR> RelationshipFilter<ON, OI, !, SN, SI, SR> {
    #[must_use]
    pub fn with_relation<R>(self, relation: R) -> RelationshipFilter<ON, OI, R, SN, SI, SR> {
        RelationshipFilter {
            resource: self.resource,
            relation: Some(relation),
            subject: self.subject,
        }
    }
}

impl<ON, OI, R> RelationshipFilter<ON, OI, R, !, !, !> {
    #[must_use]
    pub fn with_subject<SN, SI, SR>(
        self,
        subject: impl Into<SubjectFilter<SN, SI, SR>>,
    ) -> RelationshipFilter<ON, OI, R, SN, SI, SR> {
        RelationshipFilter {
            resource: self.resource,
            relation: self.relation,
            subject: Some(subject.into()),
        }
    }
}

pub struct RelationshipParts<R: Relationship> {
    pub resource: R::Resource,
    pub relation: LeveledRelation<R::Relation>,
    pub subject: R::Subject,
    pub subject_set: Option<R::SubjectSet>,
}

pub trait Relationship: Sized {
    type Resource: Resource;
    type Relation: Relation<Self::Resource>;
    type Subject: Resource;
    type SubjectSet: Relation<Self::Subject>;

    /// Creates a relationship from an resource, relation, subject, and subject set.
    ///
    /// # Errors
    ///
    /// Returns an error if the resource, relation, subject, and subject set are not valid for the
    /// relationship.
    fn from_parts(parts: RelationshipParts<Self>) -> Result<Self, impl Error>;

    /// Splits the relationship into an resource, relation, subject, and subject set.
    ///
    /// # Errors
    ///
    /// Returns an error if the relationship is not valid.
    fn to_parts(&self) -> RelationshipParts<Self>;

    /// Splits the relationship into an resource, relation, subject, and subject set.
    ///
    /// # Errors
    ///
    /// Returns an error if the relationship is not valid.
    fn into_parts(self) -> RelationshipParts<Self>;
}
