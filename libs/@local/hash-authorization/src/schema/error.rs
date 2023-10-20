use core::fmt::{self, Debug};
use std::{error::Error, fmt::Write};

use derive_where::derive_where;
use serde::Serialize;

use crate::zanzibar::types::{Relationship, Resource};

#[derive(Debug)]
enum InvalidResourceKind {
    InvalidId,
}

#[derive_where(Debug; R::Namespace, R::Id)]
pub(crate) struct InvalidResource<R: Resource> {
    kind: R::Namespace,
    id: R::Id,
    error: InvalidResourceKind,
}

impl<R: Resource> InvalidResource<R> {
    pub(crate) const fn invalid_id(kind: R::Namespace, id: R::Id) -> Self {
        Self {
            kind,
            id,
            error: InvalidResourceKind::InvalidId,
        }
    }
}

impl<R> fmt::Display for InvalidResource<R>
where
    R: Resource<Namespace: Serialize, Id: Serialize>,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.error {
            InvalidResourceKind::InvalidId => {
                fmt.write_str("invalid id `")?;
                self.id.serialize(&mut *fmt)?;
            }
        }
        fmt.write_str("` for resource kind `")?;
        self.kind.serialize(&mut *fmt)?;
        fmt.write_char('`')
    }
}

impl<R> Error for InvalidResource<R> where
    R: Resource<Namespace: Debug + Serialize, Id: Debug + Serialize>
{
}

#[derive(Debug)]
enum InvalidRelationshipKind {
    InvalidSubject,
    InvalidSubjectSet,
}

pub(crate) struct InvalidRelationship<R: Relationship> {
    resource: R::Resource,
    relation: R::Relation,
    subject: R::Subject,
    subject_set: Option<R::SubjectSet>,
    error: InvalidRelationshipKind,
}

impl<R: Relationship> InvalidRelationship<R> {
    pub(crate) const fn invalid_subject(
        resource: R::Resource,
        relation: R::Relation,
        subject: R::Subject,
        subject_set: Option<R::SubjectSet>,
    ) -> Self {
        Self {
            resource,
            relation,
            subject,
            subject_set,
            error: InvalidRelationshipKind::InvalidSubject,
        }
    }

    pub(crate) const fn invalid_subject_set(
        resource: R::Resource,
        relation: R::Relation,
        subject: R::Subject,
        subject_set: Option<R::SubjectSet>,
    ) -> Self {
        Self {
            resource,
            relation,
            subject,
            subject_set,
            error: InvalidRelationshipKind::InvalidSubjectSet,
        }
    }
}

struct ResourceDebugger<'t, S>(&'t S);
impl<S> Debug for ResourceDebugger<'_, S>
where
    S: Resource<Namespace: Serialize, Id: Serialize>,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let (kind, id) = self.0.to_parts();
        kind.serialize(&mut *fmt)?;
        fmt.write_char(':')?;
        id.serialize(fmt)
    }
}

struct RelationDebugger<'t, R>(&'t R);
impl<R> Debug for RelationDebugger<'_, R>
where
    R: Serialize,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.serialize(fmt)
    }
}

struct SubjectSetDebugger<'t, S, R>(&'t S, Option<&'t R>);

impl<S, R> Debug for SubjectSetDebugger<'_, S, R>
where
    S: Resource<Namespace: Serialize, Id: Serialize>,
    R: Serialize,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        ResourceDebugger(self.0).fmt(fmt)?;
        if let Some(subject_set) = self.1 {
            fmt.write_char('#')?;
            subject_set.serialize(fmt)?;
        }
        Ok(())
    }
}

impl<R> fmt::Debug for InvalidRelationship<R>
where
    R: Relationship<
            Resource: Resource<Namespace: Serialize, Id: Serialize>,
            Relation: Serialize,
            Subject: Resource<Namespace: Serialize, Id: Serialize>,
            SubjectSet: Serialize,
        >,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self.error {
            InvalidRelationshipKind::InvalidSubject => "InvalidRelationshipSubject",
            InvalidRelationshipKind::InvalidSubjectSet if self.subject_set.is_some() => {
                "InvalidRelationshipSubjectSet"
            }
            InvalidRelationshipKind::InvalidSubjectSet => "MissingRelationshipSubjectSet",
        };

        fmt.debug_struct(name)
            .field("resource", &ResourceDebugger(&self.resource))
            .field("relation", &RelationDebugger(&self.relation))
            .field(
                "subject",
                &SubjectSetDebugger(&self.subject, self.subject_set.as_ref()),
            )
            .finish()
    }
}

impl<R> fmt::Display for InvalidRelationship<R>
where
    R: Relationship<
            Resource: Resource<Namespace: Serialize, Id: Serialize>,
            Relation: Serialize,
            Subject: Resource<Namespace: Serialize, Id: Serialize>,
            SubjectSet: Serialize,
        >,
{
    #[expect(
        clippy::use_debug,
        reason = "The `Debug` implementation is expected to be shown"
    )]
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.error {
            InvalidRelationshipKind::InvalidSubject => write!(
                fmt,
                "invalid subject `{:?}`",
                SubjectSetDebugger(&self.subject, self.subject_set.as_ref())
            )?,
            InvalidRelationshipKind::InvalidSubjectSet => {
                if let Some(set) = &self.subject_set {
                    write!(fmt, "invalid subject set `{:?}`", RelationDebugger(&set),)?;
                } else {
                    fmt.write_str("missing subject set")?;
                }
                write!(fmt, " in subject `{:?}`", ResourceDebugger(&self.subject))?;
            }
        }
        write!(
            fmt,
            "` for resource `{:?}` with relation `{:?}`",
            ResourceDebugger(&self.resource),
            RelationDebugger(&self.relation)
        )
    }
}
impl<R> Error for InvalidRelationship<R> where
    R: Relationship<
            Resource: Resource<Namespace: Debug + Serialize, Id: Debug + Serialize>,
            Relation: Debug + Serialize,
            Subject: Resource<Namespace: Debug + Serialize, Id: Debug + Serialize>,
            SubjectSet: Debug + Serialize,
        >
{
}
