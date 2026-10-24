use serde::Deserialize;

use crate::{
    AddArc, AddPlace, AddTransition, ArcTarget, CommitNodePositions, RemovePlace, RemoveTransition,
    UpdateArcPlace, UpdateArcType, UpdateArcWeight, UpdatePlace, UpdateTransition,
};

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
    AddTransition(AddTransition),
    UpdateTransition(UpdateTransition),
    RemoveTransition(RemoveTransition),
    AddArc(AddArc),
    RemoveArc(ArcTarget),
    UpdateArcWeight(UpdateArcWeight),
    UpdateArcType(UpdateArcType),
    UpdateArcPlace(UpdateArcPlace),
}
