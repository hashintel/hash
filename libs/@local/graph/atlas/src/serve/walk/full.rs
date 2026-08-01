//! The full-visibility deliveries.
//!
//! With every row visible, a tile's delivered set is contiguous in base order: the cascade sort
//! placed each bucket's points in one code-column run per cell, so delivery is range assembly over
//! the fenceposts and the quad node's recorded run - no per-point work at all.

use core::ops::Range;

use hashql_core::id::Id as _;

use super::Walk;
use crate::{file::quad::Node, identity::BasePosition, morton::MortonCell};

/// One full-visibility delivery.
///
/// The wire head's run vocabulary, with the first delivered bucket, the per-bucket point counts,
/// and the delivered base-position ranges in delivery order.
#[derive(Debug)]
pub(in crate::serve) struct RangeDelivery {
    /// The first bucket the response's runs describe.
    pub first_bucket: u8,
    /// Per-bucket point counts, bucket-major from `first_bucket`.
    pub runs: Vec<u32>,
    /// The delivered base-position ranges, in delivery order.
    pub ranges: Vec<Range<BasePosition>>,
}

impl Walk<'_> {
    /// Assembles the zoom-0 delta delivery.
    ///
    /// Buckets `0..=cut` as fencepost differences, one contiguous base-order range.
    #[expect(
        clippy::single_range_in_vec_init,
        reason = "an array of one range is what a delta delivery IS"
    )]
    pub(in crate::serve) fn root_delta(&self) -> RangeDelivery {
        let cut = self.grid.cut(0);
        let runs = self
            .grid
            .cut_buckets(0)
            .map(|depth| self.bucket_length(depth))
            .collect();
        let end = self.segment_end(cut);

        RangeDelivery {
            first_bucket: 0,
            runs,
            ranges: vec![BasePosition::MIN..end],
        }
    }

    /// Assembles a non-root delta delivery.
    ///
    /// The node's own-bucket run verbatim, one zero-length run when the cell has no node.
    pub(in crate::serve) fn delta(&self, z: u8, node: Option<&Node>) -> RangeDelivery {
        let cut = self.grid.cut(z);
        node.map_or_else(
            || RangeDelivery {
                first_bucket: cut.get(),
                runs: vec![0],
                ranges: Vec::new(),
            },
            |node| {
                // The node run is file vocabulary; open validated the point count against the
                // u32 domain, so the positions are in range.
                let run = node.run();
                let run = BasePosition::from_u64(run.start)..BasePosition::from_u64(run.end);
                RangeDelivery {
                    first_bucket: cut.get(),
                    runs: vec![run.end.as_u32() - run.start.as_u32()],
                    ranges: vec![run],
                }
            },
        )
    }

    /// Assembles a total delivery.
    ///
    /// One code-column run per bucket of the cumulative schedule, bucket-major.
    pub(in crate::serve) fn total(&self, z: u8, cell: MortonCell) -> RangeDelivery {
        let capacity = self.grid.cut(z).get() as usize + 1;
        let mut runs = Vec::with_capacity(capacity);
        let mut ranges = Vec::with_capacity(capacity);

        for depth in self.grid.cut_buckets(z) {
            let run = self.run(depth, cell);
            runs.push(run.end.as_u32() - run.start.as_u32());
            ranges.push(run);
        }

        RangeDelivery {
            first_bucket: 0,
            runs,
            ranges,
        }
    }
}

/// Reads the occupied-child bitmask off a node record.
///
/// Bit `i` set when Morton child `i` holds a point below the node's cut, which by the
/// node-existence rule is exactly when the child node exists.
pub(in crate::serve) fn occupied_children(node: &Node) -> u8 {
    (0..4).fold(0_u8, |bits, quadrant| {
        bits | (u8::from(node.child(quadrant).is_some()) << quadrant)
    })
}
