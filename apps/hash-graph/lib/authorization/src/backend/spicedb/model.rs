use std::collections::HashMap;

use serde::{ser::SerializeStruct, Deserialize, Serialize, Serializer};

use crate::{backend, zanzibar};

/// Error response returned from the API
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcStatus {
    pub code: i32,
    pub message: String,
    #[serde(default)]
    pub details: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectReference<'r> {
    pub object_type: &'r str,
    pub object_id: &'r str,
}

impl<'r, R: zanzibar::Resource + ?Sized> From<&'r R> for ObjectReference<'r> {
    fn from(resource: &'r R) -> Self {
        Self {
            object_type: resource.namespace(),
            object_id: resource.id().as_ref(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectReference<'a> {
    pub object: ObjectReference<'a>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub optional_relation: Option<&'a str>,
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
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectFilter<'a> {
    pub subject_type: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub optional_subject_id: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub optional_relation: Option<&'a str>,
}

/// A collection of filters which when applied to a relationship will return relationships that
/// have exactly matching fields.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationshipFilter<'a> {
    pub resource_type: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub optional_resource_id: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub optional_relation: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub optional_subject_filter: Option<SubjectFilter<'a>>,
}

impl<'f> From<backend::RelationFilter<'f>> for RelationshipFilter<'f> {
    fn from(filter: backend::RelationFilter<'f>) -> Self {
        Self {
            resource_type: filter.namespace,
            optional_resource_id: filter.id.map(AsRef::as_ref),
            optional_relation: filter.affiliation,
            optional_subject_filter: filter.subject.map(|subject| SubjectFilter {
                subject_type: subject.namespace,
                optional_subject_id: subject.id,
                optional_relation: subject.affiliation,
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
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Precondition<'a> {
    pub operation: PreconditionOperation,
    pub filter: RelationshipFilter<'a>,
}

impl<'f> From<backend::Precondition<'f>> for Precondition<'f> {
    fn from(precondition: backend::Precondition<'f>) -> Self {
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
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
pub struct Relationship<'a> {
    pub resource: ObjectReference<'a>,
    pub relation: &'a str,
    pub subject: SubjectReference<'a>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub optional_caveat: Option<ContextualizedCaveat<'a>>,
}
