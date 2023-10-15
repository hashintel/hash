use std::error::Error;

use crate::zanzibar::types::object::{Object, ObjectFilter};

pub trait Subject: Sized + Send + Sync {
    type Object: Object;
    type Relation;

    fn new(object: Self::Object, relation: Option<Self::Relation>) -> Result<Self, impl Error>;

    fn object(&self) -> &Self::Object;

    fn relation(&self) -> Option<&Self::Relation>;
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct SubjectFilter<'a, N, I, R> {
    pub object: ObjectFilter<'a, N, I>,
    pub relation: Option<&'a R>,
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
