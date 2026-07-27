//! Translate.
//!
//! Upstream entity ids to atlas identity, the correlation seam between entities the client fetched
//! through the graph API and dots already on screen.
//!
//! The response is two maps keyed by the requested id string echoed verbatim - byte-for-byte, no
//! normalization - so client-side map lookups are literal and kind is carried by which map answers.
//! A node answers its row id plus the wire-frame position (the same `f32` domain as the `POSITIONS`
//! column, so a translated entity lands pixel-identical to its tile-delivered dot); an edge answers
//! its endpoints' node row ids - edges carry no wire id of their own (the requested entity id IS
//! the edge's identity in every binary response), and no position by nature.
//!
//! An id that resolves to nothing is an absent key, never an error and never a null entry:
//! nonexistent ids, draft-suffixed ids (the corpus indexes live entities), and entities the
//! visibility proof hides are indistinguishable by doctrine (missing = denied). A node answers only
//! when its row is visible; an edge only when both its endpoints are - edge visibility derives,
//! never independently granted. Served wholly from the published identity artifacts and the fitted
//! coordinate column; the store is never consulted.

use alloc::collections::BTreeMap;
use core::{error::Error, fmt};

use hashql_core::id::Id as _;
use type_system::knowledge::entity::id::ENTITY_ID_DELIMITER;

use super::{Atlas, WireRow, codec::RowCodec, visibility::VisibilityProof};
use crate::{
    dataset::ArchivedEntityId,
    identity::{EdgeRowId, NodeRowId},
    math::Vec2,
    salt::fit::prepare::identity::IdentityTableArchive,
};

/// The translate endpoint's request cap.
///
/// Transport configuration with a documented default, never a wire constant: the transport
/// constructs one value and the manifest publishes the same value, so enforcement and advertisement
/// cannot disagree.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct TranslateLimits {
    /// Most entity ids one request may carry.
    ///
    /// The manifest publishes this value as `limits.translateEntityIds`. Defaults to 1024.
    pub entity_ids: u32,
}

const impl Default for TranslateLimits {
    fn default() -> Self {
        Self { entity_ids: 1024 }
    }
}

/// A translate request was rejected.
///
/// Every variant is a named, data-carrying rejection for the transport layer to map onto its error
/// vocabulary.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum TranslateError {
    /// The request lists more entity ids than the cap admits.
    Ids {
        /// The listed id count.
        count: usize,
        /// The cap the manifest publishes as `limits.translateEntityIds`.
        maximum: u32,
    },
}

impl fmt::Display for TranslateError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Ids { count, maximum } => {
                write!(
                    fmt,
                    "the request lists {count} entity ids where the cap admits {maximum}"
                )
            }
        }
    }
}

impl Error for TranslateError {}

/// One translate read: the ratified POST body.
#[derive(Debug, Clone, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TranslateRequest {
    /// The upstream entity ids to translate, in the `webId~entityUuid` form.
    ///
    /// Duplicates are legal and collapse.
    pub entity_ids: Vec<String>,
}

/// A node's atlas identity.
///
/// The row id every binary response uses, plus the node's position in the map's coordinate frame.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, schemars::JsonSchema)]
pub struct TranslatedNode {
    /// The node row id, the `ROW_IDS` domain.
    pub id: WireRow<NodeRowId>,
    /// The wire-frame x coordinate, the `POSITIONS` domain.
    pub x: f32,
    /// The wire-frame y coordinate, the `POSITIONS` domain.
    pub y: f32,
}

/// An edge's atlas identity: its endpoints' node row ids.
///
/// An edge has no row id of its own - binary responses identify it by its link entity id, which
/// the requester already holds - so translation answers the two points it joins.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, schemars::JsonSchema)]
pub struct TranslatedEdge {
    /// The source node row id, the `ROW_IDS` domain.
    pub source: WireRow<NodeRowId>,
    /// The target node row id, the `ROW_IDS` domain.
    pub target: WireRow<NodeRowId>,
}

/// The translate response.
///
/// Two maps keyed by the requested id strings echoed verbatim, so which map answers carries the
/// kind and lookups survive partial results.
///
/// The maps serialize in key order, so identical requests yield identical response bytes.
#[derive(Debug, Clone, PartialEq, serde::Serialize, schemars::JsonSchema)]
pub struct TranslateResponse {
    /// Resolved nodes by requested id.
    pub nodes: BTreeMap<String, TranslatedNode>,
    /// Resolved edges by requested id.
    pub edges: BTreeMap<String, TranslatedEdge>,
}

impl Atlas {
    /// Answers one translate request.
    ///
    /// Upstream entity ids to atlas row ids, plus wire-frame positions for nodes. The request is
    /// consumed: each resolved id string moves into its response key, so translation allocates
    /// nothing per id.
    ///
    /// # Errors
    ///
    /// Returns [`TranslateError::Ids`] when the request lists more entity ids than
    /// `limits.entity_ids`.
    pub fn translate(
        &self,
        request: TranslateRequest,
        limits: TranslateLimits,
        proof: &VisibilityProof,
    ) -> Result<TranslateResponse, TranslateError> {
        translate(
            request,
            limits,
            proof,
            &TranslateColumns {
                node_ids: &self.node_ids,
                edge_ids: &self.edge_ids,
                positions: self.positions(),
                position_of_row: self.positions_of_row(),
                endpoints: self.endpoint_pairs(),
                node_codec: &self.node_codec,
            },
        )
    }
}

/// One generation's translate inputs: the identity tables, fitted coordinates, and wire codec.
pub(super) struct TranslateColumns<'generation> {
    /// The node identity table.
    pub node_ids: &'generation IdentityTableArchive<ArchivedEntityId, NodeRowId>,
    /// The edge identity table.
    pub edge_ids: &'generation IdentityTableArchive<ArchivedEntityId, EdgeRowId>,
    /// The wire-coordinate column, base order.
    pub positions: &'generation [Vec2],
    /// The position permutation, row order.
    pub position_of_row: &'generation [u32],
    /// The endpoint column: edge row to `[source, target]`.
    pub endpoints: &'generation [[NodeRowId; 2]],
    /// The node universe's wire row-id codec.
    pub node_codec: &'generation RowCodec<NodeRowId>,
}

impl TranslateColumns<'_> {
    /// Returns an edge's endpoint rows in the wire's `u32` domain.
    ///
    /// # Panics
    ///
    /// Panics beyond the domain, which the columns rule out: rows share the `u32` wire domain.
    const fn endpoint_rows(&self, edge: EdgeRowId) -> [NodeRowId; 2] {
        self.endpoints[edge.as_usize()]
    }
}

/// Resolves a request's ids against one generation's translate columns.
///
/// Under the scope's visibility proof.
pub(super) fn translate(
    request: TranslateRequest,
    limits: TranslateLimits,
    proof: &VisibilityProof,
    columns: &TranslateColumns<'_>,
) -> Result<TranslateResponse, TranslateError> {
    if request.entity_ids.len() > limits.entity_ids as usize {
        return Err(TranslateError::Ids {
            count: request.entity_ids.len(),
            maximum: limits.entity_ids,
        });
    }

    // Requests speak the upstream string form and response keys echo it verbatim - the parse
    // boundary is the API contract, so resolution starts from the string, never a typed id.
    let mut nodes = BTreeMap::new();
    let mut edges = BTreeMap::new();
    for id_string in request.entity_ids {
        let Some(key) = parse(&id_string) else {
            continue;
        };

        if let Some(row) = columns.node_ids.row_of(key) {
            if proof.verify(row).is_none() {
                // Hidden: an absent key, indistinguishable from nonexistent.
                continue;
            }

            let position = columns.position_of_row[row.as_usize()] as usize;
            let point = columns.positions[position];
            nodes.insert(
                id_string,
                TranslatedNode {
                    id: columns.node_codec.encode(row),
                    x: point.x(),
                    y: point.y(),
                },
            );
        } else if let Some(edge) = columns.edge_ids.row_of(key) {
            let [source, target] = columns.endpoint_rows(edge);
            if !proof.edge_visible(source, target) {
                // A hidden endpoint hides the edge: an absent key.
                continue;
            }

            edges.insert(
                id_string,
                TranslatedEdge {
                    source: columns.node_codec.encode(source),
                    target: columns.node_codec.encode(target),
                },
            );
        } else {
            // Known to neither domain: an absent key by contract.
        }
    }

    Ok(TranslateResponse { nodes, edges })
}

/// Parses one upstream entity id into the identity tables' key form.
///
/// A draft-suffixed id (`webId~entityUuid~draftId`) reads unresolved by contract - the corpus
/// indexes live entities - as does anything that is not two `~`-delimited uuids.
pub(super) fn parse(id: &str) -> Option<ArchivedEntityId> {
    let (web_id, entity_uuid) = id.split_once(ENTITY_ID_DELIMITER)?;
    if entity_uuid.contains(ENTITY_ID_DELIMITER) {
        return None;
    }

    let web_id: uuid::Uuid = web_id.parse().ok()?;
    let entity_uuid: uuid::Uuid = entity_uuid.parse().ok()?;

    Some(ArchivedEntityId {
        web_id: web_id.into(),
        entity_uuid: entity_uuid.into(),
    })
}
