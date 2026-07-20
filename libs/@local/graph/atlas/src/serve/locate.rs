//! Locate groundwork: the spatial neighbour index and source
//! resolution.
//!
//! The index is kiddo's exact two-dimensional kd-tree over the wire
//! positions column, built eagerly at open so no first request pays
//! for it, and cached on disk keyed by generation id so a restart
//! against the same generation loads instead of rebuilding (ruling
//! 2026-07-20). The cache is a cache: any read failure - missing,
//! foreign magic, corrupt bytes - falls back to a fresh build and a
//! best-effort rewrite, never a failed open.

use camino::{Utf8Path, Utf8PathBuf};
use kiddo::{SquaredEuclidean, immutable::float::kdtree::ImmutableKdTree};

use super::{Atlas, TileCoordinate, depth_of, edges::DeliveredEdge, narrow};
use crate::{
    bitset::BitSet,
    file::generation::GenerationId,
    math::Vec2,
    morton::{Depth, MortonKey},
};

/// The cache file magic: pins the codec (rkyv 0.8) and the tree's
/// type parameters; a mismatch after a dependency upgrade reads as
/// foreign and rebuilds.
const CACHE_MAGIC: &[u8; 8] = b"SALTKDX1";

/// The exact spatial index behind locate's neighbour selection: item
/// index = base position, so lookups answer in the positions
/// column's own domain.
#[derive(Debug)]
pub(super) struct LocateIndex {
    tree: ImmutableKdTree<f32, u32, 2, 32>,
}

impl LocateIndex {
    /// Builds the index from the positions column.
    fn build(positions: &[Vec2]) -> Self {
        let points: Vec<[f32; 2]> = positions
            .iter()
            .map(|position| [position.x(), position.y()])
            .collect();

        Self {
            tree: ImmutableKdTree::new_from_slice(&points),
        }
    }

    /// Loads the generation's cached index, or builds it and leaves
    /// the cache behind for the next open.
    ///
    /// Without a cache directory the build is unconditional; with
    /// one, the file is keyed by generation id, so distinct
    /// generations never collide and a stale entry cannot be
    /// mistaken for current.
    pub(super) fn load_or_build(
        cache: Option<&Utf8Path>,
        generation: GenerationId,
        positions: &[Vec2],
    ) -> Self {
        let Some(directory) = cache else {
            return Self::build(positions);
        };
        let path = directory.join(format!("locate-{generation}.kdtree"));

        if let Some(index) = Self::read(&path) {
            return index;
        }

        let index = Self::build(positions);
        index.write(directory, &path);
        index
    }

    /// Reads one cache file; any failure reads as a miss.
    fn read(path: &Utf8Path) -> Option<Self> {
        let bytes = std::fs::read(path).ok()?;
        let payload = bytes.strip_prefix(CACHE_MAGIC)?;

        // rkyv access requires alignment the heap read does not
        // guarantee; the copy restores it.
        let mut aligned = rkyv::util::AlignedVec::<16>::new();
        aligned.extend_from_slice(payload);

        match rkyv::from_bytes::<ImmutableKdTree<f32, u32, 2, 32>, rkyv::rancor::Error>(&aligned) {
            Ok(tree) => Some(Self { tree }),
            Err(error) => {
                tracing::warn!(%path, %error, "the locate index cache is corrupt; rebuilding");
                None
            }
        }
    }

    /// Writes the cache file; failures warn and serve proceeds - the
    /// cache is never load-bearing.
    fn write(&self, directory: &Utf8Path, path: &Utf8Path) {
        let result = std::fs::create_dir_all(directory).and_then(|()| {
            let bytes =
                rkyv::to_bytes::<rkyv::rancor::Error>(&self.tree).map_err(std::io::Error::other)?;
            let mut payload = Vec::with_capacity(CACHE_MAGIC.len() + bytes.len());
            payload.extend_from_slice(CACHE_MAGIC);
            payload.extend_from_slice(&bytes);
            std::fs::write(path, payload)
        });

        if let Err(error) = result {
            tracing::warn!(%path, %error, "the locate index cache did not persist");
        }
    }

    /// Answers the `count` nearest base positions around `origin`,
    /// ascending by (squared distance, base position) - exact under
    /// that order, boundary ties included.
    ///
    /// The k-nearest query alone would leave boundary ties to the
    /// tree's internal order: co-located points are real (fit
    /// collision clusters), and which of them crosses a cut must
    /// follow the wire's own tie-break, not the index's. The query
    /// therefore only fixes the boundary DISTANCE - the multiset of
    /// returned distances is tie-independent - and a second, radius
    /// query collects every candidate at or under it for the exact
    /// (distance, position) selection.
    pub(super) fn nearest(
        &self,
        origin: [f32; 2],
        count: core::num::NonZero<usize>,
    ) -> Vec<(f32, u32)> {
        let boundary = self
            .tree
            .nearest_n::<SquaredEuclidean>(&origin, count)
            .into_iter()
            .map(|neighbour| neighbour.distance)
            .max_by(f32::total_cmp);
        let Some(boundary) = boundary else {
            return Vec::new();
        };

        let mut nearest: Vec<(f32, u32)> = self
            .tree
            .within_unsorted::<SquaredEuclidean>(&origin, boundary)
            .into_iter()
            .map(|neighbour| (neighbour.distance, neighbour.item))
            .collect();
        nearest.sort_unstable_by(|(left_distance, left), (right_distance, right)| {
            left_distance
                .total_cmp(right_distance)
                .then(left.cmp(right))
        });
        nearest.truncate(count.get());

        nearest
    }
}

/// The locate endpoint's caps.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct LocateCaps {
    /// Largest neighbour budget one request may name; requests over
    /// it clamp to it. The documented default is 32 (ratified
    /// 2026-07-20, amended from 64).
    pub neighbours: u32,
    /// Most subgraph edges one response delivers; a larger subgraph
    /// truncates by rank with source-incident edges protected, and
    /// HEAD reports `complete: false`. The documented default is 512
    /// (ratified 2026-07-20, replacing the vetoed uncapped draft -
    /// every delivered edge also costs live link hydration, so the
    /// cap bounds the store round trip, not just wire bytes).
    pub edges: u32,
}

impl Default for LocateCaps {
    fn default() -> Self {
        Self {
            neighbours: 32,
            edges: 512,
        }
    }
}

/// The options one serving open takes; configuration travels as a
/// struct, never constants or bare parameters (ruling 2026-07-20).
#[derive(Debug, Clone, Default)]
pub struct OpenOptions {
    /// The locate index cache directory; [`None`] builds the index
    /// on every open.
    pub locate_cache: Option<Utf8PathBuf>,
}

/// One resolved locate source: the subject's identity in every
/// domain a locate response speaks.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) struct SourcePoint {
    /// The node row id.
    pub row: u32,
    /// The base position behind the row.
    pub position: u32,
    /// The first zoom whose cumulative schedule delivers the point.
    pub zoom: u8,
    /// The point's tile at that zoom: the client's fly-to target.
    pub cell: TileCoordinate,
}

impl Atlas {
    /// Resolves a locate source: upstream entity id to node row,
    /// base position, first visible zoom, and fly-to tile.
    ///
    /// [`None`] for everything that does not name a visible node -
    /// unparsable, draft-suffixed, unknown, or an edge id - the
    /// transport's `unknown-entity` problem, identical for missing
    /// and denied.
    pub(super) fn resolve_source(&self, entity_id: &str) -> Option<SourcePoint> {
        let id = super::translate::parse(entity_id)?;
        let row = narrow(self.node_ids.row_of(id)?);
        let position = self.positions_of_row()[row as usize];

        // The position's fencepost segment is its morton bucket; the
        // cumulative cut rule (bucket <= z + span_log2) then answers
        // the first delivering zoom.
        let bucket = (0..=Depth::MAX.get())
            .find(|&bucket| {
                self.morton
                    .fenceposts()
                    .segment(depth_of(bucket))
                    .contains(&u64::from(position))
            })
            .expect("every base position lies in exactly one bucket segment");
        let zoom = bucket.saturating_sub(self.lod.span_log2);

        let key = MortonKey::from_bits(self.morton.codes()[position as usize].get());
        let [x, y] = key.coordinates();
        let cell = if zoom == 0 {
            TileCoordinate { z: 0, x: 0, y: 0 }
        } else {
            TileCoordinate {
                z: zoom,
                x: x >> (32 - u32::from(zoom)),
                y: y >> (32 - u32::from(zoom)),
            }
        };

        Some(SourcePoint {
            row,
            position,
            zoom,
            cell,
        })
    }

    /// Assembles the locate subgraph around a resolved source: the
    /// delivered node set and the capped edge set among it.
    ///
    /// Delivered order is the wire's pin: the source first, then its
    /// nearest neighbours ascending by (distance, base position).
    /// Edges are the edges endpoint's rule over this small set (both
    /// endpoints delivered, each edge exactly once), ascending edge
    /// row after the cap.
    pub(super) fn locate_subgraph(
        &self,
        source: SourcePoint,
        neighbours: u32,
        caps: LocateCaps,
    ) -> LocateSubgraph {
        let budget = neighbours.min(caps.neighbours) as usize;

        // The source is its own nearest point at distance zero, so
        // the query asks for one extra and drops it wherever it
        // surfaces. Boundary ties follow the same (distance,
        // position) order as the delivered set itself - the index
        // guarantees exactness, so a co-located cluster crosses the
        // budget cut by position, never by tree shape.
        let count = core::num::NonZero::new(budget + 1).expect("budget + 1 is nonzero");
        let mut delivered: Vec<u32> = vec![source.position];
        delivered.extend(
            self.locate
                .nearest(
                    {
                        let origin = self.positions()[source.position as usize];
                        [origin.x(), origin.y()]
                    },
                    count,
                )
                .into_iter()
                .map(|(_, position)| position)
                .filter(|&position| position != source.position)
                .take(budget),
        );

        let row_ids = self.row_ids();
        let rows: Vec<u32> = delivered
            .iter()
            .map(|&position| row_ids[position as usize])
            .collect();

        let mut in_set = BitSet::new(row_ids.len());
        for &row in &rows {
            in_set.insert(row as usize);
        }
        let mut edges = self.qualifying_edges(&in_set);
        let complete = edges.len() <= caps.edges as usize;
        if !complete {
            self.truncate_protecting_source(&mut edges, caps.edges as usize, source.row);
        }
        edges.sort_unstable_by_key(|edge| edge.row);

        LocateSubgraph {
            rows,
            positions: delivered,
            edges,
            complete,
        }
    }

    /// Keeps the `cap` edges the protected rank order selects:
    /// source-incident edges strictly before context edges, then
    /// ascending worse-endpoint rank, ties by edge row (ruling
    /// 2026-07-20 - the spotlight's primary information is how the
    /// source connects, so neighbour-neighbour context truncates
    /// first).
    fn truncate_protecting_source(
        &self,
        edges: &mut Vec<DeliveredEdge>,
        cap: usize,
        source_row: u32,
    ) {
        if cap == 0 {
            edges.clear();
            return;
        }

        let mut ranked: Vec<((bool, u32, u32), DeliveredEdge)> = edges
            .drain(..)
            .map(|edge| {
                let context = edge.source != source_row && edge.target != source_row;
                ((context, self.worse_rank(edge), edge.row), edge)
            })
            .collect();
        // Partitioning at `cap - 1` places the cap smallest keys - a
        // total order, since edge rows are distinct - in the head.
        ranked.select_nth_unstable_by_key(cap - 1, |&(key, _)| key);
        ranked.truncate(cap);
        edges.extend(ranked.into_iter().map(|(_, edge)| edge));
    }
}

/// One assembled locate subgraph: the delivered nodes (source first,
/// then neighbours in wire order) and the capped edge set among
/// them.
#[derive(Debug, PartialEq, Eq)]
pub(super) struct LocateSubgraph {
    /// The delivered node rows, in delivered order.
    pub rows: Vec<u32>,
    /// The delivered base positions, parallel to `rows`.
    pub positions: Vec<u32>,
    /// The delivered edges, ascending edge row.
    pub edges: Vec<DeliveredEdge>,
    /// Whether every qualifying edge is delivered; `false` iff the
    /// cap truncated.
    pub complete: bool,
}
