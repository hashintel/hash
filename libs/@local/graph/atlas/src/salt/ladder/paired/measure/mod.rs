//! The whole readout of one generation, from salt to evidence body.
//!
//! [`measure`] is the C2 evidence writer's core. It derives the draw salt and takes the census
//! over the attraction index's regions, then reads every drawn subject between the aligned
//! step frames and assembles the persisted evidence body. It is a pure function of its inputs, so
//! the acceptance fixtures drive the exact production path over constructed index regions and
//! frames, injected failures included, while the fit's writer wraps it around the staged
//! artifacts.

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
/// `groups` and `edges` are the attraction index's regions in file order, and `zero` and
/// `canonical` are the ladder's aligned step frames. The zero frame's row count is the corpus
/// row domain the census walks, and the fit's writer asserts it against the staged index. The
/// salt derives under the initial rule identity from the same `snapshot` and `reproducibility`
/// values the seal serializes, so the draw replays from the published document's input
/// sections alone.
///
/// A census or movement refusal lands as [`MovementOutcome::Failed`] beside the completed draw
/// counts, and an empty pair domain as [`MovementOutcome::Vacuous`]. Every readout resolution
/// is an evidence body, so the readout never blocks publication.
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

    // The reading sweeps are parallel over read-only frames and trees. Each worker allocates
    // its readouts in a scratch arena and resets it between readings, so a reading bump-allocates
    // into warm memory and frees in bulk. Collection preserves draw order, so the readings are
    // the serial loop's, whatever the schedule.
    let pairs: Vec<_> = draw
        .pairs()
        .par_iter()
        .map_init(Scratch::new, |scratch, pair| {
            let reading = movement.pair(pair.source, pair.target, scratch);
            scratch.reset();
            reading
        })
        .collect();

    // The anchor index holds the drawn pairs' endpoints at their zero-step positions. A gather
    // from the proven zero field stays proven.
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

    // The collateral strata boundaries stand on the full candidate population, so the sweep
    // reads every nonparticipant row's anchor distance through the same readout as the drawn
    // controls' readings.
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
