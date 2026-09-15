//! Draw selection, movement measurement and assembly of paired evidence.
//!
//! [`measure`] derives the salt, takes the attraction-index census and reads the selected subjects
//! between aligned frames. Per-subject work runs in parallel, while collected readings retain draw
//! order for the serial aggregation.

#[cfg(test)]
mod tests;

use hashql_core::{
    heap::{ResetAllocator as _, Scratch},
    id::IdSlice,
};
use rayon::iter::{IntoParallelIterator as _, IntoParallelRefIterator as _, ParallelIterator as _};

use super::{
    census::{Draw, participants},
    evidence::{
        ControlDecile, FailureReason, MovementOutcome, PairAggregates, PairedMovementEvidence,
    },
    identity::{EncodeError, RuleIdentity},
    movement::{AnchorRowId, Movement, RANK_WINDOW},
};
use crate::{
    file::{
        attraction::{EdgeRecord, GroupRecord},
        salt::metadata::{Reproducibility, Snapshot},
    },
    identity::{EdgeRowId, NodeRowId},
    math::{FinitePointField, KdTree},
};

/// Measures the paired-movement readout of one generation.
///
/// `groups` and `edges` must satisfy the attraction-index contract and use the same row identities
/// as `zero` and `canonical`. Both frames must already share the baseline basis. The census uses
/// `zero.len()` as its row domain. The metadata supplies the salt preimage but is not checked
/// against the regions or frames.
///
/// A census refusal returns [`MovementOutcome::Failed`] with zero draw counts. A frame-length
/// refusal preserves the completed draw counts in a failed outcome. An empty pair domain returns
/// [`MovementOutcome::Vacuous`] before checking the canonical frame's length. These outcomes carry
/// no publication veto, while salt-encoding failure remains a returned error.
///
/// # Complexity
///
/// Beyond [`Draw::over`], this builds indexes for both N-row frames and the sampled endpoints. It
/// reads every sampled pair and control, then queries and sorts all Q nonparticipants' anchor
/// distances to define strata. This full candidate sweep costs O(Q) retained distances and O(Q log
/// Q) sorting work even for a small control sample. Distance ties can make individual tree queries
/// require full-domain sorting. Per-worker scratch is additional to the indexes and collected
/// readings.
///
/// # Errors
///
/// [`EncodeError`] when the salt preimage does not serialize.
pub(crate) fn measure(
    snapshot: &Snapshot,
    reproducibility: &Reproducibility,
    groups: &[GroupRecord],
    edges: &[EdgeRecord<NodeRowId, EdgeRowId>],
    zero: &FinitePointField<NodeRowId>,
    canonical: &FinitePointField<NodeRowId>,
) -> Result<PairedMovementEvidence<NodeRowId>, EncodeError> {
    let rule = RuleIdentity::INITIAL
        .recognize()
        .expect("this crate carries the initial rule identity");
    let salt = rule.derive_salt(snapshot, reproducibility)?;
    let rows = zero.len() as u64;

    let evidence =
        |draw: Option<&Draw>, outcome: MovementOutcome<NodeRowId>| PairedMovementEvidence {
            rule: rule.identity(),
            salt,
            rank_window: RANK_WINDOW.get() as u64,
            pair_candidates: draw.map_or(0, Draw::pair_candidates),
            pairs_selected: draw.map_or(0, |draw| draw.pairs().len() as u64),
            control_candidates: draw.map_or(0, Draw::control_candidates),
            controls_selected: draw.map_or(0, |draw| draw.controls().len() as u64),
            outcome,
        };

    let draw = match Draw::over(rule, salt, rows, groups, edges) {
        Ok(draw) => draw,
        Err(error) => {
            // The census completed no count before refusing the index.
            return Ok(evidence(
                None,
                MovementOutcome::Failed {
                    reason: FailureReason::from(error),
                },
            ));
        }
    };

    if draw.pair_candidates() == 0 {
        return Ok(evidence(Some(&draw), MovementOutcome::Vacuous));
    }

    let movement = match Movement::new(zero, canonical, RANK_WINDOW) {
        Ok(movement) => movement,
        Err(error) => {
            return Ok(evidence(
                Some(&draw),
                MovementOutcome::Failed {
                    reason: FailureReason::from(error),
                },
            ));
        }
    };

    // Indexed parallel collection preserves the draw's order. Each reading depends only on its
    // subject and the shared frames and trees. Therefore the serial aggregate receives the same
    // ordered readings independently of the worker schedule. Arena reset reclaims each worker's
    // result buffers between readings.
    let pairs: Vec<_> = draw
        .pairs()
        .par_iter()
        .map_init(Scratch::new, |scratch, pair| {
            let reading = movement.pair(pair.source, pair.target, scratch);
            scratch.reset();
            reading
        })
        .collect();

    // the nonempty draw supplies at least one in-domain endpoint. Gathering those zero-step
    // positions preserves finiteness for the anchor index.
    let anchor_rows = draw.anchors();
    let anchor_frame = zero.gather(IdSlice::<AnchorRowId, _>::from_raw(&anchor_rows));
    let anchor_tree = KdTree::build(&anchor_frame);

    let controls: Vec<_> = draw
        .controls()
        .par_iter()
        .map_init(Scratch::new, |scratch, &row| {
            let reading = movement.control(row, &anchor_tree, scratch);
            scratch.reset();
            reading
        })
        .collect();

    // define boundaries from every control candidate's proximity to the sampled anchors. Sorting
    // later makes the parallel collection order irrelevant.
    let participants = participants(rows, edges);
    let mut candidates: Vec<_> = (0..rows)
        .into_par_iter()
        .map(NodeRowId::new)
        .filter(|&row| !participants.contains(row))
        .map_init(Scratch::new, |scratch, row| {
            let reading = movement.anchor_distance(row, &anchor_tree, scratch);
            scratch.reset();
            reading
        })
        .collect();

    debug_assert_eq!(
        candidates.len() as u64,
        draw.control_candidates(),
        "the census and the sweep share one participant definition"
    );

    Ok(evidence(
        Some(&draw),
        MovementOutcome::Measured {
            pairs: PairAggregates::over(&pairs),
            deciles: ControlDecile::over(&mut candidates, &controls),
        },
    ))
}
