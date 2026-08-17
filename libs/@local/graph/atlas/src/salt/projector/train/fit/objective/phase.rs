//! The boundary-frozen references and the per-step target pass.
//!
//! [`TargetPhase`] freezes every reference the estimand reads at the phase boundary -
//! the ruler, the band constraint around the boundary field, and the gauge constellation -
//! and then owns the run's accumulating state: the enforcement record, together with the
//! estimand readings and evaluation evidence that the final [`TargetEvidence`] carries.
//! Admission stays in the parent module, and the phase exists only from the
//! boundary on.

use core::num::NonZero;

use burn::{
    module::AutodiffModule as _,
    tensor::{Tensor, backend::AutodiffBackend},
};
use hashql_core::id::{Id, IdSlice, IdVec};

use super::{
    super::{
        super::{
            RUNGS,
            batch::{NodeColumns, ROW_ALIGNMENT, materialize_input},
            refresh,
            step::read_frame,
        },
        TargetRefusalCause, TrainError,
    },
    RulerTables, TargetContext, TargetEvidence, TargetRowId,
    pass::{LocalPass, deposit},
};
use crate::{
    integrity::Sha256Digest,
    math::{Finite, FinitePointCloud, Vec2},
    salt::{
        knn::table::KnnView,
        projector::{
            band::{BandProjection, ClipJacobian, EnforcementRecord},
            evidence::{
                EnforcementSummary, EvaluationEvidence, EvidenceReferences, EvidenceRefusal,
                RulerIdentity,
            },
            gauge::{GaugeAnchors, GaugeFit, GaugeOrdinal, GaugeRefusal, SpreadFloor},
            loss::{ContrastEnergy, GradientField, TargetEstimator, UnitLaw, fan_scale_pull},
            model::Projector,
            sample::SampledRelationEdges,
            scale::frozen::{FrozenRuler, RulerFloor, RulerParameters},
        },
    },
};

/// The forward machinery every target forward borrows from the run.
///
/// The phase borrows these per call rather than owning them, because the training loop owns
/// the model and moves it through the optimizer between steps.
pub(crate) struct ForwardContext<'run, N, B: AutodiffBackend> {
    /// The model under training.
    pub model: &'run Projector<B>,
    /// The corpus's node input columns.
    pub columns: NodeColumns<'run, N>,
    /// The forward-alignment row count.
    pub forward_rows: NonZero<usize>,
    /// The device the run's tensors live on.
    pub device: &'run B::Device,
}

/// One step's target pass products.
///
/// The surrogate carries both rungs' hand-gradient deposits. The contribution is the
/// activation-scaled estimand the composite loss descends. The fit and the projected zero field
/// feed the evaluation evidence on tick steps.
pub(crate) struct TargetStep<N, B: AutodiffBackend> {
    /// The backward-ready scalar of both target forwards.
    pub surrogate: Tensor<B, 1>,
    /// `λ · L̂`: the composite objective's value contribution.
    pub contribution: f32,
    /// The step's live gauge fit.
    pub fit: GaugeFit,
    /// The whole-corpus zero field after enforcement, the constitutive coordinates.
    pub zero_field: IdVec<N, Vec2>,
}

/// The frozen references and the accumulating run state, from the boundary on.
// No Debug: the frozen ruler's neighbour matrix does not implement it.
pub(crate) struct TargetPhase<N> {
    ruler: FrozenRuler<N>,
    band: BandProjection<N>,
    gauge: GaugeAnchors<N>,
    record: EnforcementRecord<N>,
    identity: RulerIdentity,
    unit_law: UnitLaw,
    split_digest: Sha256Digest,
    estimands: Vec<Finite>,
    evaluations: Vec<EvaluationEvidence>,
}

/// Proves a gathered anchor constellation finite, naming the offending anchor on refusal.
///
/// The pass readbacks carry no finiteness certificate, so the scan is the proof the gauge's
/// typed entry consumes.
fn prove_constellation<N>(
    points: &IdVec<GaugeOrdinal, Vec2>,
) -> Result<&FinitePointCloud<GaugeOrdinal>, TrainError<N>> {
    FinitePointCloud::new(points).map_err(|offender| {
        TrainError::Gauge(GaugeRefusal::NonFiniteAnchor {
            ordinal: offender.id,
        })
    })
}

impl<N> TargetPhase<N>
where
    N: Id,
{
    /// Freezes every reference against the boundary's zero-condition frame.
    ///
    /// The frame arrives finite from the boundary forward, and the freeze order follows the
    /// dependency chain. The ruler measures `σ₀` and `s_ref` over the frame. The band takes
    /// the frame as its projection centre and reconstructs its radius from the declared `β`
    /// and the ruler's `s_ref`. The gauge then freezes over the frame's rows, its spread
    /// floor assembled from the enforced radius. The record opens at the boundary step and
    /// never resets.
    ///
    /// # Errors
    ///
    /// The first refusal in freeze order is the cause. The ruler and the band each refuse a
    /// constant the working precision cannot carry or a declaration outside its window, and a
    /// degenerate gauge publishes no activation candidate. The caller owns the consequence:
    /// the session wraps the cause into the typed target refusal with the boundary evidence.
    pub(crate) fn freeze(
        context: &TargetContext<'_, N>,
        frame: IdVec<N, Vec2>,
        knn: &KnnView<'_, N>,
        boundary_step: usize,
    ) -> Result<Self, TargetRefusalCause<N>> {
        let options = context.options();
        let parameters = RulerParameters {
            epsilon_rel: options.epsilon_rel,
            scale_quantile: options.scale_quantile,
            floor: options.epsilon_floor.map(|kappa_epsilon| RulerFloor {
                kappa_epsilon,
                projection_band: options.dimensionless_radius,
            }),
        };
        // Finite with no scan: the frame arrives certified from the boundary forward.
        let frame = FinitePointCloud::new_boxed_unchecked(frame.into_boxed_slice());
        let ruler =
            FrozenRuler::freeze(&frame, knn, parameters).map_err(TargetRefusalCause::Ruler)?;

        let band = BandProjection::freeze(
            frame,
            options.dimensionless_radius,
            ruler.reference_spread(),
        )
        .map_err(TargetRefusalCause::Band)?;

        let gauge = GaugeAnchors::freeze(
            Box::from(context.inputs().gauge.rows()),
            Box::from(context.inputs().gauge.classes()),
            band.centre(),
            options.gauge_spread_factor.map(|kappa| SpreadFloor {
                kappa,
                band: band.radius(),
            }),
            options.minimum_effective_count,
        )
        .map_err(TargetRefusalCause::Gauge)?;

        let record = band.open_record(boundary_step);
        let identity = RulerIdentity {
            boundary_step,
            reference_spread: ruler.reference_spread(),
            gauge_spread: gauge.frozen_spread(),
            epsilon_rel: ruler.epsilon_rel(),
            epsilon_abs: ruler.epsilon(),
            dimensionless_radius: options.dimensionless_radius,
            radius: band.radius(),
        };

        Ok(Self {
            ruler,
            band,
            gauge,
            record,
            identity,
            unit_law: options.unit_law,
            split_digest: context.inputs().split.digest,
            estimands: Vec::new(),
            evaluations: Vec::new(),
        })
    }

    /// Projects the pass's zero readbacks in place under the frozen constraint, collecting
    /// each row's applied clip derivative.
    ///
    /// The pass's zero values are subject to the same frozen constraint as the constitutive
    /// field, so each row's readback projects under the identical clip law before any reading
    /// derives from it. The whole-field application stays the record's one writer: this
    /// per-row projection records nothing, and each applied derivative arrives typed in the
    /// pass's own row domain for the deposit's composition.
    fn project_pass_rows(
        &self,
        row_map: &IdSlice<TargetRowId, N>,
        zero_local: &mut IdSlice<TargetRowId, Vec2>,
    ) -> IdVec<TargetRowId, Option<ClipJacobian>> {
        let mut clips = IdVec::with_capacity(zero_local.len());
        for (local, value) in zero_local.iter_enumerated_mut() {
            let (projected, clip) = self.band.project(row_map[local], *value);
            *value = projected;
            clips.push(clip);
        }

        clips
    }

    /// Runs one step's target pass.
    ///
    /// Forwards the whole corpus at the zero rung and enforces the band - the enforcement
    /// point every post-boundary step passes through. The pass then forwards its own row set
    /// at both estimand rungs, projects its zero values under the frozen constraint, and fits
    /// the live gauge alignment on those coordinates. The batch estimator folds over the
    /// priced units. The scale pull fans into the anchors. The zero side composes through the
    /// pass's own applied clip derivatives, and both gradient fields deposit through the
    /// surrogate, so the estimand's value and both of its Jacobians belong to the pass's one
    /// graph realization.
    ///
    /// # Errors
    ///
    /// Returns an error when a forward diverges, or when the gauge fit refuses: training
    /// refuses the step rather than descending through a degenerate frame.
    pub(crate) fn step<E, B: AutodiffBackend<FloatElem = f32>>(
        &mut self,
        context: &TargetContext<'_, N>,
        forward: &ForwardContext<'_, N, B>,
        draws: &[SampledRelationEdges<'_, N, E>],
        step: usize,
    ) -> Result<TargetStep<N, B>, TrainError<N>>
    where
        E: Id,
    {
        // The constitutive field exists only in its projected form, and enforcement therefore
        // precedes every reading the evidence takes from it. The forward certifies finiteness
        // row by row, which is the unchecked view's proof. The estimand's calculus reads the
        // pass forward below instead. On a backend whose kernels vary with the execution
        // shape, the whole-corpus slices and the padded pass are different realizations of the
        // model. The exact derivative belongs to one of them.
        let mut zero_field = refresh::forward(
            &forward.model.valid(),
            forward.columns,
            RUNGS[0],
            forward.forward_rows,
            forward.device,
        )?;
        self.band.apply(
            FinitePointCloud::new_unchecked_mut(&mut zero_field),
            step,
            &mut self.record,
        );

        let units = context.units(&self.ruler, draws);
        let pass = LocalPass::new(&units, self.gauge.rows());
        let row_map = IdSlice::<TargetRowId, N>::from_raw(&pass.rows);

        // The two-rung forwards. Each rung's values read back from its own tensor, so every
        // reading the estimator takes shares a graph with the tensor its gradient deposits
        // through.
        let canonical_tensor = forward.model.forward(materialize_input(
            &pass.rows,
            context.canonical_eta(),
            forward.columns,
            forward.device,
            ROW_ALIGNMENT,
        ));
        let canonical_values =
            read_frame(canonical_tensor.clone().inner(), row_map).map_err(TrainError::Step)?;
        let zero_tensor = forward.model.forward(materialize_input(
            &pass.rows,
            RUNGS[0],
            forward.columns,
            forward.device,
            ROW_ALIGNMENT,
        ));
        let mut zero_values =
            read_frame(zero_tensor.clone().inner(), row_map).map_err(TrainError::Step)?;

        let canonical_frame = Vec2::from_slice(&canonical_values)
            .expect("a [rows, 2] tensor reads back an even length");
        let canonical_local =
            IdSlice::<TargetRowId, Vec2>::from_raw(&canonical_frame[..pass.rows.len()]);
        let zero_frame = Vec2::from_slice_mut(&mut zero_values)
            .expect("a [rows, 2] tensor reads back an even length");

        let zero_local =
            IdSlice::<TargetRowId, Vec2>::from_raw_mut(&mut zero_frame[..pass.rows.len()]);
        let clips = self.project_pass_rows(row_map, zero_local);

        // The live fit on the step's own coordinates: canonical onto projected zero, whole
        // gauge, exact adjoints.
        let source: IdVec<GaugeOrdinal, Vec2> = pass
            .anchors
            .iter()
            .map(|&position| canonical_local[position])
            .collect();
        let target: IdVec<GaugeOrdinal, Vec2> = pass
            .anchors
            .iter()
            .map(|&position| zero_local[position])
            .collect();
        let fit = self
            .gauge
            .fit_gathered(
                prove_constellation(&source)?,
                prove_constellation(&target)?,
                context.options().residual_bar,
            )
            .map_err(TrainError::Gauge)?;

        let estimator = TargetEstimator::new(
            ContrastEnergy::new(fit.scale(), context.options().margin),
            context.options().penalty,
            context.population_weight(),
            context.options().activation,
        );

        let mut canonical_field = GradientField::new(pass.rows.len());
        let mut zero_gradient_field = GradientField::new(pass.rows.len());
        let reading = estimator.evaluate(
            canonical_local,
            zero_local,
            &pass.units,
            &mut canonical_field,
            &mut zero_gradient_field,
        );
        fan_scale_pull(
            reading.scale_pull,
            &fit,
            &pass.anchors,
            &mut canonical_field,
            &mut zero_gradient_field,
        );

        // Every zero-side entry - the units' forces and the anchors' fitted-scale adjoints -
        // differentiates the loss with respect to the pass's projected values, and the deposit
        // target is the same pass's raw tensor. The exact derivative of the declared estimand
        // therefore composes through the pass's own applied derivatives - the identity on
        // interior rows, the clip Jacobian on rows this projection moved.
        for (local, clip) in clips.iter_enumerated() {
            if let Some(jacobian) = clip {
                let force = zero_gradient_field.take(local);
                zero_gradient_field.add(local, jacobian.transform(force));
            }
        }

        // Both deposits ride one scalar.
        let surrogate = deposit(canonical_tensor, &canonical_field, forward.device)
            + deposit(zero_tensor, &zero_gradient_field, forward.device);

        self.estimands.push(reading.estimand);

        Ok(TargetStep {
            surrogate,
            contribution: context.options().activation.get() * reading.estimand,
            fit,
            zero_field,
        })
    }

    /// Reads one evaluation's evidence over the step's fields.
    ///
    /// The fit is the step's own live fit, recorded as the objective-shape reading - the scale
    /// the objective actually descended. Every bridge end derives inside the reading from the
    /// whole-corpus fields alone. The zero field is the projected one the pass produced.
    ///
    /// # Errors
    ///
    /// Returns the refusal when a constituent fit of the reading cannot be made: an evaluation
    /// that cannot state its evidence publishes nothing. The caller owns the consequence.
    pub(crate) fn evaluate(
        &mut self,
        context: &TargetContext<'_, N>,
        fit: &GaugeFit,
        canonical: &IdSlice<N, Vec2>,
        zero: &IdSlice<N, Vec2>,
        step: usize,
    ) -> Result<(), EvidenceRefusal> {
        let reading = EvaluationEvidence::read(
            step,
            &EvidenceReferences {
                anchors: &self.gauge,
                projection: &self.band,
                strata: context.inputs().strata,
                record: &self.record,
            },
            fit,
            canonical,
            zero,
        )?;
        self.evaluations.push(reading);

        Ok(())
    }

    /// Reads the final model's zero field into the enforcement record.
    ///
    /// The loop's last optimizer update lands after its own step's enforcement application, so
    /// this closing application reads the returned model's field once more: the record then
    /// covers every update of the interval, with `steps` - one past the last step index - as
    /// the closing enforcement point. Without it, the final update could leave the returned
    /// field outside the radius while the record reads clean.
    ///
    /// # Errors
    ///
    /// Returns an error when the closing forward diverges. A diverged final state stays out of
    /// the record.
    pub(crate) fn close<B: AutodiffBackend<FloatElem = f32>>(
        &mut self,
        forward: &ForwardContext<'_, N, B>,
        steps: usize,
    ) -> Result<(), TrainError<N>> {
        let mut field = refresh::forward(
            &forward.model.valid(),
            forward.columns,
            RUNGS[0],
            forward.forward_rows,
            forward.device,
        )?;

        // Finite with no scan: the closing forward certified every coordinate.
        self.band.apply(
            FinitePointCloud::new_unchecked_mut(&mut field),
            steps,
            &mut self.record,
        );

        Ok(())
    }

    /// Closes the run segment into its evidence record.
    ///
    /// The boundary field, the ruler's two tables, and the enforcement maxima leave the phase
    /// in their own typed containers without a copy. The writer that persists a generation
    /// serializes them once and owns their file identity.
    pub(crate) fn into_evidence(self) -> TargetEvidence<N> {
        let Self {
            ruler,
            band,
            gauge: _,
            record,
            identity,
            unit_law,
            split_digest,
            estimands,
            evaluations,
        } = self;

        let enforcement = EnforcementSummary::read(&record);
        let (scales, neighbours) = ruler.into_tables();

        TargetEvidence {
            identity,
            unit_law,
            split_digest,
            boundary_field: band.into_centre(),
            tables: RulerTables::new(scales, neighbours),
            estimands,
            evaluations,
            row_maxima: record.into_row_maxima(),
            enforcement,
        }
    }
}
