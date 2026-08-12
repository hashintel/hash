//! Edges delivery.
//!
//! The edges among the listed tiles' delivered rows, answered as `SALTILEE` envelope bytes in
//! ascending link-entity identity order.

use core::{error::Error, fmt};

use hashql_core::id::{IdSlice, bit_vec::DenseBitSet};

use super::{
    Atlas, TileCoordinate, WireRow, grid,
    hydrate::{DetailError, EdgeLinkDetails, EdgesStore},
    intern::Table,
    neighbourhood::Neighbourhood,
    schedule::ScheduleCut,
    view::{View, ViewError},
    walk::Walk,
};
use crate::{
    dataset::postgres::id::ArchivedEntityId,
    identity::{EdgeRowId, NodeRowId},
    salt::wire::edges::{EdgesResponse, EdgesTrailer},
};

/// An edges request the atlas rejects, by name.
///
/// Every variant is a named, data-carrying rejection for the transport layer to map onto its error
/// vocabulary.
#[derive(Debug)]
pub(crate) enum EdgesError {
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
    /// The delivery view did not bind.
    ///
    /// A binding refusal converts into this variant through [`From`], so one error union carries a
    /// route's binding and assembly rejections together. [`Atlas::edges`] takes the view already
    /// bound, so its own rejections are all request-shaped.
    View(ViewError),
    /// The store half of the detail trailer failed.
    ///
    /// Only [`Atlas::edges`] answers this, because that path places the hydration order itself,
    /// and only a request asking for the detail trailer places one.
    Details(DetailError),
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
            Self::View(error) => error.fmt(fmt),
            Self::Details(error) => error.fmt(fmt),
        }
    }
}

impl Error for EdgesError {}

impl From<ViewError> for EdgesError {
    fn from(value: ViewError) -> Self {
        Self::View(value)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Default, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) enum EdgesDetail {
    #[default]
    Minimal,
    Auxiliary,
}

/// The POST body of one edges read.
#[derive(Debug, Clone, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct EdgesRequest {
    /// The tiles whose delivered rows bound the edge set.
    pub tiles: Vec<TileCoordinate>,
    /// Whether the response carries the detail trailer.
    #[serde(default)]
    pub detail: EdgesDetail,
}

/// The edges endpoint's request and response limits.
///
/// Transport configuration with documented defaults, never wire constants: the transport constructs
/// one value and the manifest publishes the same value, so enforcement and advertisement cannot
/// disagree.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct EdgesLimits {
    /// Most tiles one request may list.
    ///
    /// The manifest publishes this value as `limits.edgesTiles`.
    pub tiles: u32 = 256,
    /// Most edges one response delivers.
    ///
    /// Beyond it the rank-ordered cap truncates and `HEAD` reports `complete: false`.
    ///
    /// One delivered edge spends 40 bytes of columns across a 4-byte source, a 4-byte target, and its 32-byte link entity id. The default cap of `0x4000` edges bounds one response's columns at 640 KiB.
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
    rows: Vec<EdgeRowId>,
}

impl Atlas {
    /// Answers one edges request over its bound delivery view.
    ///
    /// `SALTILEE` envelope bytes carrying the edges whose endpoints both lie in the listed tiles'
    /// delivered rows, ready to send under `application/vnd.hash.saltile-v1`.
    ///
    /// A request asking for the detail trailer resolves labels in process from the generation's
    /// own payloads, and `store` answers the one hydration order such a request places. A minimal
    /// request drops the capability unused.
    ///
    /// # Errors
    ///
    /// As [`Atlas::assemble_edges`], plus [`EdgesError::Details`] when the store half of the
    /// detail trailer fails.
    pub(crate) fn edges(
        &self,
        request: &EdgesRequest,
        limits: EdgesLimits,
        view: View<'_>,
        store: impl EdgesStore,
    ) -> Result<Vec<u8>, EdgesError> {
        let document = self.assemble_edges(request, limits, &view)?;

        let details = match request.detail {
            EdgesDetail::Minimal => None,
            EdgesDetail::Auxiliary => {
                let labels = document
                    .rows
                    .iter()
                    .map(|&edge| {
                        self.edge_ids.payload_of(edge).expect(
                            "open validated the identity rows against the adjacency's edges",
                        )
                    })
                    .collect();
                let first_type_urls = store
                    .hydrate(IdSlice::from_raw(&document.edge_ids))
                    .map_err(EdgesError::Details)?;

                Some(EdgeLinkDetails::new(labels, first_type_urls))
            }
        };

        Ok(self.encode_edges(&document, details.as_ref()))
    }

    /// Assembles one edges request into its owned document.
    ///
    /// Every rejection happens here, so encoding cannot fail.
    ///
    /// Delivery order is ascending link-entity identity bytes, independent of the tiles listed and
    /// of truncation, so identical requests yield identical bytes under one bound serving state
    /// (generation, visibility, secret, limits) - and the order is client-verifiable from the
    /// `EDGE_IDS` column alone, carrying no internal-order information. Beyond `limits.edges` the
    /// rank-ordered cap keeps the edges whose worse endpoint ranks best - an edge is only as
    /// prominent as its less-prominent endpoint - with ties broken by identity bytes, and `HEAD`
    /// reports `complete: false`.
    ///
    /// The bounding set is the tile route's own delivery under `view`. An operator view unions the
    /// corpus schedule's cumulative prefixes at `z + span`, and a scoped view its own cascade's at
    /// `z + span + k`, which is exactly the set of rows its tiles rendered.
    ///
    /// An edge delivers under three conditions the proof states together. The proof holds the
    /// edge's own link row and both of its endpoints. The delivered row sets intersect the proof
    /// before edges qualify, and the link row carries the link entity's own authorization, which
    /// its endpoints do not imply.
    ///
    /// Version 0 serves the full unfiltered edge set. The endpoint rejects a request naming a
    /// visibility filter by name rather than answering it with bytes that ignore the filter without
    /// saying so.
    ///
    /// # Errors
    ///
    /// Returns [`EdgesError::Tiles`] when the request lists more tiles than `limits.tiles`,
    /// [`EdgesError::Depth`] when a listed zoom exceeds the generation's deepest served tile,
    /// [`EdgesError::Grid`] when a listed coordinate lies outside its zoom's grid, and
    /// [`EdgesError::Unsupported`] when the request names a version-0 deferral. The delivery
    /// contract is `view`'s, checked when it bound, so no rejection here is about it.
    fn assemble_edges(
        &self,
        request: &EdgesRequest,
        limits: EdgesLimits,
        view: &View<'_>,
    ) -> Result<EdgesDocument, EdgesError> {
        if request.tiles.len() > limits.tiles as usize {
            return Err(EdgesError::Tiles {
                count: request.tiles.len(),
                maximum: limits.tiles,
            });
        }

        let proof = view.proof();
        let walk = Walk::of(self, proof);
        let mut delivered = self.delivered_rows(&walk, view.cut(), &request.tiles)?;

        // Both branches of the union already gather visible rows alone - a scope cascade holds
        // only what its proof admitted, and the corpus walk answers only an operator view. The
        // intersection is what discharges `induced`'s caller requirement rather than a second
        // derivation of it, and it is the guard if either branch ever widens.
        proof.intersect(&mut delivered);

        let neighbourhood = Neighbourhood::of(self, proof);
        // Truncation ties and the delivery sort both compare identity bytes, so nothing the
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
            rows: internal_rows,
        })
    }

    /// Encodes an assembled document.
    ///
    /// `SALTILEE` envelope bytes, ready to send under `application/vnd.hash.saltile-v1`. The
    /// response carries the detail trailer iff the caller supplies `details`.
    ///
    /// The trailer interns type URLs at encode time. The table is the bytewise-sorted union of
    /// every edge's first direct type, and each reference keys by index into it.
    ///
    /// # Panics
    ///
    /// This panics when supplied details do not cover the document's delivered edges, which is a
    /// transport bug rather than request data.
    #[must_use]
    pub fn encode_edges(
        &self,
        document: &EdgesDocument,
        details: Option<&EdgeLinkDetails<'_>>,
    ) -> Vec<u8> {
        let columns = details.map(|details| {
            let table = Table::new(details.first_type_urls().iter().flatten());
            let link_type_ids: Vec<_> = details
                .first_type_urls()
                .iter()
                .map(|url| url.as_ref().map(|url| table.index_of(url)))
                .collect();

            (details.labels(), table, link_type_ids)
        });

        let trailer = columns
            .as_ref()
            .map(|(labels, table, link_type_ids)| EdgesTrailer {
                type_table: table.entries(),
                link_labels: labels.as_raw(),
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
    /// so the union is one cumulative-schedule read per tile, deduplicated by the set itself. A
    /// scoped view reads its own cascade's prefix through `cut`. An operator view reads the corpus
    /// schedule's runs. Each is the delivery the tile route answers under that same view.
    fn delivered_rows(
        &self,
        walk: &Walk<'_>,
        cut: Option<ScheduleCut<'_>>,
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

            match cut {
                Some(cut) => {
                    let row_ids = self.rows.view();
                    for position in cut.total(coordinate.z, cell).positions {
                        delivered.insert(row_ids[position]);
                    }
                }
                None => walk.delivered_rows_into(coordinate.z, cell, &mut delivered),
            }
        }

        Ok(delivered)
    }
}
