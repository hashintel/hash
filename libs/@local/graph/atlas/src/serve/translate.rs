//! Translate.
//!
//! Upstream entity ids to atlas identity, the correlation seam between entities the client fetched
//! through the graph API and dots already on screen.
//!
//! The response is two maps keyed by the requested id string echoed verbatim, byte-for-byte and
//! without normalization, so client-side map lookups are literal and which map answers gives the
//! kind. A node answers its row id plus the wire-frame position in the same `f32` domain as the
//! `POSITIONS` column, so a translated entity occupies the same pixel as its tile-delivered dot.
//! Edges answer their endpoints' node row ids. An edge carries no wire id of its own, since the
//! requested entity id is its identity in every binary response, and an edge has no position by
//! nature.
//!
//! An id that resolves to nothing yields an absent key rather than an error or a null entry.
//! Nonexistent ids, draft-suffixed ids (the corpus indexes live entities), and entities the
//! visibility proof hides are indistinguishable by doctrine (missing = denied). A node answers only
//! when the proof admits its row, and an edge only when the proof admits its link row together with
//! both endpoints, so the link domain carries an authorization its endpoints do not imply. Every
//! scope resolves both domains, and a link id the proof does not admit is an absent key,
//! indistinguishable from an id belonging to neither domain. Translation reads the published
//! identity artifacts and the fitted coordinate column alone, never the store.

use alloc::collections::BTreeMap;
use core::{error::Error, fmt};

use hashql_core::id::IdSlice;
use type_system::knowledge::entity::id::ENTITY_ID_DELIMITER;

use super::{Atlas, WireRow, codec::RowCodec, visibility::VisibilityProof};
use crate::{
    dataset::ArchivedEntityId,
    identity::{BasePosition, EdgeRowId, NodeRowId},
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
    /// The manifest publishes this value as `limits.translateEntityIds`.
    pub entity_ids: u32 = 1024,
}

const impl Default for TranslateLimits {
    fn default() -> Self {
        Self { .. }
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

/// The ratified POST body of one translate read.
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

/// An edge's atlas identity, its endpoints' node row ids.
///
/// An edge has no row id of its own. Binary responses identify it by its link entity id, which the
/// requester already holds, so translation answers the two points it joins.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, schemars::JsonSchema)]
pub struct TranslatedEdge {
    /// The source node row id, the `ROW_IDS` domain.
    pub source: WireRow<NodeRowId>,
    /// The target node row id, the `ROW_IDS` domain.
    pub target: WireRow<NodeRowId>,
}

/// The translate response.
///
/// Both maps take the requested id string as their key, echoed verbatim, so the answering map gives
/// the kind and lookups survive partial results.
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
    /// Upstream entity ids to atlas row ids, plus wire-frame positions for nodes. Translation
    /// consumes the request and reuses each resolved id string as its response key, so it allocates
    /// nothing per id.
    ///
    /// A node id resolves when the proof holds its row. Link ids resolve when the proof holds the
    /// link row and both of its endpoints, and answer an absent key otherwise, the same answer an
    /// id of neither domain receives.
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

/// One generation's translate inputs.
///
/// The columns are the identity tables, the fitted coordinates, and the wire codec.
pub(super) struct TranslateColumns<'generation> {
    /// The node identity table.
    pub node_ids: &'generation IdentityTableArchive<ArchivedEntityId, NodeRowId>,
    /// The edge identity table.
    pub edge_ids: &'generation IdentityTableArchive<ArchivedEntityId, EdgeRowId>,
    /// The wire-coordinate column, base order.
    pub positions: &'generation IdSlice<BasePosition, Vec2>,
    /// The position permutation, row order.
    pub position_of_row: &'generation IdSlice<NodeRowId, BasePosition>,
    /// The endpoint column, mapping each edge row to `[source, target]`.
    pub endpoints: &'generation IdSlice<EdgeRowId, [NodeRowId; 2]>,
    /// The node universe's wire row-id codec.
    pub node_codec: &'generation RowCodec<NodeRowId>,
}

impl TranslateColumns<'_> {
    /// Returns an edge's endpoint rows.
    ///
    /// # Panics
    ///
    /// This panics beyond the edge-row domain, which resolution rules out.
    const fn endpoint_rows(&self, edge: EdgeRowId) -> [NodeRowId; 2] {
        self.endpoints[edge]
    }
}

/// Resolves a request's ids against one generation's translate columns.
///
/// Under the authority's visibility proof.
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

            let position = columns.position_of_row[row];
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
            if proof.verify_edge(edge, source, target).is_none() {
                // A hidden link row or endpoint hides the edge: an
                // absent key.
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
            // Known to neither identity domain: an absent key by contract.
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
