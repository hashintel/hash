//! Edges delivery: the edges among the listed tiles' delivered rows,
//! answered as `SALTILEE` envelope bytes in ascending edge-row order.

use core::{error::Error, fmt};

use super::{Atlas, Filter, TileCoordinate, cell_of, depth_of, narrow};
use crate::{bitset::BitSet, dataset::NodeRowId, salt::wire::edges::EdgesResponse};

/// Most tiles one edges request may list: the documented default of
/// the manifest's `edgesTiles` cap.
pub(super) const EDGES_TILES_CAP: u32 = 256;

/// Most edges one response delivers before the rank-ordered cap
/// truncates: the documented default, roughly 200 KiB of columns.
const EDGES_CAP: u32 = 0x4000;

/// An edges request was rejected.
///
/// Every variant is a named, data-carrying rejection for the
/// transport layer to map onto its error vocabulary.
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
    /// The request names a feature this build does not serve; the
    /// carried name is the request field.
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

/// The edges endpoint's request and response caps: transport
/// configuration with documented defaults, never wire constants.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct EdgesCaps {
    /// Most tiles one request may list; the manifest publishes this
    /// value as `limits.edgesTiles`.
    pub tiles: u32,
    /// Most edges one response delivers; beyond it the rank-ordered
    /// cap truncates and `HEAD` reports `complete: false`.
    pub edges: u32,
}

const impl Default for EdgesCaps {
    fn default() -> Self {
        Self {
            tiles: EDGES_TILES_CAP,
            edges: EDGES_CAP,
        }
    }
}

/// One qualifying edge during assembly: the wire columns' row ids.
#[derive(Debug, Copy, Clone)]
struct DeliveredEdge {
    /// The edge row id.
    row: u32,
    /// The source node row id.
    source: u32,
    /// The target node row id.
    target: u32,
}

impl Atlas {
    /// Answers one edges request: `SALTILEE` envelope bytes carrying
    /// the edges whose endpoints both lie in the listed tiles'
    /// delivered rows, ready to send under
    /// `application/vnd.hash.saltile-v1`.
    ///
    /// Delivery order is ascending edge row id, independent of the
    /// tiles listed and of truncation, so identical requests yield
    /// identical bytes. Beyond `caps.edges` the rank-ordered cap
    /// keeps the edges whose worse endpoint ranks best - an edge is
    /// only as prominent as its less-prominent endpoint - with ties
    /// broken by edge row id, and `HEAD` reports `complete: false`.
    ///
    /// Version 0 serves the full unfiltered edge set; requests naming
    /// a visibility filter or the detail trailer are rejected by name
    /// rather than answered with bytes that silently ignore them.
    ///
    /// # Errors
    ///
    /// Returns [`EdgesError::Tiles`] when the request lists more
    /// tiles than `caps.tiles`, [`EdgesError::Depth`] when a listed
    /// zoom exceeds the generation's deepest served tile,
    /// [`EdgesError::Grid`] when a listed coordinate lies outside its
    /// zoom's grid, and [`EdgesError::Unsupported`] when the request
    /// names a version-0 deferral.
    pub fn edges(&self, request: &EdgesRequest, caps: EdgesCaps) -> Result<Vec<u8>, EdgesError> {
        if request.filter.is_some() {
            return Err(EdgesError::Unsupported("filter"));
        }
        if request.include_detailed_data {
            return Err(EdgesError::Unsupported("includeDetailedData"));
        }
        if request.tiles.len() > caps.tiles as usize {
            return Err(EdgesError::Tiles {
                count: request.tiles.len(),
                maximum: caps.tiles,
            });
        }

        let delivered = self.delivered_rows(&request.tiles)?;
        let mut edges = self.qualifying_edges(&delivered);
        let complete = edges.len() <= caps.edges as usize;
        if !complete {
            self.truncate_by_rank(&mut edges, caps.edges as usize);
        }
        edges.sort_unstable_by_key(|edge| edge.row);

        let mut sources = Vec::with_capacity(edges.len());
        let mut targets = Vec::with_capacity(edges.len());
        let mut edge_rows = Vec::with_capacity(edges.len());
        for edge in &edges {
            sources.push(edge.source);
            targets.push(edge.target);
            edge_rows.push(edge.row);
        }

        Ok(EdgesResponse {
            generation: self.generation.id().digest(),
            variant: 0,
            complete,
            sources: &sources,
            targets: &targets,
            edge_rows: &edge_rows,
            trailer: None,
        }
        .encode())
    }

    /// Collects the union of the listed tiles' delivered rows as a
    /// row-indexed set.
    ///
    /// A tile's delivered set is mode-independent - its cumulative
    /// delta set equals its total set - so the union is one run scan
    /// per bucket of each tile's cumulative schedule, deduplicated by
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

    /// Collects every edge whose endpoints both lie in `delivered`,
    /// in no particular order.
    ///
    /// The walk visits each delivered row's outgoing run, so every
    /// qualifying edge appears exactly once: an edge occupies exactly
    /// one outgoing slot, and a self-loop's one endpoint is both its
    /// source and its target.
    fn qualifying_edges(&self, delivered: &BitSet) -> Vec<DeliveredEdge> {
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

    /// Keeps the `cap` edges the rank-ordered cap selects: ascending
    /// by worse-endpoint rank, ties by edge row id.
    fn truncate_by_rank(&self, edges: &mut Vec<DeliveredEdge>, cap: usize) {
        if cap == 0 {
            edges.clear();
            return;
        }

        let mut ranked: Vec<(u32, DeliveredEdge)> = edges
            .drain(..)
            .map(|edge| (self.worse_rank(edge), edge))
            .collect();
        // Partitioning at `cap - 1` places the cap smallest keys - a
        // total order, since edge rows are distinct - in the head.
        ranked.select_nth_unstable_by_key(cap - 1, |&(rank, edge)| (rank, edge.row));
        ranked.truncate(cap);
        edges.extend(ranked.into_iter().map(|(_, edge)| edge));
    }

    /// Returns an edge's truncation rank: its worse endpoint's
    /// importance rank, where larger values are less prominent.
    fn worse_rank(&self, edge: DeliveredEdge) -> u32 {
        self.rank_of_row(edge.source)
            .max(self.rank_of_row(edge.target))
    }

    /// Returns a node row's importance rank through the position
    /// permutation.
    fn rank_of_row(&self, row: u32) -> u32 {
        let position = self.positions_of_row()[row as usize];
        self.ranks()[position as usize]
    }
}
