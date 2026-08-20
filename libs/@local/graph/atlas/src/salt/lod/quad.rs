//! The quadtree build, which cuts the base delivery order into tiles.
//!
//! [`QuadTree::build`] derives the quad file's regions from the finished lod columns. The tree
//! holds one node for every tile the bucket-cut schedule delivers something new into. Each node
//! carries its own-bucket run of the base order. A node also records the point count of its subtree
//! and the set of direct types under it.
//!
//! The root always exists and covers the wire frame. A deeper cell gets a node exactly when it
//! contains a point the parent tile's cut did not deliver, a point whose bucket is at least the
//! cell's own cut `z + span_log2`. The cascade shapes the tree in two ways:
//!
//! - Chains self-terminate. A point alone in its depth-`d` cell is that cell's best-ranked
//!   occupant, so the first-occupant cascade assigns it a bucket no deeper than the first depth
//!   where it stands alone. Isolated points never force node chains.
//! - Runs partition the base order. A point with bucket `b` beyond the root's cut shows up in
//!   exactly one node's run - its cell at depth `b - span_log2`, which exists because the point
//!   itself witnesses the rule - and the root's run carries buckets `0..=span_log2` whole and
//!   contiguous, because the base order is bucket-major. The tile pyramid therefore delivers every
//!   point exactly once.
//!
//! The recursion needs no depth cap. The cascade assigns no bucket beyond `max_tile_depth +
//! span_log2`, so leaves at the deepest tile zoom fall out by construction.
//!
//! The partition-point searches of `file/morton`'s `run` query narrow each node's run (first code
//! at or above the cell's minimum key, first beyond its maximum), so the builder and the served
//! lookups can never disagree about a run's extent.

use alloc::collections::BTreeSet;
use core::ops::Range;
use std::io;

use hashql_core::id::{Id as _, IdSlice, IdVec};
use smallvec::SmallVec;

use super::stage::{Lod, LodConfig};
use crate::{
    file::{
        WriteAs, WriteInto,
        morton::SEGMENTS,
        quad::{Node, TypeSets, write::write_regions},
    },
    identity::{BasePosition, NodeRowId, OntologyRowId},
    integrity::{Sha256, Sha256Digest, Writer},
    morton::{Depth, MortonCell, MortonKey},
};

/// Building the quadtree failed.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum QuadError {
    /// The configuration names a schedule no 64-bit key resolves.
    Schedule { config: LodConfig },
    /// The type column covers a different row count than the lod columns.
    Columns { rows: usize },
    /// The lod columns hold points in a bucket beyond the configuration's deepest grid.
    ///
    /// The lod ran under a different configuration.
    Bucket { bucket: u8 },
    /// A direct type names an ontology row beyond the `u32` ordinals the quad file stores.
    TypeOrdinal { row: NodeRowId, id: u64 },
    /// The tree needs more nodes than `u32` indexes address.
    Nodes,
}

impl core::fmt::Display for QuadError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Schedule { config } => write!(
                fmt,
                "the schedule needs {} + {} subdivisions where a 64-bit Morton key resolves {}",
                config.max_tile_depth,
                config.span.get(),
                Depth::MAX.get(),
            ),
            Self::Columns { rows } => write!(
                fmt,
                "the type column must hold one row per lod row ({rows})",
            ),
            Self::Bucket { bucket } => write!(
                fmt,
                "the lod columns hold points in bucket {bucket}, beyond the configuration's \
                 deepest grid",
            ),
            Self::TypeOrdinal { row, id } => write!(
                fmt,
                "row {row} names ontology row {id}, beyond the u32 ordinals the quad file stores",
            ),
            Self::Nodes => write!(fmt, "the tree needs more nodes than u32 indexes address"),
        }
    }
}

impl core::error::Error for QuadError {}

/// The quad file's regions for one generation, in writable form.
///
/// Node 0 is the root; records are in depth-first pre-order with children in Morton child order, so
/// every child index points deeper in the table. [`measurements`](Self::measurements) reads the
/// finished tree and yields the numbers that belong in the generation's metadata document.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct QuadTree {
    /// The node table in depth-first pre-order.
    pub nodes: Vec<Node>,
    /// The per-node direct-type sets.
    pub sets: TypeSets,
    /// The deepest node depth the tree reaches.
    pub depth: Depth,
}

impl QuadTree {
    /// Builds the quadtree over the finished lod columns.
    ///
    /// `types` holds each row's direct types in **row** order, exactly as the dataset streams them
    /// (ascending, deduplicated). The builder gathers them into base order through the lod's
    /// permutation.
    ///
    /// `config` must be the configuration the lod ran under. A mismatch surfaces as
    /// [`QuadError::Bucket`] when the lod's cascade ran deeper than the configuration allows, and
    /// nothing else here detects it.
    ///
    /// # Errors
    ///
    /// Returns [`QuadError::Schedule`] when the configuration exceeds the key width,
    /// [`QuadError::Columns`] when the type column disagrees with the lod columns,
    /// [`QuadError::Bucket`] when the lod holds points beyond the configuration's deepest grid,
    /// [`QuadError::TypeOrdinal`] when a direct type escapes the file's `u32` ordinals, and
    /// [`QuadError::Nodes`] when the tree escapes `u32` node indexes.
    #[tracing::instrument(name = "quad", skip_all)]
    pub(crate) fn build(
        lod: &Lod,
        types: &IdSlice<NodeRowId, SmallVec<OntologyRowId, 2>>,
        config: LodConfig,
    ) -> Result<Self, QuadError> {
        let deepest = config.deepest().ok_or(QuadError::Schedule { config })?;
        if types.len() != lod.row_of_position.len() {
            return Err(QuadError::Columns {
                rows: lod.row_of_position.len(),
            });
        }
        let lengths = lod.fenceposts.lengths();
        for bucket in deepest.get() + 1..=Depth::MAX.get() {
            if lengths[usize::from(bucket)] > 0 {
                return Err(QuadError::Bucket { bucket });
            }
        }

        // Gather the type column into base order once, so the recursion
        // touches each position's types without indirection.
        let position_types = lod
            .row_of_position
            .iter()
            .map(|&row| {
                types[row]
                    .iter()
                    .map(|id| {
                        u32::try_from(id.as_u64()).map_err(|_error| QuadError::TypeOrdinal {
                            row,
                            id: id.as_u64(),
                        })
                    })
                    .collect()
            })
            .collect::<Result<_, _>>()?;

        let mut builder = Builder {
            codes: &lod.codes,
            position_types,
            span_log2: config.span.get(),
            deepest,
            nodes: Vec::new(),
            sets: Vec::new(),
            depth: Depth::MIN,
        };

        let root = MortonCell::new(Depth::MIN, 0, 0).expect("the root cell exists at every depth");
        builder.node(root, &lod.fenceposts.segments())?;

        Ok(Self {
            nodes: builder.nodes,
            sets: TypeSets::from_sets(&builder.sets),
            depth: builder.depth,
        })
    }

    /// Measures the finished tree for the generation metadata.
    #[must_use]
    pub(crate) fn measurements(&self) -> QuadMeasurements {
        QuadMeasurements {
            nodes: self.nodes.len() as u64,
            leaves: self.nodes.iter().filter(|node| node.is_leaf()).count() as u64,
            depth: self.depth,
            type_entries: self.sets.ids().len() as u64,
        }
    }
}

impl WriteAs<crate::file::salt::artifact::Quad> for QuadTree {}

impl WriteInto for QuadTree {
    type Error = io::Error;

    /// Writes the tree as a quad file.
    ///
    /// Returns the SHA-256 of the written bytes: the identity the repository records for the
    /// published file.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    fn write_into(&self, write: impl io::Write) -> io::Result<Sha256Digest> {
        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };

        write_regions(&self.nodes, &self.sets, &mut writer)?;

        Ok(writer.accumulator.finalize())
    }
}

/// The measurements of one quadtree build.
///
/// What the manifest records so that data rather than taste drives a revision of the configuration.
/// These are build census numbers rather than evidence, and the metadata's `Evidence` section holds
/// the admission checks.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct QuadMeasurements {
    /// Nodes in the table.
    pub nodes: u64,
    /// Nodes without children.
    pub leaves: u64,
    /// The deepest node depth the tree reaches.
    pub depth: Depth,
    /// Entries in the shared type-id array.
    pub type_entries: u64,
}

/// The positions of each bucket's codes inside the cell under construction, one range per bucket.
type BucketRanges = [Range<BasePosition>; SEGMENTS];

struct Builder<'lod> {
    /// The code column in base order, segment-sorted.
    codes: &'lod IdSlice<BasePosition, MortonKey>,
    /// Each base position's direct types as `u32` ordinals.
    position_types: IdVec<BasePosition, SmallVec<u32, 2>>,
    /// The cut's span exponent `m`.
    ///
    /// A tile at zoom `z` delivers buckets at or below `z + m`.
    span_log2: u8,
    /// The deepest bucket the cascade assigned into.
    deepest: Depth,
    /// The node table under construction, depth-first pre-order.
    nodes: Vec<Node>,
    /// One direct-type set per node, aligned with the table.
    sets: Vec<Vec<u32>>,
    /// The deepest node depth reached.
    depth: Depth,
}

impl Builder<'_> {
    /// Builds the node for `cell` over the bucket `ranges` narrowed to it.
    ///
    /// Returns the node's table index.
    fn node(&mut self, cell: MortonCell, ranges: &BucketRanges) -> Result<u32, QuadError> {
        let Ok(index) = u32::try_from(self.nodes.len()) else {
            return Err(QuadError::Nodes);
        };
        if index == Node::NO_CHILD {
            return Err(QuadError::Nodes);
        }

        // Reserve the pre-order slot before the children claim theirs.
        self.nodes.push(Node::new([None; 4], 0, 0, 0));
        self.sets.push(Vec::new());
        self.depth = self.depth.max(cell.depth());

        let cut = cell.depth().get() + self.span_log2;
        let points = ranges
            .iter()
            .map(|range| range.end.as_usize() - range.start.as_usize())
            .sum::<usize>();
        let run = self.run(cell.depth(), ranges);

        let mut children = [None; 4];
        let mut set = BTreeSet::new();
        if self.exhausted(cut, ranges) {
            // This tile's cut delivers every point in the cell. The cell is a leaf, and all of its
            // points feed the type set directly.
            for range in ranges {
                self.gather(&mut set, range.clone());
            }
        } else {
            let cells = cell
                .children()
                .expect("a cell with points beyond its cut subdivides");

            for (quadrant, child_cell) in cells.into_iter().enumerate() {
                let child_ranges = self.narrow(ranges, child_cell);
                if self.exhausted(cut, &child_ranges) {
                    // This quadrant needs no node, so its points contribute their types here, at
                    // the deepest node containing them.
                    for range in &child_ranges {
                        self.gather(&mut set, range.clone());
                    }
                } else {
                    let child = self.node(child_cell, &child_ranges)?;
                    children[quadrant] = Some(child);
                    set.extend(self.sets[child as usize].iter().copied());
                }
            }
        }

        self.nodes[index as usize] = Node::new(
            children,
            u64::from(run.start.as_u32()),
            run.end.as_u32() - run.start.as_u32(),
            u32::try_from(points).expect("the lod columns index rows by u32"),
        );
        self.sets[index as usize] = set.into_iter().collect();

        Ok(index)
    }

    /// Returns the own-bucket run.
    ///
    /// Bucket `z + span_log2` for a tile at zoom `z`, buckets `0..=span_log2` whole for the root -
    /// a single contiguous range because the base order is bucket-major.
    fn run(&self, depth: Depth, ranges: &BucketRanges) -> Range<BasePosition> {
        if depth == Depth::MIN {
            let cut = usize::from(self.span_log2);
            debug_assert!(
                ranges[..cut]
                    .iter()
                    .zip(&ranges[1..=cut])
                    .all(|(previous, next)| previous.end == next.start),
                "whole segments are contiguous by fencepost construction",
            );

            ranges[0].start..ranges[cut].end
        } else {
            ranges[usize::from(depth.get() + self.span_log2)].clone()
        }
    }

    /// Returns whether `ranges` holds no point in a bucket beyond `cut`.
    ///
    /// Nothing below this tile's zoom delivers anything new.
    fn exhausted(&self, cut: u8, ranges: &BucketRanges) -> bool {
        ranges[usize::from(cut) + 1..=usize::from(self.deepest.get())]
            .iter()
            .all(Range::is_empty)
    }

    /// Narrows every bucket's range to the codes inside `cell`.
    ///
    /// By the partition-point searches of `file/morton`'s `run` query. A partition point over the
    /// range's sub-slice is an offset into the range, which the range's own start rebases into a
    /// base position.
    fn narrow(&self, ranges: &BucketRanges, cell: MortonCell) -> BucketRanges {
        core::array::from_fn(|bucket| {
            let range = &ranges[bucket];
            let slice = &self.codes[range.clone()];
            let start = range
                .start
                .plus(slice.partition_point(|&code| code < cell.min_key()));
            let end = range
                .start
                .plus(slice.partition_point(|&code| code <= cell.max_key()));
            start..end
        })
    }

    /// Feeds the types of every position in `range` into `set`.
    fn gather(&self, set: &mut BTreeSet<u32>, range: Range<BasePosition>) {
        for position in range {
            set.extend(self.position_types[position].iter().copied());
        }
    }
}
