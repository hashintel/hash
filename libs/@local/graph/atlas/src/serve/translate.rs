//! Translate.
//!
//! Upstream entity ids to atlas identity, the correlation seam between entities the client fetched
//! through the graph API and dots already on screen.
//!
//! The response is two maps keyed by the requested id string echoed verbatim - byte-for-byte, no
//! normalization - so client-side map lookups are literal and kind is carried by which map answers.
//! A node answers its row id plus the wire-frame position (the same `f32` domain as the `POSITIONS`
//! column, so a translated entity lands pixel-identical to its tile-delivered dot); an edge answers
//! its row id alone - edges carry no position by nature.
//!
//! An id that resolves to nothing is an absent key, never an error and never a null entry:
//! nonexistent ids, draft-suffixed ids (the corpus indexes live entities), and entities the
//! visibility proof hides are indistinguishable by doctrine (missing = denied). A node answers only
//! when its row is visible; an edge only when both its endpoints are - edge visibility derives,
//! never independently granted. Served wholly from the published identity artifacts and the fitted
//! coordinate column; the store is never consulted.

use alloc::collections::BTreeMap;
use core::{error::Error, fmt};

use super::{Atlas, codec::RowCodec, narrow, visibility::VisibilityProof};
use crate::{
    dataset::ArchivedEntityId, math::Vec2, salt::fit::prepare::identity::IdentityTableArchive,
};

/// The upstream entity-id delimiter: `webId~entityUuid[~draftId]`.
const ENTITY_ID_DELIMITER: char = '~';

/// The translate endpoint's request cap.
///
/// Transport configuration with a documented default, never a wire constant: the transport
/// constructs one value and the manifest publishes the same value, so enforcement and advertisement
/// cannot disagree.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct TranslateCaps {
    /// Most entity ids one request may carry.
    ///
    /// The manifest publishes this value as `limits.translateEntityIds`. Defaults to 1024.
    pub entity_ids: u32,
}

const impl Default for TranslateCaps {
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
/// The row id every binary response speaks, plus the fitted wire-frame position.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, schemars::JsonSchema)]
pub struct TranslatedNode {
    /// The node row id, the `ROW_IDS` domain.
    pub id: u32,
    /// The wire-frame x coordinate, the `POSITIONS` domain.
    pub x: f32,
    /// The wire-frame y coordinate, the `POSITIONS` domain.
    pub y: f32,
}

/// An edge's atlas identity: the row id every binary response speaks.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, schemars::JsonSchema)]
pub struct TranslatedEdge {
    /// The edge row id, the `EDGE_ROW_IDS` domain.
    pub id: u32,
}

/// The translate response.
///
/// Two maps keyed by the requested id string echoed verbatim, so kind is carried by which map
/// answers and correlation survives partial results.
///
/// The maps iterate in key order, so identical requests yield identical response bytes.
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
    /// Upstream entity ids to atlas row ids, plus wire-frame positions for nodes.
    ///
    /// # Errors
    ///
    /// Returns [`TranslateError::Ids`] when the request lists more entity ids than
    /// `caps.entity_ids`.
    pub fn translate(
        &self,
        request: &TranslateRequest,
        caps: TranslateCaps,
        proof: &VisibilityProof,
    ) -> Result<TranslateResponse, TranslateError> {
        translate(
            request,
            caps,
            proof,
            &self.node_ids,
            &self.edge_ids,
            self.positions(),
            self.positions_of_row(),
            self.endpoint_pairs(),
            (&self.node_codec, &self.edge_codec),
        )
    }
}

/// Resolves a request's ids against one generation's identity tables and fitted coordinates.
///
/// Under the scope's visibility proof.
#[expect(
    clippy::too_many_arguments,
    reason = "the parameters are one generation's column views, listed once at the one call site"
)]
pub(super) fn translate(
    request: &TranslateRequest,
    caps: TranslateCaps,
    proof: &VisibilityProof,
    node_ids: &IdentityTableArchive<ArchivedEntityId>,
    edge_ids: &IdentityTableArchive<ArchivedEntityId>,
    positions: &[Vec2],
    position_of_row: &[u32],
    endpoints: &[[u64; 2]],
    (node_codec, edge_codec): (&RowCodec, &RowCodec),
) -> Result<TranslateResponse, TranslateError> {
    if request.entity_ids.len() > caps.entity_ids as usize {
        return Err(TranslateError::Ids {
            count: request.entity_ids.len(),
            maximum: caps.entity_ids,
        });
    }

    let mut nodes = BTreeMap::new();
    let mut edges = BTreeMap::new();
    for id_string in &request.entity_ids {
        let Some(key) = parse(id_string) else {
            continue;
        };

        if let Some(row) = node_ids.row_of(key) {
            let row = u32::try_from(row).expect("node rows share the u32 row-id domain");
            if proof.verify(row).is_none() {
                // Hidden: an absent key, indistinguishable from nonexistent.
                continue;
            }
            let position = position_of_row[row as usize] as usize;
            let point = positions[position];
            nodes.insert(
                id_string.clone(),
                TranslatedNode {
                    id: node_codec.encode(row).get(),
                    x: point.x(),
                    y: point.y(),
                },
            );
        } else if let Some(row) = edge_ids.row_of(key) {
            let [source, target] = endpoints[usize::try_from(row).expect("edge rows fit usize")];
            if !proof.edge_visible(narrow(source), narrow(target)) {
                // A hidden endpoint hides the edge: an absent key.
                continue;
            }
            edges.insert(
                id_string.clone(),
                TranslatedEdge {
                    id: edge_codec
                        .encode(u32::try_from(row).expect("edge rows share the u32 row-id domain"))
                        .get(),
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

/// Returns one identity-table key's wire form: the web uuid then the entity uuid, raw bytes.
///
/// The `bstr(32)` shape entity ids take on the binary wire - the generation digest's untagged
/// byte-string precedent, typed by its HEAD or trailer key rather than a CBOR tag.
pub(super) fn identity_bytes(id: ArchivedEntityId) -> [u8; 32] {
    zerocopy::transmute!(id)
}
