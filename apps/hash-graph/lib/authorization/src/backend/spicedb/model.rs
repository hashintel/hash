use std::{collections::HashMap, error::Error, fmt};

use serde::{ser::SerializeStruct, Deserialize, Serialize, Serializer};

use crate::zanzibar::{self, Tuple};

/// Error response returned from the API
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcError {
    pub code: i32,
    pub message: String,
    #[serde(default)]
    pub details: Vec<serde_json::Value>,
}

impl fmt::Display for RpcError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "Error {}: {}", self.code, self.message)
    }
}

impl Error for RpcError {}

pub struct ObjectReference<'t, T>(pub &'t T);

impl<T: Tuple> Serialize for ObjectReference<'_, T> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut serialize = serializer.serialize_struct("ObjectReference", 2)?;
        serialize.serialize_field("objectType", self.0.object_namespace())?;
        serialize.serialize_field("objectId", self.0.object_id())?;
        serialize.end()
    }
}

pub struct RelationReference<'t, T>(pub &'t T);

impl<T: Tuple> Serialize for RelationReference<'_, T> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.0.affiliation().serialize(serializer)
    }
}

#[derive(Debug)]
pub struct SubjectReference<'t, T>(pub &'t T);

impl<T: Tuple> Serialize for SubjectReference<'_, T> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        #[derive(Debug)]
        pub struct ObjectReference<'t, T>(pub &'t T);

        impl<T: Tuple> Serialize for ObjectReference<'_, T> {
            fn serialize<Ser>(&self, serializer: Ser) -> Result<Ser::Ok, Ser::Error>
            where
                Ser: Serializer,
            {
                let mut serialize = serializer.serialize_struct("ObjectReference", 2)?;
                serialize.serialize_field("objectType", self.0.user_namespace())?;
                serialize.serialize_field("objectId", self.0.user_id())?;
                serialize.end()
            }
        }

        let mut serialize = serializer.serialize_struct("SubjectReference", 2)?;
        serialize.serialize_field("object", &ObjectReference(self.0))?;
        if let Some(relation) = self.0.user_set() {
            serialize.serialize_field("optionalRelation", relation)?;
        }
        serialize.end()
    }
}

/// Specifies how a resource relates to a subject.
///
/// Relationships form the data for the graph over which all permissions questions are answered.
pub struct Relationship<T>(pub T);

impl<T: Tuple> Serialize for Relationship<T> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut serialize = serializer.serialize_struct("Relationship", 3)?;
        serialize.serialize_field("resource", &ObjectReference(&self.0))?;
        serialize.serialize_field("relation", self.0.affiliation())?;
        serialize.serialize_field("subject", &SubjectReference(&self.0))?;
        serialize.end()
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

/// Used for mutating a single relationship within the service.
#[derive(Debug, Copy, Clone, Serialize)]
pub enum RelationshipUpdateOperation {
    /// Create the relationship only if it doesn't exist, and error otherwise.
    #[serde(rename = "OPERATION_CREATE")]
    Create,
    /// Upsert the relationship, and will not error if it already exists.
    #[serde(rename = "OPERATION_TOUCH")]
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
