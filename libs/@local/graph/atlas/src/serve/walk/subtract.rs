//! Withdrawal subtraction over one tile's delivered set.
//!
//! Admission subtraction edits the assembled document, because the corpus fast paths never
//! consult the proof and a full-visibility view builds no masks. A scoped entry also folds its
//! own snapshot's withdrawals into its masks at resolution, so this walk is the corpus path's
//! whole withdrawal authority and every path's answer for withdrawals newer than the entry. The
//! delivered positions partition into the head's `runs` sequentially in delivery order, so one
//! walk with a run cursor drops each withdrawn position and decrements the run that owns it. A
//! range that straddles a withdrawal splits around it. That construction preserves
//! `sum(runs) == delivered`, and the encoder's assertion keeps its force.
//!
//! A run subtracted to zero keeps its positional slot, which is the wire's own law for
//! zero-length entries, so a tile whose delivered set subtracts to nothing serves the existing
//! empty-tile shape. An input range subtracted to nothing leaves the range list instead, which
//! moves no wire byte: the columns gather positions and the runs carry the counts, so an empty
//! range was already invisible to both.
//!
//! A spliced delivery subtracts in its merged order. Withdrawn base rows split their ranges and
//! withdrawn arrivals leave the splice list, and every surviving splice takes its index in the
//! subtracted order, so the shape's own law - the delivery index counts rows of both kinds -
//! survives the edit.

use hashql_core::id::Id as _;

use super::DeliveredPoints;
use crate::{
    identity::BasePosition,
    serve::schedule::{Splice, ViewRow},
};

/// Drops every row `withdraws` names from `delivered`, decrementing the owning run.
///
/// Caller requirement: `runs` partitions `delivered` sequentially in delivery order, the producer
/// contract the encoder asserts. A shorter partition panics here on the run cursor, which is a
/// producer defect rather than request data.
pub(crate) fn subtract_withdrawn(
    delivered: &mut DeliveredPoints,
    runs: &mut [u32],
    withdraws: impl Fn(ViewRow) -> bool,
) {
    // The cursor walks the partition as produced, while the decrements edit `runs` in place.
    let partition = runs.to_vec();
    let mut cursor = RunCursor {
        runs: &partition,
        index: 0,
        consumed: 0,
    };

    match delivered {
        DeliveredPoints::Positions(list) => list.retain(|&row| {
            let run = cursor.advance();
            if withdraws(row) {
                runs[run] -= 1;
                false
            } else {
                true
            }
        }),
        DeliveredPoints::Ranges(ranges) => {
            let mut split = Vec::with_capacity(ranges.len());
            for range in &*ranges {
                let mut keep = range.start;

                for position in range.clone() {
                    let run = cursor.advance();
                    if withdraws(ViewRow::Base(position)) {
                        if keep < position {
                            split.push(keep..position);
                        }

                        keep = BasePosition::from_u32(position.as_u32() + 1);
                        runs[run] -= 1;
                    }
                }

                if keep < range.end {
                    split.push(keep..range.end);
                }
            }
            *ranges = split;
        }
        DeliveredPoints::Spliced { ranges, splices } => {
            let mut split = Vec::with_capacity(ranges.len());
            let mut kept_splices = Vec::with_capacity(splices.len());
            let mut pending = splices.iter().peekable();

            // The pre-subtraction and post-subtraction delivery indices, counting rows of both
            // kinds.
            let mut output = 0_u32;
            let mut kept = 0_u32;

            for range in &*ranges {
                let mut keep = range.start;
                for position in range.clone() {
                    while let Some(splice) = pending.next_if(|splice| splice.at == output) {
                        let run = cursor.advance();
                        if withdraws(ViewRow::Arrival(splice.arrival)) {
                            runs[run] -= 1;
                        } else {
                            kept_splices.push(Splice {
                                at: kept,
                                arrival: splice.arrival,
                            });
                            kept += 1;
                        }

                        output += 1;
                    }

                    let run = cursor.advance();
                    if withdraws(ViewRow::Base(position)) {
                        if keep < position {
                            split.push(keep..position);
                        }
                        keep = BasePosition::from_u32(position.as_u32() + 1);
                        runs[run] -= 1;
                    } else {
                        kept += 1;
                    }
                    output += 1;
                }
                if keep < range.end {
                    split.push(keep..range.end);
                }
            }

            // The splices past the last base row are the delivery's tail.
            for splice in pending {
                debug_assert_eq!(
                    splice.at, output,
                    "a trailing splice sits at the delivery's own tail index",
                );
                let run = cursor.advance();
                if withdraws(ViewRow::Arrival(splice.arrival)) {
                    runs[run] -= 1;
                } else {
                    kept_splices.push(Splice {
                        at: kept,
                        arrival: splice.arrival,
                    });
                    kept += 1;
                }
                output += 1;
            }

            *ranges = split;
            *splices = kept_splices;
        }
    }
}

/// A cursor over the delivered set's run partition, in delivery order.
///
/// Each call to [`RunCursor::advance`] consumes one position and returns the index of the run
/// that owns it, skipping zero-length runs, which keep their positional slots without owning any
/// position.
struct RunCursor<'partition> {
    /// The run partition as produced, before any decrement.
    runs: &'partition [u32],
    /// The run owning the next position.
    index: usize,
    /// Positions already consumed from the current run.
    consumed: u32,
}

impl RunCursor<'_> {
    /// Consumes one position, returning its owning run's index.
    const fn advance(&mut self) -> usize {
        while self.consumed == self.runs[self.index] {
            self.index += 1;
            self.consumed = 0;
        }

        self.consumed += 1;
        self.index
    }
}

#[cfg(test)]
mod tests {
    #![expect(
        clippy::single_range_in_vec_init,
        reason = "an array of one range is what a delta delivery IS"
    )]

    use hashql_core::id::Id as _;

    use super::{DeliveredPoints, subtract_withdrawn};
    use crate::{
        identity::BasePosition,
        serve::schedule::{ArrivalIndex, Splice, ViewRow},
    };

    fn positions(list: &[u32]) -> DeliveredPoints {
        DeliveredPoints::Positions(
            list.iter()
                .map(|&raw| ViewRow::Base(BasePosition::from_u32(raw)))
                .collect(),
        )
    }

    fn ranges(list: &[core::ops::Range<u32>]) -> DeliveredPoints {
        DeliveredPoints::Ranges(
            list.iter()
                .map(|range| BasePosition::from_u32(range.start)..BasePosition::from_u32(range.end))
                .collect(),
        )
    }

    /// The row's raw index in its own domain, for the all-base fixtures here.
    fn base_of(row: ViewRow) -> u32 {
        match row {
            ViewRow::Base(position) => position.as_u32(),
            ViewRow::Arrival(index) => index.as_u32(),
        }
    }

    fn collected(delivered: &DeliveredPoints) -> Vec<u32> {
        delivered.iter().map(base_of).collect()
    }

    /// The invariant every case below re-checks: the runs re-sum to the delivered count.
    #[track_caller]
    fn assert_partitioned(delivered: &DeliveredPoints, runs: &[u32]) {
        assert_eq!(
            delivered.count() as u64,
            runs.iter().map(|&count| u64::from(count)).sum::<u64>(),
            "sum(runs) == delivered survives subtraction",
        );
    }

    #[test]
    fn gathered_positions_drop_and_their_runs_decrement() {
        // The scoped delivery [4, 5] | [6, 20] | [21], three runs.
        let mut delivered = positions(&[4, 5, 6, 20, 21]);
        let mut runs = vec![2, 2, 1];

        subtract_withdrawn(&mut delivered, &mut runs, |position| {
            base_of(position) == 5 || base_of(position) == 21
        });

        assert_eq!(collected(&delivered), [4, 6, 20]);
        assert_eq!(runs, [1, 2, 0], "each drop debits the owning run");
        assert_partitioned(&delivered, &runs);
    }

    #[test]
    fn a_range_straddling_a_withdrawal_splits() {
        // A single-range, single-run delivery, the delta shape.
        let mut delivered = ranges(&[10..15]);
        let mut runs = vec![5];

        subtract_withdrawn(&mut delivered, &mut runs, |position| {
            base_of(position) == 12
        });

        assert_eq!(collected(&delivered), [10, 11, 13, 14]);
        assert_eq!(runs, [4]);
        assert_partitioned(&delivered, &runs);
    }

    #[test]
    fn adjacent_withdrawals_collapse_without_empty_slivers() {
        let mut delivered = ranges(&[0..6]);
        let mut runs = vec![6];

        subtract_withdrawn(&mut delivered, &mut runs, |position| {
            (2..=3).contains(&base_of(position))
        });

        assert_eq!(collected(&delivered), [0, 1, 4, 5]);
        assert_eq!(runs, [4]);
        assert_partitioned(&delivered, &runs);
    }

    #[test]
    fn range_edges_withdraw_without_slivers() {
        let mut delivered = ranges(&[3..8]);
        let mut runs = vec![5];

        subtract_withdrawn(&mut delivered, &mut runs, |position| {
            base_of(position) == 3 || base_of(position) == 7
        });

        assert_eq!(collected(&delivered), [4, 5, 6]);
        assert_eq!(runs, [3]);
        assert_partitioned(&delivered, &runs);
    }

    #[test]
    fn bucket_major_ranges_debit_their_own_buckets() {
        // One range per bucket, as a total delivers, with zero-length entries keeping slots.
        let mut delivered = ranges(&[0..1, 4..4, 4..7, 7..9]);
        let mut runs = vec![1, 0, 3, 2];

        subtract_withdrawn(&mut delivered, &mut runs, |position| {
            base_of(position) == 0 || base_of(position) == 8
        });

        assert_eq!(collected(&delivered), [4, 5, 6, 7]);
        assert_eq!(runs, [0, 0, 3, 1], "zero-length runs keep their slots");
        assert_partitioned(&delivered, &runs);
    }

    #[test]
    fn an_all_withdrawn_tile_subtracts_to_the_empty_shape() {
        let mut delivered = ranges(&[2..5]);
        let mut runs = vec![3];

        subtract_withdrawn(&mut delivered, &mut runs, |_| true);

        assert_eq!(collected(&delivered), [] as [u32; 0]);
        assert_eq!(runs, [0]);
        assert_partitioned(&delivered, &runs);
    }

    #[test]
    fn nothing_withdrawn_leaves_the_set_intact() {
        let mut delivered = positions(&[1, 2, 3]);
        let mut runs = vec![1, 2];

        subtract_withdrawn(&mut delivered, &mut runs, |_| false);

        assert_eq!(collected(&delivered), [1, 2, 3]);
        assert_eq!(runs, [1, 2]);
        assert_partitioned(&delivered, &runs);
    }

    fn spliced(list: &[core::ops::Range<u32>], at: &[(u32, u32)]) -> DeliveredPoints {
        DeliveredPoints::Spliced {
            ranges: list
                .iter()
                .map(|range| BasePosition::from_u32(range.start)..BasePosition::from_u32(range.end))
                .collect(),
            splices: at
                .iter()
                .map(|&(at, arrival)| Splice {
                    at,
                    arrival: ArrivalIndex::from_u32(arrival),
                })
                .collect(),
        }
    }

    /// Reads a spliced set's surviving splices.
    fn splices_of(delivered: &DeliveredPoints) -> Vec<(u32, u32)> {
        match delivered {
            DeliveredPoints::Spliced { splices, .. } => splices
                .iter()
                .map(|splice| (splice.at, splice.arrival.as_u32()))
                .collect(),
            DeliveredPoints::Ranges(_) | DeliveredPoints::Positions(_) => {
                panic!("the fixture holds the spliced shape")
            }
        }
    }

    #[test]
    fn a_withdrawn_base_row_shifts_the_splices_behind_it() {
        // Merged order 10, A7, 11, 12: one run of four, arrival 7 at delivery index 1.
        let mut delivered = spliced(&[10..13], &[(1, 7)]);
        let mut runs = vec![4];

        subtract_withdrawn(
            &mut delivered,
            &mut runs,
            |row| matches!(row, ViewRow::Base(position) if position.as_u32() == 10),
        );

        // Withdrawing base 10 leaves A7, 11, 12 with the splice shifted to index 0.
        assert_eq!(collected(&delivered), [7, 11, 12]);
        assert_eq!(runs, [3]);
        assert_eq!(splices_of(&delivered), [(0, 7)]);
        assert_partitioned(&delivered, &runs);
    }

    #[test]
    fn a_withdrawn_arrival_leaves_the_splice_list_and_debits_its_run() {
        // Merged order 0, 1 | A3, 5: the arrival opens the second run.
        let mut delivered = spliced(&[0..2, 5..6], &[(2, 3)]);
        let mut runs = vec![2, 2];

        subtract_withdrawn(&mut delivered, &mut runs, |row| {
            matches!(row, ViewRow::Arrival(_))
        });

        assert_eq!(collected(&delivered), [0, 1, 5]);
        assert_eq!(runs, [2, 1], "the arrival debits the run that owned it");
        assert_eq!(splices_of(&delivered), [] as [(u32, u32); 0]);
        assert_partitioned(&delivered, &runs);
    }

    #[test]
    fn adjacent_base_and_arrival_withdrawals_shift_later_splices() {
        // Merged order 10, A0, 11, 12, A1, 13: splices at delivery indices 1 and 4.
        let mut delivered = spliced(&[10..14], &[(1, 0), (4, 1)]);
        let mut runs = vec![6];

        subtract_withdrawn(&mut delivered, &mut runs, |row| match row {
            ViewRow::Base(position) => position.as_u32() == 11,
            ViewRow::Arrival(index) => index.as_u32() == 0,
        });

        // Withdrawing base 11 and arrival 0 leaves 10, 12, A1, 13: A1 shifts from 4 to 2.
        assert_eq!(collected(&delivered), [10, 12, 1, 13]);
        assert_eq!(runs, [4]);
        assert_eq!(splices_of(&delivered), [(2, 1)]);
        assert_partitioned(&delivered, &runs);
    }

    #[test]
    fn a_trailing_splice_survives_the_last_base_row_withdrawal() {
        // Merged order 0, A2: the arrival sits past the last base row.
        let mut delivered = spliced(&[0..1], &[(1, 2)]);
        let mut runs = vec![2];

        subtract_withdrawn(&mut delivered, &mut runs, |row| {
            matches!(row, ViewRow::Base(_))
        });

        assert_eq!(collected(&delivered), [2]);
        assert_eq!(runs, [1]);
        assert_eq!(splices_of(&delivered), [(0, 2)]);
        assert_partitioned(&delivered, &runs);
    }

    #[test]
    fn an_all_withdrawn_spliced_tile_subtracts_to_the_empty_shape() {
        // Merged order A5, 2, 3: the arrival opens the delivery.
        let mut delivered = spliced(&[2..4], &[(0, 5)]);
        let mut runs = vec![3];

        subtract_withdrawn(&mut delivered, &mut runs, |_| true);

        assert_eq!(collected(&delivered), [] as [u32; 0]);
        assert_eq!(runs, [0]);
        assert_eq!(splices_of(&delivered), [] as [(u32, u32); 0]);
        assert_partitioned(&delivered, &runs);
    }
}
