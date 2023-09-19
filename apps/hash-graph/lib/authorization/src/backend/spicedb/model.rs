use std::collections::HashMap;

use serde::{ser::SerializeStruct, Deserialize, Serialize, Serializer};

use crate::{
    backend, zanzibar,
    zanzibar::{Resource, Tuple},
};

/// Error response returned from the API
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcStatus {
    pub code: i32,
    pub message: String,
    #[serde(default)]
    pub details: Vec<serde_json::Value>,
}

#[derive(Debug)]
pub struct ObjectReference<'r, R>
where
    R: Resource + ?Sized,
{
    pub object_id: &'r R::Id,
}

impl<R> Serialize for ObjectReference<'_, R>
where
    R: Resource + ?Sized,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut serialize = serializer.serialize_struct("ObjectReference", 2)?;
        serialize.serialize_field("objectType", R::namespace())?;
        serialize.serialize_field("objectId", self.object_id)?;
        serialize.end()
    }
}

impl<'t, T> From<&'t T> for ObjectReference<'t, T::Object>
where
    T: Tuple,
{
    fn from(tuple: &'t T) -> Self {
        Self {
            object_id: tuple.object_id(),
        }
    }
}

#[derive(Serialize)]
#[serde(bound = "")]
pub struct SubjectReference<'a, U>
where
    U: Resource + ?Sized,
{
    pub object: ObjectReference<'a, U>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "optionalRelation")]
    pub relation: Option<&'a str>,
}

impl<'t, T> From<&'t T> for SubjectReference<'t, T::User>
where
    T: Tuple,
{
    fn from(tuple: &'t T) -> Self {
        Self {
            object: ObjectReference {
                object_id: tuple.user_id(),
            },
            relation: tuple.user_set(),
        }
    }
}

pub struct Consistency<'z>(zanzibar::Consistency<'z>);

impl<'z> From<zanzibar::Consistency<'z>> for Consistency<'z> {
    fn from(consistency: zanzibar::Consistency<'z>) -> Self {
        Self(consistency)
    }
}

impl Serialize for Consistency<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        #[derive(Serialize)]
        struct ZedToken<'z> {
            token: &'z zanzibar::Zookie<'z>,
        }

        let mut serialize = serializer.serialize_struct("Consistency", 1)?;
        match &self.0 {
            zanzibar::Consistency::MinimalLatency => {
                serialize.serialize_field("minimalLatency", &true)?;
            }
            zanzibar::Consistency::AtLeastAsFresh(token) => {
                serialize.serialize_field("atLeastAsFresh", &ZedToken { token })?;
            }
            zanzibar::Consistency::AtExactSnapshot(token) => {
                serialize.serialize_field("atExactSnapshot", &ZedToken { token })?;
            }
            zanzibar::Consistency::FullyConsistent => {
                serialize.serialize_field("fullyConsistent", &true)?;
            }
        }
        serialize.end()
    }
}

#[derive(Debug, Deserialize)]
pub struct ZedToken {
    pub token: zanzibar::Zookie<'static>,
}

impl From<ZedToken> for zanzibar::Zookie<'static> {
    fn from(zed: ZedToken) -> Self {
        zed.token
    }
}

/// A filter on the subject of a relationship.
#[derive(Debug)]
pub struct SubjectFilter<'a, U>
where
    U: Resource + ?Sized,
{
    pub subject_id: Option<&'a U::Id>,
    pub relation: Option<&'a str>,
}

impl<U> Serialize for SubjectFilter<'_, U>
where
    U: Resource + ?Sized,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut serialize = serializer.serialize_struct("SubjectFilter", 3)?;
        serialize.serialize_field("subjectType", U::namespace())?;
        if let Some(subject_id) = self.subject_id {
            serialize.serialize_field("optionalSubjectId", subject_id)?;
        }
        if let Some(relation) = self.relation {
            serialize.serialize_field("optionalRelation", relation)?;
        }
        serialize.end()
    }
}

/// A collection of filters which when applied to a relationship will return relationships that
/// have exactly matching fields.
pub struct RelationshipFilter<'a, O, U>
where
    O: Resource + ?Sized,
    U: Resource + ?Sized,
{
    pub resource_id: Option<&'a O::Id>,
    pub relation: Option<&'a str>,
    pub subject_filter: Option<SubjectFilter<'a, U>>,
}

impl<O, U> Serialize for RelationshipFilter<'_, O, U>
where
    O: Resource + ?Sized,
    U: Resource + ?Sized,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut serialize = serializer.serialize_struct("RelationshipFilter", 4)?;
        serialize.serialize_field("resourceType", O::namespace())?;
        if let Some(resource_id) = self.resource_id {
            serialize.serialize_field("optionalResourceId", resource_id)?;
        }
        if let Some(relation) = self.relation {
            serialize.serialize_field("optionalRelation", relation)?;
        }
        if let Some(subject_filter) = &self.subject_filter {
            serialize.serialize_field("optionalSubjectFilter", subject_filter)?;
        }
        serialize.end()
    }
}

impl<'f, O, U> From<backend::RelationFilter<'f, O, U>> for RelationshipFilter<'f, O, U>
where
    O: Resource + ?Sized,
    U: Resource + ?Sized,
{
    fn from(filter: backend::RelationFilter<'f, O, U>) -> Self {
        Self {
            resource_id: filter.id,
            relation: filter.affiliation,
            subject_filter: filter.subject.map(|subject| SubjectFilter {
                subject_id: subject.id,
                relation: subject.affiliation,
            }),
        }
    }
}

/// Specifies if the operation should proceed if the relationships filter matches any
/// relationships.
#[derive(Debug, Serialize)]
pub enum PreconditionOperation {
    /// Will fail the parent request if there are no relationships that match the filter.
    #[serde(rename = "OPERATION_MUST_MATCH")]
    MustMatch,
    /// Will fail the parent request if any relationships match the relationships filter.
    #[serde(rename = "OPERATION_MUST_NOT_MATCH")]
    MustNotMatch,
}

/// Specifies how and the existence or absence of certain relationships as expressed through the
/// accompanying filter should affect whether or not the operation proceeds.
#[derive(Serialize)]
#[serde(bound = "")]
pub struct Precondition<'a, O, U>
where
    O: Resource + ?Sized,
    U: Resource + ?Sized,
{
    pub operation: PreconditionOperation,
    pub filter: RelationshipFilter<'a, O, U>,
}

impl<'f, O, U> From<backend::Precondition<'f, O, U>> for Precondition<'f, O, U>
where
    O: Resource + ?Sized,
    U: Resource + ?Sized,
{
    fn from(precondition: backend::Precondition<'f, O, U>) -> Self {
        let operation = if precondition.must_match {
            PreconditionOperation::MustMatch
        } else {
            PreconditionOperation::MustNotMatch
        };
        Self {
            operation,
            filter: precondition.filter.into(),
        }
    }
}

/// Used for mutating a single relationship within the service.
#[derive(Debug, Copy, Clone, Serialize)]
pub enum RelationshipUpdateOperation {
    /// Create the relationship only if it doesn't exist, and error otherwise.
    #[serde(rename = "OPERATION_CREATE")]
    Create,
    /// Upsert the relationship, and will not error if it already exists.
    #[serde(rename = "OPERATION_TOUCH")]
    #[expect(dead_code, reason = "Not yet exposed")]
    Touch,
    /// Delete the relationship. If the relationship does not exist, this operation will no-op.
    #[serde(rename = "OPERATION_DELETE")]
    Delete,
}

/// Represents a reference to a caveat to be used by caveated relationships.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", bound = "")]
pub struct ContextualizedCaveat<'a> {
    /// The name of the caveat expression to use, as defined in the schema.
    pub caveat_name: &'a str,
    /// Consists of key-value pairs that will be injected at evaluation time.
    ///
    /// The keys must match the arguments defined on the caveat in the schema.
    pub context: HashMap<&'a str, serde_json::Value>,
}

/// Specifies how a resource relates to a subject.
///
/// Relationships form the data for the graph over which all permissions questions are answered.
#[derive(Serialize)]
#[serde(bound = "")]
pub struct Relationship<'a, T>
where
    T: Tuple,
{
    pub resource: ObjectReference<'a, T::Object>,
    pub relation: &'a str,
    pub subject: SubjectReference<'a, T::User>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "optionalCaveat")]
    pub caveat: Option<ContextualizedCaveat<'a>>,
}
