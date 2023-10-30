use std::error::Error;

use crate::zanzibar::{
    types::{
        resource::{Resource, ResourceFilter},
        subject::SubjectFilter,
    },
    Affiliation,
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

pub trait Relationship: Sized {
    type Resource: Resource;
    type Relation: Affiliation<Self::Resource>;
    type Subject: Resource;
    type SubjectSet: Affiliation<Self::Subject>;

    /// Creates a relationship from an resource, relation, subject, and subject set.
    ///
    /// # Errors
    ///
    /// Returns an error if the resource, relation, subject, and subject set are not valid for the
    /// relationship.
    fn from_parts(
        resource: Self::Resource,
        relation: Self::Relation,
        subject: Self::Subject,
        subject_set: Option<Self::SubjectSet>,
    ) -> Result<Self, impl Error>;

    fn to_parts(
        &self,
    ) -> (
        Self::Resource,
        Self::Relation,
        Self::Subject,
        Option<Self::SubjectSet>,
    );

    fn into_parts(
        self,
    ) -> (
        Self::Resource,
        Self::Relation,
        Self::Subject,
        Option<Self::SubjectSet>,
    );
}
