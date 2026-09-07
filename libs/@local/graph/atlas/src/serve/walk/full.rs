//! The full-visibility deliveries.
//!
//! With every row visible, a tile's delivered set is contiguous in base order: the cascade sort
//! placed each bucket's points in one code-column run per cell, so delivery is range assembly over
//! the fenceposts and the quad node's recorded run - no per-point work at all. A view holding
//! admitted arrivals splices them among the ranges afterward, paying per arrival rather than per
//! delivered row.

use core::ops::Range;

use hashql_core::id::Id as _;

use super::Walk;
use crate::{
    file::quad::Node,
    identity::BasePosition,
    morton::{Depth, MortonCell},
    serve::schedule::{ArrivalOverlay, Splice},
};

/// One full-visibility delivery.
///
/// The wire head's run vocabulary, with the first delivered bucket, the per-bucket point counts,
/// and the delivered base-position ranges in delivery order.
#[derive(Debug)]
pub(crate) struct RangeDelivery {
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
    pub(crate) fn root_delta(&self) -> RangeDelivery {
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
    pub(crate) fn delta(&self, z: u8, node: Option<&Node>) -> RangeDelivery {
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
    pub(crate) fn total(&self, z: u8, cell: MortonCell) -> RangeDelivery {
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

    /// Splices the view's arrival overlay into a full-visibility delivery.
    ///
    /// Each delivered bucket takes the overlay's arrivals of that bucket, clamped into the
    /// grid's catch-all. An arrival splices after the fitted rows whose keys are at most its
    /// own, because every fitted row outranks every arrival. The bucket's run gains its arrival
    /// count, and each splice records the arrival's index in the final merged order. The
    /// delivered ranges stay untouched, so a delivery whose cells hold no arrival returns no
    /// splice and moves no byte.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "a delivery walks at most the 33 buckets of the key width"
    )]
    pub(crate) fn splice_arrivals(
        &self,
        delivery: &mut RangeDelivery,
        overlay: &ArrivalOverlay,
        cell: MortonCell,
    ) -> Vec<Splice> {
        let deepest = self.grid.deepest();
        let codes = self.morton.codes();
        let mut splices = Vec::new();
        let mut segments = SegmentCursor {
            ranges: delivery.ranges.iter(),
            current: BasePosition::MIN..BasePosition::MIN,
        };

        // Fitted rows delivered in the buckets already walked.
        let mut delivered = 0_u32;

        for (index, run) in delivery.runs.iter_mut().enumerate() {
            let bucket = Depth::new(delivery.first_bucket + index as u8)
                .expect("the delivered buckets lie within the grid's schedule");
            let fitted = *run;
            let segment = segments.take(fitted);

            let arrivals = overlay.run(bucket, cell, deepest);
            *run += u32::try_from(arrivals.len()).expect("run lengths lie within the u32 universe");
            for (key, arrival) in arrivals {
                let before =
                    codes[segment.clone()].partition_point(|code| code.get() <= key.to_bits());
                let at = delivered
                    + u32::try_from(before + splices.len())
                        .expect("delivery indices lie within the u32 universe");

                splices.push(Splice { at, arrival });
            }

            delivered += fitted;
        }

        splices
    }
}

/// A cursor splitting a delivery's ranges into its runs' position segments.
///
/// Each run of a full-visibility delivery covers one contiguous position segment by the cascade
/// sort's construction, so the cursor hands runs their segments in delivery order. A zero-length
/// run takes an empty segment.
struct SegmentCursor<'delivery> {
    /// The ranges not yet entered.
    ranges: core::slice::Iter<'delivery, Range<BasePosition>>,
    /// The positions remaining in the entered range.
    current: Range<BasePosition>,
}

impl SegmentCursor<'_> {
    /// Takes the next `count` positions as one segment.
    fn take(&mut self, count: u32) -> Range<BasePosition> {
        while self.current.is_empty() {
            match self.ranges.next() {
                Some(range) => self.current = range.clone(),
                None => break,
            }
        }

        let start = self.current.start;
        let end = BasePosition::from_u32(start.as_u32() + count);
        debug_assert!(
            count == 0 || end <= self.current.end,
            "a run never straddles the delivery's ranges",
        );
        self.current = end..self.current.end;

        start..end
    }
}

/// Reads the occupied-child bitmask off a node record.
///
/// Bit `i` set when Morton child `i` holds a point below the node's cut, which by the
/// node-existence rule is exactly when the child node exists.
pub(crate) fn occupied_children(node: &Node) -> u8 {
    (0..4).fold(0_u8, |bits, quadrant| {
        bits | (u8::from(node.child(quadrant).is_some()) << quadrant)
    })
}
