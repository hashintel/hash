//! The deployed publish path a replay drives, and the projection pass over it.

use super::report::{OutcomeCounts, PlacementOutcome};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    math::{AlignedVecN, Vec2},
    progress::{Batch, Progress},
};

/// Rows handed to one [`PublishPath::project`] call.
///
/// The bound keeps each call's staging copy small and gives the progress observation its cadence;
/// the path itself batches however it likes.
const PROJECTION_BATCH_ROWS: usize = 256;

/// One arrival's projection outcome through the deployed publish path.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum ArrivalPlacement {
    /// The projected coordinate lies inside the fitted frame, normalized onto the wire.
    Placed {
        /// The projected coordinate in the wire frame.
        wire: Vec2,
    },
    /// The projected coordinate lies outside the fitted frame.
    ///
    /// Serving would hold the arrival unplaced until a refit.
    OutOfFrame {
        /// The aligned coordinate in world units.
        world: Vec2,
    },
}

/// One projection batch failed on a non-finite coordinate.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct NonFinitePlacement {
    /// The failing row's position in the batch the caller handed over.
    pub row: usize,
}

/// The deployed publish path one replay drives.
///
/// In production the implementor wraps the serving placer bound to `G0`, whose construction
/// certifies the reopened checkpoint against the generation's own published coordinates. The
/// trait mirrors that placer's projection contract; `&mut self` additionally admits stateful
/// implementations.
pub(crate) trait PublishPath {
    /// Projects one batch of arrival representations through the publish path.
    ///
    /// Each outcome is its row's wire coordinate or out-of-frame world coordinate, one per row in
    /// the batch's own order.
    ///
    /// # Errors
    ///
    /// Returns [`NonFinitePlacement`] naming the first row whose projection produced a non-finite
    /// coordinate. Rows after it were not projected, and the caller retries them.
    fn project(
        &mut self,
        embeddings: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
    ) -> Result<impl IntoIterator<Item = ArrivalPlacement>, NonFinitePlacement>;

    /// Projects every distinct sampled row, retrying around non-finite rows.
    fn project_queries<P: Progress>(
        &mut self,
        embeddings: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
        progress: &P,
    ) -> Vec<ProjectedOutcome>
    where
        Self: Sized,
    {
        let total = embeddings.len();
        let mut outcomes = Vec::with_capacity(total);

        let mut base = 0;
        while base < total {
            let bound = (base + PROJECTION_BATCH_ROWS).min(total);
            self.project_range(&embeddings[base..bound], &mut outcomes);
            progress.replay_projection(Batch { done: bound, total });
            base = bound;
        }

        outcomes
    }

    /// Projects one row range, splitting around each non-finite row.
    ///
    /// A failing call reports its first non-finite row and drops the outcomes of the rows before
    /// it, so those rows re-project in a narrower call. The path may be stateful, so no call's
    /// outcome is assumed from another's.
    ///
    /// # Panics
    ///
    /// This panics when the path's outcome count differs from the batch handed over, and when a
    /// named non-finite row lies outside the batch. Both are contract violations of the path.
    fn project_range(
        &mut self,
        rows: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
        outcomes: &mut Vec<ProjectedOutcome>,
    ) where
        Self: Sized,
    {
        if rows.is_empty() {
            return;
        }

        // The failing row leaves the match so the call's borrow ends before the retries
        // re-borrow.
        let row = match self.project(rows) {
            Ok(batch) => {
                let before = outcomes.len();
                outcomes.extend(batch.into_iter().map(|placement| match placement {
                    ArrivalPlacement::Placed { wire } => ProjectedOutcome::Placed(wire),
                    ArrivalPlacement::OutOfFrame { .. } => ProjectedOutcome::OutOfFrame,
                }));
                assert_eq!(
                    outcomes.len() - before,
                    rows.len(),
                    "the publish path must produce one outcome per row",
                );
                return;
            }
            Err(NonFinitePlacement { row }) => row,
        };

        assert!(
            row < rows.len(),
            "the publish path must name a non-finite row inside the batch",
        );
        self.project_range(&rows[..row], outcomes);
        outcomes.push(ProjectedOutcome::NonFinite);
        self.project_range(&rows[row + 1..], outcomes);
    }
}

/// One row's projection outcome, held with its wire coordinate where one exists.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum ProjectedOutcome {
    Placed(Vec2),
    OutOfFrame,
    NonFinite,
}

impl ProjectedOutcome {
    /// The outcome as the report records it.
    pub(super) const fn kind(self) -> PlacementOutcome {
        match self {
            Self::Placed(_) => PlacementOutcome::Placed,
            Self::OutOfFrame => PlacementOutcome::OutOfFrame,
            Self::NonFinite => PlacementOutcome::NonFinite,
        }
    }
}

impl FromIterator<ProjectedOutcome> for OutcomeCounts {
    /// Counts one estimand's projection outcomes.
    fn from_iter<I: IntoIterator<Item = ProjectedOutcome>>(iter: I) -> Self {
        let mut counts = Self {
            placed: 0,
            out_of_frame: 0,
            non_finite: 0,
        };
        for outcome in iter {
            match outcome {
                ProjectedOutcome::Placed(_) => counts.placed += 1,
                ProjectedOutcome::OutOfFrame => counts.out_of_frame += 1,
                ProjectedOutcome::NonFinite => counts.non_finite += 1,
            }
        }

        counts
    }
}
