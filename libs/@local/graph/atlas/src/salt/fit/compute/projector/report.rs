//! Measurements over the staged placement: the ladder readings, loss regressions, and
//! paired-movement evidence.

use core::num::NonZero;

use burn::backend::libtorch::LibTorchDevice;
use hashql_core::id::{Id, IdSlice, IdVec};

use super::{
    super::error::ComputeError,
    derive::gather_distinct,
    evidence::{rung_evidence, rung_path, stage_coordinate_column, write_frame},
    inputs::PublishInputs,
};
use crate::{
    device::Inference,
    file::{
        array::ArrayFile,
        attraction::read::AttractionFile,
        generation::{ScratchDirectory, StagedGeneration},
        salt::metadata::{LadderEvidence, Reproducibility, Snapshot},
    },
    identity::{NodeRowId, OntologyRowId},
    integrity::Sha256Digest,
    math::{DNonNegative, DPositive, Derivation, FinitePointField, NonNegative},
    salt::{
        fit::{ProjectorOptions, role::Role},
        ladder::{
            Field, measure_ladder,
            paired::{self, PairedMovementEvidence},
            select_canonical,
        },
        projector::{
            loss::RelationEnergy,
            model::Projector,
            scale::LocalScales,
            train::{NodeColumns, refresh},
        },
        relation::attraction::AttractionIndex,
    },
};

/// The ladder pass over one staged placement.
///
/// The pass projects every rung into scratch, publishes the canonical rung's aligned field into
/// the staged generation, and re-reads the persisted artifacts for the loss and paired-movement
/// readings. Its whole run is [`measure_conditions`](Self::measure_conditions).
pub(super) struct LadderPass<'fit> {
    /// The staged generation the canonical column publishes into and re-reads from.
    staging: &'fit StagedGeneration,
    /// The scratch directory the level frames project into.
    scratch: &'fit ScratchDirectory,
    /// The device every frame projects on.
    device: LibTorchDevice,
}

impl<'fit> LadderPass<'fit> {
    /// Opens the pass over the stage's staging and scratch directories.
    pub(super) const fn new(
        staging: &'fit StagedGeneration,
        scratch: &'fit ScratchDirectory,
        device: LibTorchDevice,
    ) -> Self {
        Self {
            staging,
            scratch,
            device,
        }
    }

    /// Projects, measures, and publishes the condition ladder, returning its evidence.
    ///
    /// Every rung projects into the scratch directory and maps back. The canonical rung's field
    /// aligns into the baseline frame and stages as the coordinate column, and the relation loss
    /// re-measures over the persisted bytes.
    pub(super) fn measure_conditions(
        &self,
        options: &ProjectorOptions,
        model: &Projector<Inference>,
        columns: NodeColumns<'_, NodeRowId>,
        inputs: &PublishInputs<'_>,
        energy: RelationEnergy,
    ) -> Result<(LadderEvidence, Sha256Digest), ComputeError> {
        let device = self.device;
        let ladder = self.scratch.directory("ladder")?;
        let conditions = options.ladder.conditions.values();

        let mut readouts = Vec::with_capacity(conditions.len());
        for (index, &eta) in conditions.iter().enumerate() {
            let frame = refresh::forward(model, columns, eta, options.forward_rows, &device)?;
            // The loss population is the training domain: the full frame gathers at the quotient's
            // first rows - identical representations project identically, so the gather is the
            // distinct rows' own frame.
            let distinct_frame = gather_distinct(&frame, inputs.quotient);
            let scales = refresh::scales(&distinct_frame, &inputs.knn, eta)
                .map_err(|error| error.map_rows(|row| inputs.quotient.representative(row)))?;
            readouts.push(relation_loss(
                &distinct_frame,
                &scales,
                inputs.attraction,
                energy,
                options.plan.relation_cap,
            ));

            write_frame(rung_path(&ladder, index), &frame)?;
        }
        let losses: Vec<_> = readouts
            .iter()
            .map(|readout| readout.uncapped_total)
            .collect();

        // Logged before the alignment fits and the canonical selection:
        // the raw series survives their failures.
        tracing::info!(
            radius = %energy.proximal().radius(),
            conditions = ?conditions,
            losses = ?losses,
            "measured the rung relation losses"
        );
        warn_loss_regressions(conditions, &losses);

        // The frames map back together for the alignment fits; each is
        // one scratch array file, so the resident set is the mapped
        // pages the fits touch, not the owned frames. Each frame proves
        // its finiteness once here, and the fits consume the proof.
        let files = (0..conditions.len())
            .map(|index| {
                ArrayFile::open(rung_path(&ladder, index))
                    .map_err(|error| ComputeError::MapCoordinates(error.into()))
            })
            .collect::<Result<Vec<_>, _>>()?;
        let fields: Vec<Field<'_, NodeRowId>> = files
            .iter()
            .zip(&readouts)
            .enumerate()
            .map(|(rung, (file, readout))| {
                let points = file
                    .points()
                    .expect("the rung frame was written as f32 pairs");
                let coordinates = FinitePointField::new(IdSlice::<NodeRowId, _>::from_raw(points))
                    .map_err(|source| ComputeError::NonFiniteRung { rung, source })?;

                Ok(Field {
                    coordinates,
                    relation_loss: readout.uncapped_total,
                })
            })
            .collect::<Result<_, ComputeError>>()?;

        let measurements = measure_ladder(&options.ladder.conditions, &fields)?;
        let selection = select_canonical(&measurements, options.ladder.canonical)?;
        let alignment = selection.measurement.alignment;
        tracing::info!(
            canonical = selection.measurement.condition.get(),
            index = selection.index,
            "selected the canonical rung"
        );

        let canonical = fields[selection.index].coordinates;
        let aligned: Vec<_> = canonical
            .iter()
            .map(|&point| alignment.apply(point))
            .collect();
        // The alignment's f32 arithmetic can overflow, so the published frame is proven here,
        // at its creation, and every consumer below takes the field.
        let aligned = FinitePointField::new_boxed(IdVec::from_raw(aligned).into_boxed_slice())
            .map_err(|source| ComputeError::NonFiniteAligned { source })?;
        let digest =
            stage_coordinate_column(self.staging, aligned.len() as u64, aligned.iter().copied())?;

        let persisted_relation_loss = self.measure_persisted_loss(
            inputs,
            selection.measurement.condition,
            energy,
            options.plan.relation_cap,
        )?;

        // The schedule's first rung is bit-exactly `0.0` by
        // construction, so `losses[0]` is the zero-condition raw loss.
        warn_persisted_regression(
            selection.measurement.condition,
            persisted_relation_loss,
            losses[0],
        );

        // The readout measures between the two frames the evidence narrates: the baseline rung
        // and the published canonical field, both in the baseline basis.
        let paired_movement = self.measure_paired_movement(
            inputs.snapshot,
            inputs.reproducibility,
            fields[0].coordinates,
            &aligned,
        )?;

        Ok((
            LadderEvidence {
                rungs: rung_evidence(&measurements, readouts),
                canonical: selection.measurement.condition,
                canonical_index: selection.index,
                persisted_relation_loss,
                paired_movement: Some(paired_movement),
            },
            digest,
        ))
    }

    /// Re-measures the relation loss over the persisted aligned column.
    ///
    /// The narrowing to `f32` and the alignment application are inside the measurement, ahead of
    /// the same distinct gather the rung losses used, so the reading guards both.
    fn measure_persisted_loss(
        &self,
        inputs: &PublishInputs<'_>,
        condition: NonNegative,
        energy: RelationEnergy,
        cap: NonZero<usize>,
    ) -> Result<DNonNegative, ComputeError> {
        let file = ArrayFile::open(self.staging.path_of(&Role::Coordinates.file_name()))
            .map_err(|error| ComputeError::MapCoordinates(error.into()))?;
        let frame = file
            .points()
            .expect("the coordinate column was sealed as f32 pairs");
        let frame = FinitePointField::new(IdSlice::from_raw(frame))
            .map_err(|source| ComputeError::NonFiniteAligned { source })?;
        let distinct_frame = gather_distinct(frame, inputs.quotient);
        let scales = refresh::scales(&distinct_frame, &inputs.knn, condition)
            .map_err(|error| error.map_rows(|row| inputs.quotient.representative(row)))?;
        Ok(relation_loss(&distinct_frame, &scales, inputs.attraction, energy, cap).uncapped_total)
    }

    /// Measures the paired-movement readout over the staged attraction index.
    ///
    /// The readings run over the ladder's aligned frames: `zero` is the baseline rung's field
    /// and `canonical` the published rung's field in the baseline basis. [`paired::measure`]
    /// runs the whole readout, and every readout resolution is an evidence body, so the
    /// generation publishes around a vacuous or failed reading.
    ///
    /// # Errors
    ///
    /// - [`ComputeError::SaltPreimage`] when the salt preimage does not serialize. The preimage is
    ///   a strict subset of the metadata document, so the seal shares the failure.
    /// - [`ComputeError::MapAttraction`] when the staged attraction index does not map back.
    ///
    /// # Panics
    ///
    /// This panics when the staged index and the ladder frames disagree on the corpus row count.
    /// One fit stages both over one corpus, so the disagreement is a pipeline defect rather than
    /// a data condition, and no persisted refusal names it.
    #[expect(
        clippy::panic_in_result_fn,
        reason = "the Result carries fit-level failures; a row-count contradiction between two \
                  artifacts of one fit is a pipeline contract violation, documented under Panics"
    )]
    fn measure_paired_movement(
        &self,
        snapshot: &Snapshot,
        reproducibility: &Reproducibility,
        zero: &FinitePointField<NodeRowId>,
        canonical: &FinitePointField<NodeRowId>,
    ) -> Result<PairedMovementEvidence<NodeRowId>, ComputeError> {
        let index = AttractionFile::open(self.staging.path_of(&Role::Attraction.file_name()))?;
        assert_eq!(
            index.rows(),
            zero.len() as u64,
            "the staged index and the ladder frames describe one corpus"
        );

        paired::measure(
            snapshot,
            reproducibility,
            index.groups(),
            index.edges(),
            zero,
            canonical,
        )
        .map_err(From::from)
    }
}

/// One adjacent raw relation-loss regression in a measured series.
pub(super) struct LossRegression {
    /// The regressing rung's condition value.
    pub condition: NonNegative,
    /// The predecessor's condition value.
    pub previous_condition: NonNegative,
    /// The loss increase over the predecessor.
    pub delta: DPositive,
    /// The increase relative to the predecessor's loss.
    ///
    /// Absent where the predecessor is zero or the quotient rounds outside the finite positive
    /// domain, rather than manufactured as inf/NaN.
    pub relative: Option<DPositive>,
}

/// Finds every adjacent raw relation-loss regression in a measured series.
///
/// Examines every adjacent transition and yields one entry per rung whose loss exceeds its
/// predecessor's, in schedule order.
pub(super) fn loss_regressions<'series>(
    conditions: &'series [NonNegative],
    losses: &'series [DNonNegative],
) -> impl Iterator<Item = LossRegression> + 'series {
    conditions
        .iter()
        .zip(losses)
        .map_windows::<_, _, 2>(|window| *window)
        .filter_map(
            |[(&previous_condition, &previous), (&condition, &current)]| {
                let delta = current - previous;

                DPositive::new(delta).map(|delta| LossRegression {
                    condition,
                    previous_condition,
                    delta,
                    relative: previous
                        .positive()
                        .and_then(|previous| delta.checked_div(previous)),
                })
            },
        )
}

/// Warns on every adjacent raw relation-loss regression in the measured series.
pub(super) fn warn_loss_regressions(conditions: &[NonNegative], losses: &[DNonNegative]) {
    for LossRegression {
        condition,
        previous_condition,
        delta,
        relative,
    } in loss_regressions(conditions, losses)
    {
        if let Some(relative) = relative {
            tracing::warn!(
                condition = %condition,
                previous_condition = %previous_condition,
                delta = %delta,
                relative = %relative,
                "a rung's relation loss exceeds its predecessor's"
            );
        } else {
            tracing::warn!(
                condition = %condition,
                previous_condition = %previous_condition,
                delta = %delta,
                "a rung's relation loss exceeds its predecessor's"
            );
        }
    }
}

/// Warns when the persisted canonical loss is not below the zero-condition raw loss.
///
/// Reports the absolute delta. The relative delta is absent rather than manufactured where the
/// baseline is zero or the quotient rounds outside the finite non-negative domain.
pub(super) fn warn_persisted_regression(
    canonical: NonNegative,
    persisted: DNonNegative,
    baseline: DNonNegative,
) {
    if persisted < baseline {
        return;
    }

    // In domain with no check: the guard proves the difference non-negative, and the
    // difference of two finite values is finite.
    let delta = DNonNegative::new_unchecked((persisted - baseline).get());
    let relative = baseline
        .positive()
        .and_then(|baseline| delta.checked_div(baseline));
    if let Some(relative) = relative {
        tracing::warn!(
            canonical = %canonical,
            persisted = %persisted,
            baseline = %baseline,
            delta = %delta,
            relative = %relative,
            "the persisted canonical loss is not below the zero-condition raw loss"
        );
    } else {
        tracing::warn!(
            canonical = %canonical,
            persisted = %persisted,
            baseline = %baseline,
            delta = %delta,
            "the persisted canonical loss is not below the zero-condition raw loss"
        );
    }
}

/// One frame's relation-loss readout.
#[derive(Debug)]
pub(super) struct RelationLossReadout {
    /// The uncapped corpus total over every attraction instance.
    pub uncapped_total: DNonNegative,
    /// The capped trained estimand.
    ///
    /// Each group's share enters scaled by `min(cap, n) / n` and folds in its own accumulation
    /// chain, so the reading is the exact expectation of the trainer's capped-sampling batch
    /// estimator.
    pub capped_total: DNonNegative,
    /// Each group's own accumulated share, in the index's group order (ascending by relation).
    ///
    /// The shares carry their own accumulation chains, so their sum matches the uncapped total
    /// to rounding rather than bit-exactly. The uncapped total's own chain is the persisted
    /// contract.
    pub per_type: Vec<(OntologyRowId, DNonNegative)>,
}

/// Measures a frame's relation loss: corpus total, per-type shares, and the capped estimand.
///
/// Every attraction instance's weighted class-mixture energy at its locally normalized distance,
/// accumulated in double precision - one accumulator for the corpus, one per group, and one for
/// the capped estimand, all in the same walk. The capped accumulator scales each group's finished
/// share by `min(cap, n) / n`, the probability that one of the group's `n` edges enters the
/// trainer's per-type draw, so the reading is the exact expectation of the capped-sampling batch
/// estimator the trainer optimizes.
///
/// The per-instance formula is the batch relation term's with the estimator scale at one, and the
/// twin lives at [`relation_term`](crate::salt::projector::loss::relation_term).
pub(super) fn relation_loss<N, E>(
    frame: &FinitePointField<N>,
    scales: &LocalScales<N>,
    index: &AttractionIndex<N, E>,
    energy: RelationEnergy,
    cap: NonZero<usize>,
) -> RelationLossReadout
where
    N: Id,
    E: Id,
{
    let epsilon = energy.epsilon();

    // The mixture readings are raw and can carry an f32 overflow, so every accumulation chain
    // runs as a derivation and makes its one claim at the readout's construction.
    let mut uncapped_total = Derivation::<DNonNegative>::ZERO;
    let mut capped_total = Derivation::<DNonNegative>::ZERO;
    let mut per_type = Vec::with_capacity(index.groups().len());
    for group in index.groups() {
        let weights = group.weights();
        let edges = group.edges();
        let mut share = Derivation::<DNonNegative>::ZERO;

        for edge in edges {
            let source = edge.source;
            let target = edge.target;
            let difference = frame[source] - frame[target];
            let distance = difference.length();
            let normalization = scales.normalization(source, target, epsilon);
            // Never NaN and never negative; a quotient past the working range saturates where
            // the class energies saturate anyway.
            let normalized = distance.saturating_div(normalization);

            let (value, _) = energy.mixture(normalized, weights.coincident, weights.proximal);
            let factor = (edge.confidence.value() * edge.normalization) * weights.strength.widen();

            uncapped_total = Derivation::from(factor).mul_add(value, uncapped_total);
            share = Derivation::from(factor).mul_add(value, share);
        }

        #[expect(
            clippy::cast_precision_loss,
            reason = "group sizes and the cap stay far below f64's exact-integer range"
        )]
        // `min(cap, n) / n` with `n ≥ 1`: the index never stores an empty group, so the
        // quotient is finite and in `(0, 1]`.
        let clip =
            DNonNegative::new_unchecked(cap.get().min(edges.len()) as f64 / edges.len() as f64);
        capped_total = share.mul_add(clip, capped_total);
        per_type.push((
            group.relation(),
            share.finish().expect("the relation share should be finite"),
        ));
    }

    // The folds run over validated weights and clips in (0, 1], so a non-finite finish marks a
    // defect upstream of this readout.
    RelationLossReadout {
        uncapped_total: uncapped_total
            .finish()
            .expect("the uncapped relation total should be finite"),
        capped_total: capped_total
            .finish()
            .expect("the capped relation total should be finite"),
        per_type,
    }
}
