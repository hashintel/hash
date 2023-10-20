use std::error::Error;

use crate::zanzibar::{
    types::{resource::ResourceFilter, Resource},
    Affiliation,
};

pub trait Subject: Sized {
    type Resource: Resource;
    type Relation: Affiliation<Self::Resource>;

    /// Creates a subject from a resource and relation.
    ///
    /// # Errors
    ///
    /// Returns an error if the resource and relation are not valid for the subject.
    fn from_parts(
        resource: Self::Resource,
        relation: Option<Self::Relation>,
    ) -> Result<Self, impl Error>;

    fn to_parts(&self) -> (Self::Resource, Option<Self::Relation>);

    fn into_parts(self) -> (Self::Resource, Option<Self::Relation>);
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct SubjectFilter<N, I, R> {
    pub resource: ResourceFilter<N, I>,
    pub relation: Option<R>,
}

impl<S> From<S>
    for SubjectFilter<<S::Resource as Resource>::Kind, <S::Resource as Resource>::Id, S::Relation>
where
    S: Subject,
{
    fn from(subject: S) -> Self {
        let (resource, relation) = subject.into_parts();
        Self {
            resource: ResourceFilter::from(resource),
            relation,
        }
    }
}

impl SubjectFilter<!, !, !> {
    #[must_use]
    pub fn from_resource<N, I>(
        resource: impl Into<ResourceFilter<N, I>>,
    ) -> SubjectFilter<N, I, !> {
        let resource = resource.into();
        SubjectFilter {
            resource,
            relation: None,
        }
    }
}

impl<N, I> SubjectFilter<N, I, !> {
    #[must_use]
    pub fn with_relation<R>(self, relation: R) -> SubjectFilter<N, I, R> {
        SubjectFilter {
            resource: self.resource,
            relation: Some(relation),
        }
    }
}
