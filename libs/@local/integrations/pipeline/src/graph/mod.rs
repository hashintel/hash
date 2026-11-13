//! Graph delivery contracts and operation ordering.

use core::future::Future;

use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;
use type_system::principal::actor::ActorEntityUuid;

use crate::InvalidText;

/// The order in which planned operations are delivered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OperationKind {
    UpsertEntity,
    UpsertLink,
    ArchiveLink,
    ArchiveEntity,
}

impl OperationKind {
    /// The value persisted in a writes file.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::UpsertEntity => "upsert_entity",
            Self::UpsertLink => "upsert_link",
            Self::ArchiveLink => "archive_link",
            Self::ArchiveEntity => "archive_entity",
        }
    }

    /// Reads the operation stored in a writes file.
    ///
    /// # Errors
    /// Returns [`InvalidText`] for an unknown operation.
    pub fn from_stored(text: &str) -> Result<Self, InvalidText> {
        match text {
            "upsert_entity" => Ok(Self::UpsertEntity),
            "upsert_link" => Ok(Self::UpsertLink),
            "archive_link" => Ok(Self::ArchiveLink),
            "archive_entity" => Ok(Self::ArchiveEntity),
            _ => Err(InvalidText {
                text: text.into(),
                expected: "a stored graph operation",
            }),
        }
    }
}

/// An atomic Graph request result.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GraphResponse {
    Applied,
    Status(u16),
    Unreachable,
}

/// Sends exact planned request bodies as one atomic bulk operation.
pub trait Graph: Send + Sync {
    fn create(
        &self,
        actor: ActorEntityUuid,
        bodies: &[&RawValue],
    ) -> impl Future<Output = GraphResponse> + Send;
    fn patch(
        &self,
        actor: ActorEntityUuid,
        bodies: &[&RawValue],
    ) -> impl Future<Output = GraphResponse> + Send;
}
