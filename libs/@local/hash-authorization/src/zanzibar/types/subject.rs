use std::error::Error;

use crate::zanzibar::{
    types::{object::ObjectFilter, Object},
    Affiliation,
};

pub trait Subject: Sized {
    type Object: Object;
    type Relation: Affiliation<Self::Object>;

    /// Creates a subject from an object and relation.
    ///
    /// # Errors
    ///
    /// Returns an error if the object and relation are not valid for the subject.
    fn from_parts(
        object: Self::Object,
        relation: Option<Self::Relation>,
    ) -> Result<Self, impl Error>;

    fn to_parts(&self) -> (Self::Object, Option<Self::Relation>);

    fn into_parts(self) -> (Self::Object, Option<Self::Relation>);
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct SubjectFilter<N, I, R> {
    pub object: ObjectFilter<N, I>,
    pub relation: Option<R>,
}

impl<S> From<S>
    for SubjectFilter<<S::Object as Object>::Namespace, <S::Object as Object>::Id, S::Relation>
where
    S: Subject,
{
    fn from(subject: S) -> Self {
        let (object, relation) = subject.into_parts();
        Self {
            object: ObjectFilter::from(object),
            relation,
        }
    }
}

impl SubjectFilter<!, !, !> {
    #[must_use]
    pub fn from_object<N, I>(object: impl Into<ObjectFilter<N, I>>) -> SubjectFilter<N, I, !> {
        let object = object.into();
        SubjectFilter {
            object,
            relation: None,
        }
    }
}

impl<N, I> SubjectFilter<N, I, !> {
    #[must_use]
    pub fn with_relation<R>(self, relation: R) -> SubjectFilter<N, I, R> {
        SubjectFilter {
            object: self.object,
            relation: Some(relation),
        }
    }
}
