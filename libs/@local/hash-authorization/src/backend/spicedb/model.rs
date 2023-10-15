use std::{collections::HashMap, fmt};

use serde::{ser::SerializeStruct, Deserialize, Serialize, Serializer};

use crate::zanzibar;

/// Error response returned from the API
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RpcError {
    code: i32,
    message: String,
    #[serde(default)]
    #[expect(
        dead_code,
        reason = "Currently not used but captured from gRPC connections"
    )]
    details: Vec<serde_json::Value>,
}

impl fmt::Display for RpcError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "Error {}: {}", self.code, self.message)
    }
}

pub(crate) struct Consistency<'z>(zanzibar::Consistency<'z>);

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
pub(crate) enum RelationshipUpdateOperation {
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
pub(crate) struct ContextualizedCaveat<'a> {
    /// The name of the caveat expression to use, as defined in the schema.
    caveat_name: &'a str,
    /// Consists of key-value pairs that will be injected at evaluation time.
    ///
    /// The keys must match the arguments defined on the caveat in the schema.
    context: HashMap<&'a str, serde_json::Value>,
}
