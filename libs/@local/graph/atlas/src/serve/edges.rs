//! Edges delivery.
//!
//! The edges among the listed tiles' delivered rows, answered as `SALTILEE` envelope bytes in
//! ascending edge-row order.

use core::{error::Error, fmt};

use super::{
    Atlas, Filter, TileCoordinate, cell_of, depth_of,
    detail::{DeliveredEntities, LinkDetails},
    narrow,
    visibility::VisibilityProof,
};
use crate::{
    bitset::BitSet,
    dataset::NodeRowId,
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
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Tiles { count, maximum } => {
                write!(
                    formatter,
                    "the request lists {count} tiles where the cap admits {maximum}"
                )
            }
            Self::Depth { z, maximum } => {
                write!(
                    formatter,
                    "zoom {z} exceeds the deepest served tile {maximum}"
                )
            }
            Self::Grid { z, x, y } => {
                write!(formatter, "({x}, {y}) lies outside the 2^{z} tile grid")
            }
            Self::Unsupported(feature) => {
                write!(formatter, "this build does not serve {feature} requests")
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
    /// The visibility filter; absent means the trivial bitmap.
    #[serde(default)]
    pub filter: Option<Filter>,
    /// Whether the detail trailer rides the response.
    #[serde(default)]
    pub include_detailed_data: bool,
}

/// The edges endpoint's request and response caps.
///
/// Transport configuration with documented defaults, never wire constants: the transport constructs
/// one value and the manifest publishes the same value, so enforcement and advertisement cannot
/// disagree.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct EdgesCaps {
    /// Most tiles one request may list; the manifest publishes this value as `limits.edgesTiles`.
    ///
    /// Defaults to 256.
    pub tiles: u32,
    /// Most edges one response delivers.
    ///
    /// Beyond it the rank-ordered cap truncates and `HEAD` reports `complete: false`. Defaults to
    /// `0x4000` - roughly 200 KiB of columns.
    pub edges: u32,
}

const impl Default for EdgesCaps {
    fn default() -> Self {
        Self {
            tiles: 256,
            edges: 0x4000,
        }
    }
}

/// One qualifying edge during assembly: the wire columns' row ids.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) struct DeliveredEdge {
    /// The edge row id.
    pub row: u32,
    /// The source node row id.
    pub source: u32,
    /// The target node row id.
    pub target: u32,
}

/// One assembled edges response: everything [`Atlas::encode_edges`] needs.
///
/// The document owns its columns, so it crosses thread boundaries between assembly, hydration, and
/// encoding - the envelope was designed for hydration-last, and the split mirrors it: assembly and
/// encoding are CPU-bound, hydration awaits the store between them.
#[derive(Debug)]
pub struct EdgesDocument {
    complete: bool,
    sources: Vec<u32>,
    targets: Vec<u32>,
    edge_rows: Vec<u32>,
    /// The internal edge rows behind `edge_rows`, delivered order.
    ///
    /// The hydration key the identity table speaks.
    internal_rows: Vec<u32>,
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
        caps: EdgesCaps,
        proof: &VisibilityProof,
    ) -> Result<Vec<u8>, EdgesError> {
        if request.include_detailed_data {
            return Err(EdgesError::Unsupported("includeDetailedData"));
        }

        let document = self.assemble_edges(request, caps, proof)?;
        Ok(self.encode_edges(&document, None))
    }

    /// Assembles one edges request into its owned document.
    ///
    /// Every rejection happens here, so encoding cannot fail.
    ///
    /// Delivery order is ascending edge row id, independent of the tiles listed and of truncation,
    /// so identical requests yield identical bytes. Every id on the wire is the generation's keyed
    /// wire id, so the order carries no internal-order information. Beyond `caps.edges` the
    /// rank-ordered cap keeps the edges whose worse endpoint ranks best - an edge is only as
    /// prominent as its less-prominent endpoint - with ties broken by wire edge row id, and `HEAD`
    /// reports `complete: false`.
    ///
    /// The edge set inherits the visibility mask through its endpoints: the delivered row sets
    /// intersect the proof before edges qualify, so an edge with a hidden endpoint is never
    /// delivered and requires no edge-level check of its own.
    ///
    /// Version 0 serves the full unfiltered edge set; a request naming a visibility filter is
    /// rejected by name rather than answered with bytes that silently ignore it.
    ///
    /// # Errors
    ///
    /// Returns [`EdgesError::Tiles`] when the request lists more tiles than `caps.tiles`,
    /// [`EdgesError::Depth`] when a listed zoom exceeds the generation's deepest served tile,
    /// [`EdgesError::Grid`] when a listed coordinate lies outside its zoom's grid, and
    /// [`EdgesError::Unsupported`] when the request names a version-0 deferral.
    pub fn assemble_edges(
        &self,
        request: &EdgesRequest,
        caps: EdgesCaps,
        proof: &VisibilityProof,
    ) -> Result<EdgesDocument, EdgesError> {
        if request.filter.is_some() {
            return Err(EdgesError::Unsupported("filter"));
        }
        if request.tiles.len() > caps.tiles as usize {
            return Err(EdgesError::Tiles {
                count: request.tiles.len(),
                maximum: caps.tiles,
            });
        }

        let mut delivered = self.delivered_rows(&request.tiles)?;
        proof.intersect(&mut delivered);
        // The wire edge id rides selection: truncation ties and the
        // delivery sort both compare wire values, so nothing the
        // response exposes orders by internal id.
        let mut edges: Vec<(DeliveredEdge, u32)> = self
            .qualifying_edges(&delivered)
            .into_iter()
            .map(|edge| (edge, self.edge_codec.encode(edge.row).get()))
            .collect();
        let complete = edges.len() <= caps.edges as usize;
        if !complete {
            self.truncate_by_rank(&mut edges, caps.edges as usize);
        }
        edges.sort_unstable_by_key(|&(_, wire)| wire);

        let mut sources = Vec::with_capacity(edges.len());
        let mut targets = Vec::with_capacity(edges.len());
        let mut edge_rows = Vec::with_capacity(edges.len());
        let mut internal_rows = Vec::with_capacity(edges.len());
        for &(edge, wire) in &edges {
            sources.push(self.node_codec.encode(edge.source).get());
            targets.push(self.node_codec.encode(edge.target).get());
            edge_rows.push(wire);
            internal_rows.push(edge.row);
        }

        Ok(EdgesDocument {
            complete,
            sources,
            targets,
            edge_rows,
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
                    .id(u64::from(row))
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
    /// # Panics
    ///
    /// Panics when supplied details do not cover the document's delivered edges - a transport bug,
    /// never request data.
    #[must_use]
    pub fn encode_edges(&self, document: &EdgesDocument, details: Option<&LinkDetails>) -> Vec<u8> {
        let columns = details.map(|details| {
            (
                borrow(details.labels()),
                borrow(details.icons()),
                borrow(details.type_labels()),
                borrow(details.type_icons()),
            )
        });
        let trailer = columns
            .as_ref()
            .map(|(labels, icons, type_labels, type_icons)| EdgesTrailer {
                link_labels: labels,
                link_icons: icons,
                link_type_labels: type_labels,
                link_type_icons: type_icons,
            });

        EdgesResponse {
            generation: self.generation.id().digest(),
            variant: 0,
            complete: document.complete,
            sources: &document.sources,
            targets: &document.targets,
            edge_rows: &document.edge_rows,
            trailer,
        }
        .encode()
    }

    /// Collects the union of the listed tiles' delivered rows as a row-indexed set.
    ///
    /// A tile's delivered set is mode-independent - its cumulative delta set equals its total set -
    /// so the union is one run scan per bucket of each tile's cumulative schedule, deduplicated by
    /// the set itself.
    fn delivered_rows(&self, tiles: &[TileCoordinate]) -> Result<BitSet, EdgesError> {
        let row_ids = self.row_ids();
        let mut delivered = BitSet::new(row_ids.len());
        let maximum = self.lod.max_tile_depth;
        for &coordinate in tiles {
            if coordinate.z > maximum {
                return Err(EdgesError::Depth {
                    z: coordinate.z,
                    maximum,
                });
            }
            let cell = cell_of(coordinate).ok_or(EdgesError::Grid {
                z: coordinate.z,
                x: coordinate.x,
                y: coordinate.y,
            })?;

            let cut = depth_of(coordinate.z + self.lod.span_log2);
            for bucket in 0..=cut.get() {
                let run = self.morton.run(depth_of(bucket), cell);
                let start = usize::try_from(run.start).expect("base positions fit usize");
                let end = usize::try_from(run.end).expect("base positions fit usize");
                for &row in &row_ids[start..end] {
                    delivered.insert(row as usize);
                }
            }
        }

        Ok(delivered)
    }

    /// Collects every edge whose endpoints both lie in `delivered`, in no particular order.
    ///
    /// The walk visits each delivered row's outgoing run, so every qualifying edge appears exactly
    /// once: an edge occupies exactly one outgoing slot, and a self-loop's one endpoint is both its
    /// source and its target.
    pub(super) fn qualifying_edges(&self, delivered: &BitSet) -> Vec<DeliveredEdge> {
        let endpoints = self.endpoint_pairs();
        let mut edges = Vec::new();
        for row in delivered.iter() {
            let outgoing = self
                .adjacency
                .outgoing(NodeRowId::new(row as u64))
                .expect("delivered rows lie inside the adjacency's node domain");
            for edge in outgoing.iter() {
                let index = usize::try_from(edge.get()).expect("edge rows fit usize");
                let [source, target] = endpoints[index];
                let target_index = usize::try_from(target).expect("node rows fit usize");
                if delivered.contains(target_index) {
                    edges.push(DeliveredEdge {
                        row: narrow(edge.get()),
                        source: narrow(source),
                        target: narrow(target),
                    });
                }
            }
        }

        edges
    }

    /// Keeps the `cap` edges the rank-ordered cap selects.
    ///
    /// Ascending by worse-endpoint rank, ties by wire edge row id.
    fn truncate_by_rank(&self, edges: &mut Vec<(DeliveredEdge, u32)>, cap: usize) {
        if cap == 0 {
            edges.clear();
            return;
        }

        let mut ranked: Vec<(u32, (DeliveredEdge, u32))> = edges
            .drain(..)
            .map(|entry| (self.worse_rank(entry.0), entry))
            .collect();
        // Partitioning at `cap - 1` places the cap smallest keys - a
        // total order, since wire edge ids are distinct - in the head.
        ranked.select_nth_unstable_by_key(cap - 1, |&(rank, (_, wire))| (rank, wire));
        ranked.truncate(cap);
        edges.extend(ranked.into_iter().map(|(_, entry)| entry));
    }

    /// Returns an edge's truncation rank.
    ///
    /// Its worse endpoint's importance rank, where larger values are less prominent.
    fn worse_rank(&self, edge: DeliveredEdge) -> u32 {
        self.rank_of_row(edge.source)
            .max(self.rank_of_row(edge.target))
    }

    /// Returns a node row's importance rank through the position permutation.
    fn rank_of_row(&self, row: u32) -> u32 {
        let position = self.positions_of_row()[row as usize];
        self.ranks()[position as usize]
    }
}

/// Borrows one owned detail column as the encoder's `&str` view.
pub(super) fn borrow(entries: &[Option<String>]) -> Vec<Option<&str>> {
    entries.iter().map(Option::as_deref).collect()
}
