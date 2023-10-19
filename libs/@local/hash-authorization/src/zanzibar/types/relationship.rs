use std::error::Error;

use crate::zanzibar::{
    types::{
        object::{Object, ObjectFilter},
        subject::{Subject, SubjectFilter},
    },
    Affiliation,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct RelationshipFilter<ON, OI, R, SN, SI, SR> {
    pub object: ObjectFilter<ON, OI>,
    pub relation: Option<R>,
    pub subject: Option<SubjectFilter<SN, SI, SR>>,
}

impl RelationshipFilter<!, !, !, !, !, !> {
    #[must_use]
    pub fn from_object<N, I>(
        object: impl Into<ObjectFilter<N, I>>,
    ) -> RelationshipFilter<N, I, !, !, !, !> {
        RelationshipFilter {
            object: object.into(),
            relation: None,
            subject: None,
        }
    }
}

impl<ON, OI, SN, SI, SR> RelationshipFilter<ON, OI, !, SN, SI, SR> {
    #[must_use]
    pub fn with_relation<R>(self, relation: R) -> RelationshipFilter<ON, OI, R, SN, SI, SR> {
        RelationshipFilter {
            object: self.object,
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
            object: self.object,
            relation: self.relation,
            subject: Some(subject.into()),
        }
    }
}

pub trait Relationship: Sized {
    type Object: Object;
    type Relation: Affiliation<Self::Object>;
    type Subject: Object;
    type SubjectSet: Affiliation<Self::Subject>;

    /// Creates a relationship from an object, relation, subject, and subject set.
    ///
    /// # Errors
    ///
    /// Returns an error if the object, relation, subject, and subject set are not valid for the
    /// relationship.
    fn from_parts(
        object: Self::Object,
        relation: Self::Relation,
        subject: Self::Subject,
        subject_set: Option<Self::SubjectSet>,
    ) -> Result<Self, impl Error>;

    fn to_parts(
        &self,
    ) -> (
        Self::Object,
        Self::Relation,
        Self::Subject,
        Option<Self::SubjectSet>,
    );

    fn into_parts(
        self,
    ) -> (
        Self::Object,
        Self::Relation,
        Self::Subject,
        Option<Self::SubjectSet>,
    );
}

impl<O, R, S> Relationship for (O, R, S)
where
    O: Object + Copy,
    R: Affiliation<O> + Copy,
    S: Subject + Copy,
{
    type Object = O;
    type Relation = R;
    type Subject = S::Object;
    type SubjectSet = S::Relation;

    fn from_parts(
        object: Self::Object,
        relation: Self::Relation,
        subject: Self::Subject,
        subject_set: Option<Self::SubjectSet>,
    ) -> Result<Self, impl Error> {
        S::from_parts(subject, subject_set).map(|subject| (object, relation, subject))
    }

    fn to_parts(
        &self,
    ) -> (
        Self::Object,
        Self::Relation,
        Self::Subject,
        Option<Self::SubjectSet>,
    ) {
        Relationship::into_parts(*self)
    }

    fn into_parts(
        self,
    ) -> (
        Self::Object,
        Self::Relation,
        Self::Subject,
        Option<Self::SubjectSet>,
    ) {
        let (object, relation, subject) = self;
        let (subject, subject_set) = Subject::into_parts(subject);
        (object, relation, subject, subject_set)
    }
}
