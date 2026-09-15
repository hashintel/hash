//! The quadtree build, which cuts the base delivery order into tiles.
//!
//! [`QuadTree::build`] derives nodes and direct-type sets from finished [`Lod`] columns. A node
//! records the run first delivered at its cut, the population of its whole cell, and every direct
//! type in that cell. Population and type sets include points delivered at shallower cuts.
//!
//! Let m be [`LodConfig::span`], z a tile's depth, and b a point's bucket. The root always exists.
//! A deeper cell gets a node exactly when it contains a point with b ≥ z + m, beyond its parent's
//! cut. A node may have an empty own-bucket run while retaining descendants that deliver later
//! buckets.
//!
//! # Partition and termination
//!
//! Bucket-major order makes buckets 0 through m one contiguous root run. Every point with b > m
//! belongs to exactly one cell at depth b − m, and that point requires its cell's node to exist.
//! That node's run selects bucket b. Therefore the node runs partition the base order and deliver
//! every point exactly once.
//!
//! The cascade assigns a point no later than the first grid where it stands alone. Such a point
//! needs no descendant node once the tile cut reaches its bucket. More generally, every bucket is
//! at or below [`LodConfig::deepest`]. At the maximum tile depth, no point remains beyond the cut,
//! and recursion terminates without a separate depth cap.
//!
//! Each Morton cell is one inclusive key interval. Within a sorted bucket, the first code at or
//! above the cell's minimum and the first code beyond its maximum delimit that cell's run. Both the
//! builder and [`MortonFile::run`](crate::file::morton::read::MortonFile::run) use these boundaries
//! over the same codes. Their run extents agree.

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

/// A schedule, column, or encoding limit that prevents quadtree construction.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum QuadError {
    /// The configuration names a schedule no 64-bit key resolves.
    Schedule { config: LodConfig },
    /// The type column covers a different row count than the lod columns.
    Columns { rows: usize },
    /// The lod columns hold points in a bucket beyond the configuration's deepest grid.
    Bucket { bucket: u8 },
    /// A direct type names an ontology row beyond the `u32` ordinals the quad file stores.
    TypeOrdinal { row: NodeRowId, id: u64 },
    /// A node index would reach or exceed the absent-child sentinel.
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

/// A quadtree's node table and per-node direct-type sets.
///
/// [`Self::build`] places the root at index zero and records nodes in depth-first pre-order, with
/// children in Morton order. Every child index points farther into the table.
///
/// # Memory usage
///
/// Each node retains its cell's complete direct-type set. A type present along a depth-h branch can
/// repeat in all h + 1 node sets.
///
/// # Panics
///
/// Writing panics if the node count is at least [`Node::NO_CHILD`], if `sets` covers a different
/// node count, or if a child index lies outside the table or does not follow its parent.
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
    /// `types` holds each row's direct types in row order. Each node receives the sorted,
    /// deduplicated union for its whole cell. `lod` must retain the permutation, fencepost, and
    /// sorted-code invariants of [`Lod::build`].
    ///
    /// `config` must be the configuration the lod ran under. A bucket beyond the supplied deepest
    /// grid produces [`QuadError::Bucket`]. Other valid configuration mismatches can change the
    /// tree without an error.
    ///
    /// # Errors
    ///
    /// Returns a [`QuadError`] for an invalid schedule, incompatible columns, or a row or node
    /// index beyond its encoding.
    ///
    /// # Panics
    ///
    /// Panics if the lod's row permutation or fenceposts address elements outside their
    /// corresponding columns.
    #[tracing::instrument(skip_all)]
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

        // gathering once removes row indirection from the recursive type unions
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

/// Per-bucket ranges of codes inside the cell under construction.
type BucketRanges = [Range<BasePosition>; SEGMENTS];

/// An in-progress quad tree in depth-first pre-order, with one type set per node.
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
    /// Returns the node's table index. `ranges` must delimit this cell within each sorted bucket,
    /// and the cell's cut must not exceed `self.deepest`.
    ///
    /// # Errors
    ///
    /// Returns [`QuadError::Nodes`] if the next node index cannot fit below [`Node::NO_CHILD`].
    ///
    /// # Panics
    ///
    /// Panics for ranges outside the code or type columns, a population exceeding `u32`, or a cell
    /// whose cut exceeds `self.deepest`.
    fn node(&mut self, cell: MortonCell, ranges: &BucketRanges) -> Result<u32, QuadError> {
        let Ok(index) = u32::try_from(self.nodes.len()) else {
            return Err(QuadError::Nodes);
        };
        if index == Node::NO_CHILD {
            return Err(QuadError::Nodes);
        }

        // reserve the parent's pre-order slot before appending its descendants
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
            // the leaf has no child sets to union: gather every point in its cell
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
                    // this quadrant's points contribute directly at the deepest node containing
                    // them
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
    /// Selects bucket `z + span_log2` at depth `z`, or all buckets `0..=span_log2` for the root.
    /// Bucket-major order makes the root's whole segments contiguous.
    ///
    /// # Panics
    ///
    /// Panics when `depth + self.span_log2` exceeds [`Depth::MAX`].
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
    /// `cut` must be at or below `self.deepest`.
    ///
    /// # Panics
    ///
    /// Panics when `cut` exceeds `self.deepest`.
    fn exhausted(&self, cut: u8, ranges: &BucketRanges) -> bool {
        ranges[usize::from(cut) + 1..=usize::from(self.deepest.get())]
            .iter()
            .all(Range::is_empty)
    }

    /// Narrows every bucket's range to the codes inside `cell`.
    ///
    /// Each range must delimit sorted codes. The result uses base positions rather than offsets
    /// within a range.
    ///
    /// # Panics
    ///
    /// Panics when a range lies outside `self.codes`.
    fn narrow(&self, ranges: &BucketRanges, cell: MortonCell) -> BucketRanges {
        core::array::from_fn(|bucket| {
            let range = &ranges[bucket];
            let slice = &self.codes[range.clone()];
            // partition points are relative to `slice`: add the enclosing range's base position
            let start = range
                .start
                .plus(slice.partition_point(|&code| code < cell.min_key()));
            let end = range
                .start
                .plus(slice.partition_point(|&code| code <= cell.max_key()));
            start..end
        })
    }

    /// Adds the direct types of every position in `range` to `set`.
    ///
    /// # Panics
    ///
    /// Panics when `range` addresses a position outside `self.position_types`.
    fn gather(&self, set: &mut BTreeSet<u32>, range: Range<BasePosition>) {
        for position in range {
            set.extend(self.position_types[position].iter().copied());
        }
    }
}
