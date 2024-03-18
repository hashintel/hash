use std::{error::Error, fmt};

use serde::{ser::SerializeStruct, Deserialize, Serialize, Serializer};

use crate::{backend::ModifyRelationshipOperation, zanzibar};

/// Error response returned from the API
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcError {
    pub(crate) code: i32,
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

impl Error for RpcError {}

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

#[derive(Debug, Copy, Clone, Serialize)]
pub(crate) enum RelationshipUpdateOperation {
    #[serde(rename = "OPERATION_CREATE")]
    Create,
    #[serde(rename = "OPERATION_TOUCH")]
    Touch,
    #[serde(rename = "OPERATION_DELETE")]
    Delete,
}

impl From<ModifyRelationshipOperation> for RelationshipUpdateOperation {
    fn from(operation: ModifyRelationshipOperation) -> Self {
        match operation {
            ModifyRelationshipOperation::Create => Self::Create,
            ModifyRelationshipOperation::Touch => Self::Touch,
            ModifyRelationshipOperation::Delete => Self::Delete,
        }
    }
}

#[derive(Debug, Copy, Clone, Deserialize)]
pub(crate) enum Permissionship {
    #[serde(rename = "PERMISSIONSHIP_NO_PERMISSION")]
    NoPermission,
    #[serde(rename = "PERMISSIONSHIP_HAS_PERMISSION")]
    HasPermission,
    #[serde(rename = "PERMISSIONSHIP_CONDITIONAL_PERMISSION")]
    Conditional,
}

impl From<Permissionship> for bool {
    fn from(permissionship: Permissionship) -> Self {
        match permissionship {
            Permissionship::HasPermission => true,
            Permissionship::NoPermission => false,
            Permissionship::Conditional => {
                unimplemented!("https://linear.app/hash/issue/H-614")
            }
        }
    }
}
