use std::error::Error;

use crate::zanzibar::types::{
    object::{Object, ObjectFilter},
    subject::{Subject, SubjectFilter},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct RelationshipFilter<'a, ON, OI, R, SN, SI, SR> {
    pub object: ObjectFilter<'a, ON, OI>,
    pub relation: Option<&'a R>,
    pub subject: Option<SubjectFilter<'a, SN, SI, SR>>,
}

impl<'a, R> From<&'a R>
    for RelationshipFilter<
        'a,
        <R::Object as Object>::Namespace,
        <R::Object as Object>::Id,
        R::Relation,
        <<R::Subject as Subject>::Object as Object>::Namespace,
        <<R::Subject as Subject>::Object as Object>::Id,
        <R::Subject as Subject>::Relation,
    >
where
    R: Relationship,
{
    fn from(relationship: &'a R) -> Self {
        RelationshipFilter {
            object: ObjectFilter::from(relationship.object()),
            relation: Some(relationship.relation()),
            subject: Some(SubjectFilter::from(relationship.subject())),
        }
    }
}

impl<'a> RelationshipFilter<'a, !, !, !, !, !, !> {
    #[must_use]
    pub fn from_object<N, I>(
        object: impl Into<ObjectFilter<'a, N, I>>,
    ) -> RelationshipFilter<'a, N, I, !, !, !, !> {
        RelationshipFilter {
            object: object.into(),
            relation: None,
            subject: None,
        }
    }
}

impl<'a, ON, OI, SN, SI, SR> RelationshipFilter<'a, ON, OI, !, SN, SI, SR> {
    #[must_use]
    pub const fn with_relation<R>(
        self,
        relation: &'a R,
    ) -> RelationshipFilter<'a, ON, OI, R, SN, SI, SR> {
        RelationshipFilter {
            object: self.object,
            relation: Some(relation),
            subject: self.subject,
        }
    }
}

impl<'a, ON, OI, R> RelationshipFilter<'a, ON, OI, R, !, !, !> {
    #[must_use]
    pub fn with_subject<SN, SI, SR>(
        self,
        subject: impl Into<SubjectFilter<'a, SN, SI, SR>>,
    ) -> RelationshipFilter<'a, ON, OI, R, SN, SI, SR> {
        RelationshipFilter {
            object: self.object,
            relation: self.relation,
            subject: Some(subject.into()),
        }
    }
}

pub trait Relationship: Sized + Send + Sync {
    type Object: Object;
    type Relation;
    type Subject: Subject;

    fn new(
        object: Self::Object,
        relation: Self::Relation,
        subject: Self::Subject,
    ) -> Result<Self, impl Error>;

    fn object(&self) -> &Self::Object;

    fn relation(&self) -> &Self::Relation;

    fn subject(&self) -> &Self::Subject;
}
