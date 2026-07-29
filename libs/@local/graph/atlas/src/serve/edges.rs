//! Edges delivery.
//!
//! The edges among the listed tiles' delivered rows, answered as `SALTILEE` envelope bytes in
//! ascending link-entity identity order.

use core::{error::Error, fmt};

use hashql_core::id::bit_vec::DenseBitSet;

use super::{
    Atlas, Filter, TileCoordinate, WireRow, grid,
    hydrate::{DeliveredEntities, EdgeLinkDetails},
    intern::{self, Table},
    neighbourhood::Neighbourhood,
    visibility::VisibilityProof,
    walk::Walk,
};
use crate::{
    dataset::ArchivedEntityId,
    identity::{EdgeRowId, NodeRowId},
    salt::wire::edges::{EdgesResponse, EdgesTrailer},
};

/// An edges request was rejected.
///
/// Every variant is a named, data-carrying rejection for the transport layer to map onto its error
/// vocabulary.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum EdgesError {
    /// The request lists more tiles than the cap admits.
    Tiles {
        /// The listed tile count.
        count: usize,
        /// The cap the manifest publishes as `limits.edgesTiles`.
        maximum: u32,
    },
    /// A listed zoom exceeds the generation's deepest served tile.
    Depth {
        /// The requested zoom.
        z: u8,
        /// The generation's deepest served zoom.
        maximum: u8,
    },
    /// A listed coordinate lies outside its zoom's `2^z` grid.
    Grid {
        /// The requested zoom.
        z: u8,
        /// The requested x index.
        x: u32,
        /// The requested y index.
        y: u32,
    },
    /// The request names a feature this build does not serve.
    ///
    /// The carried name is the request field.
    Unsupported(&'static str),
}

impl fmt::Display for EdgesError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Tiles { count, maximum } => {
                write!(
                    fmt,
                    "the request lists {count} tiles where the cap admits {maximum}"
                )
            }
            Self::Depth { z, maximum } => {
                write!(fmt, "zoom {z} exceeds the deepest served tile {maximum}")
            }
            Self::Grid { z, x, y } => {
                write!(fmt, "({x}, {y}) lies outside the 2^{z} tile grid")
            }
            Self::Unsupported(feature) => {
                write!(fmt, "this build does not serve {feature} requests")
            }
        }
    }
}

impl Error for EdgesError {}

/// One edges read: the ratified POST body.
#[derive(Debug, Clone, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EdgesRequest {
    /// The tiles whose delivered rows bound the edge set.
    pub tiles: Vec<TileCoordinate>,
    /// The visibility filter, a reserved field: a request that carries one is rejected.
    #[serde(default)]
    pub filter: Option<Filter>,
    /// Whether the response carries the detail trailer.
    #[serde(default)]
    pub include_detailed_data: bool,
}

/// The edges endpoint's request and response limits.
///
/// Transport configuration with documented defaults, never wire constants: the transport constructs
/// one value and the manifest publishes the same value, so enforcement and advertisement cannot
/// disagree.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct EdgesLimits {
    /// Most tiles one request may list; the manifest publishes this value as `limits.edgesTiles`.
    ///
    /// Defaults to 256.
    pub tiles: u32 = 256,
    /// Most edges one response delivers.
    ///
    /// Beyond it the rank-ordered cap truncates and `HEAD` reports `complete: false`.
    ///
    /// One delivered edge spends 40 bytes of columns: a 4-byte source, a 4-byte target, and its
    /// 32-byte link entity id. The default cap of `0x4000` edges bounds one response's columns at
    /// 640 KiB.
    pub edges: u32 = 0x4000,
}

const impl Default for EdgesLimits {
    fn default() -> Self {
        Self { .. }
    }
}

/// One assembled edges response: everything [`Atlas::encode_edges`] needs.
///
/// The document owns its columns, so it crosses thread boundaries between assembly, hydration, and
/// encoding - the envelope was designed for hydration-last, and the split mirrors it: assembly and
/// encoding are CPU-bound, hydration awaits the store between them.
#[derive(Debug)]
pub struct EdgesDocument {
    complete: bool,
    sources: Vec<WireRow<NodeRowId>>,
    targets: Vec<WireRow<NodeRowId>>,
    /// The delivered edges' link-entity identities, delivered order.
    edge_ids: Vec<ArchivedEntityId>,
    /// The internal edge rows behind `edge_ids`, delivered order.
    ///
    /// The hydration key the identity table speaks.
    internal_rows: Vec<EdgeRowId>,
}

impl Atlas {
    /// Answers one edges request.
    ///
    /// `SALTILEE` envelope bytes carrying the edges whose endpoints both lie in the listed tiles'
    /// delivered rows, ready to send under `application/vnd.hash.saltile-v1`.
    ///
    /// A request that sets `includeDetailedData` is rejected by name: this path serves deployments
    /// without a store connection. A transport with one assembles, hydrates, and encodes through
    /// [`Atlas::assemble_edges`], [`Atlas::delivered_edge_entities`], and [`Atlas::encode_edges`].
    ///
    /// # Errors
    ///
    /// As [`Atlas::assemble_edges`], plus [`EdgesError::Unsupported`] when the request sets
    /// `includeDetailedData`.
    pub fn edges(
        &self,
        request: &EdgesRequest,
        limits: EdgesLimits,
        proof: &VisibilityProof,
    ) -> Result<Vec<u8>, EdgesError> {
        if request.include_detailed_data {
            return Err(EdgesError::Unsupported("includeDetailedData"));
        }

        let document = self.assemble_edges(request, limits, proof)?;
        Ok(self.encode_edges(&document, None))
    }

    /// Assembles one edges request into its owned document.
    ///
    /// Every rejection happens here, so encoding cannot fail.
    ///
    /// Delivery order is ascending link-entity identity bytes, independent of the tiles listed
    /// and of truncation, so identical requests yield identical bytes under one bound serving
    /// state (generation, visibility, secret, limits) - and the order is
    /// client-verifiable from the `EDGE_IDS` column alone, carrying no internal-order
    /// information. Beyond `limits.edges` the rank-ordered cap keeps the edges whose worse endpoint
    /// ranks best - an edge is only as prominent as its less-prominent endpoint - with ties
    /// broken by identity bytes, and `HEAD` reports `complete: false`.
    ///
    /// An edge delivers under three conditions the proof states together: it holds the edge's own
    /// link row, and it holds both endpoints. The delivered row sets intersect the proof before
    /// edges qualify, and the link row carries the link entity's own authorization, which its
    /// endpoints do not imply.
    ///
    /// Version 0 serves the full unfiltered edge set; a request naming a visibility filter is
    /// rejected by name rather than answered with bytes that silently ignore it.
    ///
    /// # Errors
    ///
    /// Returns [`EdgesError::Tiles`] when the request lists more tiles than `limits.tiles`,
    /// [`EdgesError::Depth`] when a listed zoom exceeds the generation's deepest served tile,
    /// [`EdgesError::Grid`] when a listed coordinate lies outside its zoom's grid, and
    /// [`EdgesError::Unsupported`] when the request names a version-0 deferral.
    pub fn assemble_edges(
        &self,
        request: &EdgesRequest,
        limits: EdgesLimits,
        proof: &VisibilityProof,
    ) -> Result<EdgesDocument, EdgesError> {
        if request.filter.is_some() {
            return Err(EdgesError::Unsupported("filter"));
        }
        if request.tiles.len() > limits.tiles as usize {
            return Err(EdgesError::Tiles {
                count: request.tiles.len(),
                maximum: limits.tiles,
            });
        }

        let walk = Walk::of(self, proof);
        let mut delivered = self.delivered_rows(&walk, &request.tiles)?;
        proof.intersect(&mut delivered);

        let neighbourhood = Neighbourhood::of(self, proof);
        // The link identity rides selection: truncation ties and the
        // delivery sort both compare identity bytes, so nothing the
        // response exposes orders by internal id.
        let mut edges = neighbourhood.induced(&delivered);
        let complete = edges.len() <= limits.edges as usize;
        if !complete {
            neighbourhood.truncate_by_rank(&mut edges, limits.edges as usize);
        }
        edges.sort_unstable_by_key(|&(_, id)| id);

        let mut sources = Vec::with_capacity(edges.len());
        let mut targets = Vec::with_capacity(edges.len());
        let mut edge_ids = Vec::with_capacity(edges.len());
        let mut internal_rows = Vec::with_capacity(edges.len());
        for &(edge, id) in &edges {
            sources.push(self.node_codec.encode(edge.source));
            targets.push(self.node_codec.encode(edge.target));
            edge_ids.push(id);
            internal_rows.push(edge.row.get());
        }

        Ok(EdgesDocument {
            complete,
            sources,
            targets,
            edge_ids,
            internal_rows,
        })
    }

    /// Gathers the link-entity identities behind the document's delivered edges.
    ///
    /// In delivered order: the hydration request's subject.
    ///
    /// # Panics
    ///
    /// Panics when the identity table contradicts the adjacency's edge domain, which open's
    /// cross-artifact validation rules out.
    #[must_use]
    pub fn delivered_edge_entities(&self, document: &EdgesDocument) -> DeliveredEntities {
        let ids = document
            .internal_rows
            .iter()
            .map(|&row| {
                self.edge_ids
                    .id(row)
                    .expect("open validated the identity rows against the adjacency's edges")
            })
            .collect();

        DeliveredEntities::new(ids)
    }

    /// Encodes an assembled document.
    ///
    /// `SALTILEE` envelope bytes, ready to send under `application/vnd.hash.saltile-v1`, with the
    /// detail trailer riding iff `details` is supplied.
    ///
    /// The trailer interns type URLs at encode time: the table is the bytewise-sorted union of
    /// every edge's first direct type, and each reference keys by index into it.
    ///
    /// # Panics
    ///
    /// Panics when supplied details do not cover the document's delivered edges - a transport bug,
    /// never request data.
    #[must_use]
    pub fn encode_edges(
        &self,
        document: &EdgesDocument,
        details: Option<&EdgeLinkDetails>,
    ) -> Vec<u8> {
        let columns = details.map(|details| {
            let table = Table::new(
                details
                    .first_type_urls()
                    .iter()
                    .flatten()
                    .map(String::as_str),
            );
            let link_type_ids: Vec<Option<u32>> = details
                .first_type_urls()
                .iter()
                .map(|url| url.as_deref().map(|url| table.index_of(url)))
                .collect();
            (intern::borrowed(details.labels()), table, link_type_ids)
        });
        let trailer = columns
            .as_ref()
            .map(|(labels, table, link_type_ids)| EdgesTrailer {
                type_table: table.entries(),
                link_labels: labels,
                link_type_ids,
            });

        EdgesResponse {
            generation: self.generation.id().digest(),
            variant: 0,
            complete: document.complete,
            sources: &document.sources,
            targets: &document.targets,
            edge_ids: &document.edge_ids,
            trailer,
        }
        .encode()
    }

    /// Collects the union of the listed tiles' delivered rows as a row-indexed set.
    ///
    /// A tile's delivered set is mode-independent - its cumulative delta set equals its total set -
    /// so the union is one run scan per bucket of each tile's cumulative schedule, deduplicated by
    /// the set itself.
    fn delivered_rows(
        &self,
        walk: &Walk<'_>,
        tiles: &[TileCoordinate],
    ) -> Result<DenseBitSet<NodeRowId>, EdgesError> {
        let mut delivered = DenseBitSet::new_empty(self.rows.len());
        let maximum = self.grid.max_tile_depth();
        for &coordinate in tiles {
            if coordinate.z > maximum {
                return Err(EdgesError::Depth {
                    z: coordinate.z,
                    maximum,
                });
            }
            let cell = grid::cell_of(coordinate).ok_or(EdgesError::Grid {
                z: coordinate.z,
                x: coordinate.x,
                y: coordinate.y,
            })?;

            walk.delivered_rows_into(coordinate.z, cell, &mut delivered);
        }

        Ok(delivered)
    }
}
