use std::error::Error;

use serde::Serialize;

use crate::zanzibar::{
    types::object::{Object, ObjectFilter},
    Affiliation,
};

pub trait Subject: Sized + Send + Sync {
    type Object: Object;
    type Relation: Serialize + Affiliation<Self::Object>;

    /// Creates a subject from an object and relation.
    ///
    /// # Errors
    ///
    /// Returns an error if the object and relation are not valid for the subject.
    fn new(object: Self::Object, relation: Option<Self::Relation>) -> Result<Self, impl Error>;

    fn object(&self) -> &Self::Object;

    fn relation(&self) -> Option<&Self::Relation>;
}

#[derive(Debug, PartialEq, Eq)]
pub struct SubjectFilter<'a, N, I, R> {
    pub object: ObjectFilter<'a, N, I>,
    pub relation: Option<&'a R>,
}

impl<N, I, R> Copy for SubjectFilter<'_, N, I, R> {}
impl<N, I, R> Clone for SubjectFilter<'_, N, I, R> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<'a, S> From<&'a S>
    for SubjectFilter<'a, <S::Object as Object>::Namespace, <S::Object as Object>::Id, S::Relation>
where
    S: Subject,
{
    fn from(subject: &'a S) -> Self {
        SubjectFilter {
            object: ObjectFilter::from(subject.object()),
            relation: subject.relation(),
        }
    }
}

impl<'a> SubjectFilter<'a, !, !, !> {
    #[must_use]
    pub fn from_object<N, I>(
        object: impl Into<ObjectFilter<'a, N, I>>,
    ) -> SubjectFilter<'a, N, I, !> {
        let object = object.into();
        SubjectFilter {
            object,
            relation: None,
        }
    }
}

impl<'a, N, I> SubjectFilter<'a, N, I, !> {
    #[must_use]
    pub const fn with_relation<R>(self, relation: &'a R) -> SubjectFilter<'a, N, I, R> {
        SubjectFilter {
            object: self.object,
            relation: Some(relation),
        }
    }
}
