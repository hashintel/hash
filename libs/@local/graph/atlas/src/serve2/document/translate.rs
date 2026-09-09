//! Entity identities for correlating graph results with map geometry.
//!
//! Response keys preserve each requested string. Hidden, unknown and draft identities all produce
//! absent keys.

use alloc::collections::BTreeMap;
use core::{error::Error, fmt};

use error_stack::Report;
use type_system::knowledge::entity::{EntityId, id::ENTITY_ID_DELIMITER};
use uuid::Uuid;

use crate::{
    identity::NodeRowId,
    math::Vec2,
    postgres::id::ArchivedEntityId,
    serve2::{codec::EncodedRowId, neighbourhood::NeighbourhoodProvider as _, scene::Scene},
};

#[cfg(test)]
mod tests;

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct TranslateLimits {
    /// Most input identities, including duplicates. The default is 1024.
    pub entity_ids: u32 = 1024,
}

#[derive(Debug)]
pub(crate) enum TranslateDocumentError {
    /// The request lists more identities than the configured limit permits.
    Ids { count: usize, maximum: u32 },
}

impl fmt::Display for TranslateDocumentError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Ids { count, maximum } => write!(
                fmt,
                "the request lists {count} entity ids, exceeding the limit of {maximum}"
            ),
        }
    }
}

impl Error for TranslateDocumentError {}

#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct TranslatedNode {
    id: EncodedRowId<NodeRowId>,
    position: Vec2,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct TranslatedEdge {
    source: EncodedRowId<NodeRowId>,
    target: EncodedRowId<NodeRowId>,
}

/// Resolved map geometry keyed by the requested identity spelling.
#[derive(Debug, PartialEq)]
pub(crate) struct TranslateDocument {
    nodes: BTreeMap<ArchivedEntityId, TranslatedNode>,
    edges: BTreeMap<ArchivedEntityId, TranslatedEdge>,
}

impl TranslateDocument {
    /// Resolves identities against the captured scene.
    ///
    /// Nodes include their wire-frame position. Links require admission of their own row and both
    /// endpoint rows. Duplicate input strings collapse to one entry.
    ///
    /// # Errors
    ///
    /// Returns [`TranslateDocumentError`] when the input count exceeds the limit, before reading
    /// any identity.
    #[tracing::instrument(level = "debug", skip_all, fields(ids), err)]
    pub(crate) fn new(
        scene @ Scene {
            world, epoch, mask, ..
        }: Scene<'_>,
        ids: impl IntoIterator<Item = EntityId, IntoIter: ExactSizeIterator>,
        limits: TranslateLimits,
    ) -> Result<Self, Report<TranslateDocumentError>> {
        let ids = ids.into_iter();
        tracing::Span::current().record("ids", ids.len());
        if ids.len() > limits.entity_ids as usize {
            return Err(Report::new(TranslateDocumentError::Ids {
                count: ids.len(),
                maximum: limits.entity_ids,
            }));
        }

        let mut this = Self {
            nodes: BTreeMap::new(),
            edges: BTreeMap::new(),
        };
        for id in ids {
            let EntityId {
                web_id,
                entity_uuid,
                draft_id: None,
            } = id
            else {
                continue;
            };

            let key = ArchivedEntityId {
                web_id: web_id.into(),
                entity_uuid: entity_uuid.into(),
            };

            if let Some(row) = world.layout.index.row_of(epoch, key) {
                let Some(row) = mask.visible_node(row) else {
                    continue;
                };
                let Some(position) = world.layout.position(epoch, row.unwrap()) else {
                    continue;
                };
                this.nodes.insert(
                    key,
                    TranslatedNode {
                        id: world.layout.index.encode(row.unwrap()),
                        position,
                    },
                );
            } else if let Some(row) = world.topology.row_of(epoch, key)
                && let Some(edge) = scene.provide_edge(row)
            {
                let [source, target] = edge.endpoints;
                this.edges.insert(
                    key,
                    TranslatedEdge {
                        source: world.layout.index.encode(source),
                        target: world.layout.index.encode(target),
                    },
                );
            } else {
                // the entity is not visible or not an edge
            }
        }

        Ok(this)
    }
}
