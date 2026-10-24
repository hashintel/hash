use serde::Deserialize;

use crate::{AddPlace, CommitNodePositions, RemovePlace, UpdatePlace};

/// Atomic document edits. Entity IDs use the normalized document's identifiers.
#[derive(Debug, Deserialize)]
#[serde(
    tag = "type",
    content = "input",
    rename_all = "camelCase",
    deny_unknown_fields
)]
pub enum Command {
    CommitNodePositions(CommitNodePositions),
    AddPlace(AddPlace),
    UpdatePlace(UpdatePlace),
    RemovePlace(RemovePlace),
}
