//! The phase boundary's radius freeze and its report-only findings.

use hashql_core::id::Id;

use super::{
    super::{
        super::{STEPS, refresh},
        BoundaryEvidence, FrozenRadius, TrainError, TrainOptions,
    },
    Session,
};
use crate::{
    math::{DNonNegative, FinitePointField, Positive},
    salt::projector::{
        loss::RelationEnergy,
        scale::ScaledFrame,
        verdict::calibrate::{CalibrationOptions, ProximalCalibration},
    },
};

/// What one phase boundary produces - the composed relation energy and the boundary evidence,
/// with the measured zero-condition frame on a non-vacuous run, for the target freeze to
/// consume against the identical coordinates.
pub(super) type BoundaryOutcome<N> = (
    Option<RelationEnergy>,
    BoundaryEvidence,
    Option<Box<FinitePointField<N>>>,
);

impl<N, E> Session<'_, N, E>
where
    N: Id,
    E: Id,
{
    /// Freezes the Proximal radius against the boundary's zero-condition frame.
    ///
    /// Measures the reviewed-Proximal `z` population over the forwarded frame and composes the
    /// relation energy. The caller owns the frame's forward - the boundary shares one frame
    /// between this freeze and the target objective's - and its vacuous early-out, so this path
    /// always has force to measure.
    pub(super) fn freeze_radius(
        &self,
        frame: &FinitePointField<N>,
        step: usize,
    ) -> Result<(RelationEnergy, BoundaryEvidence), TrainError<N>> {
        let scales = refresh::scales(frame, &self.inputs.knn, STEPS[0])?;
        let calibration = ProximalCalibration::new(
            self.inputs.verdicts,
            self.inputs.attraction,
            ScaledFrame::new(frame, &scales),
            calibration_options(self.options),
        );
        warn_boundary_findings(&calibration, self.options.lens.temperature());

        let (frozen, radius) = match calibration.radius() {
            Some(radius) => (radius, FrozenRadius::Measured { radius }),
            // The entry check admits this run only with reviewed coverage. Reaching here means
            // the two mass walks disagree, so this returns an error rather than composing from
            // nothing.
            None => return Err(TrainError::MissingProximalReviews),
        };

        let energy =
            self.options
                .lens
                .energy(frozen)
                .ok_or_else(|| TrainError::DegenerateRadius {
                    radius: frozen,
                    coincident: self.options.lens.coincident().radius(),
                })?;

        Ok((
            energy,
            BoundaryEvidence {
                step,
                radius,
                calibration,
            },
        ))
    }
}

/// The boundary measurement's parameters, from the training options they must match.
pub(super) const fn calibration_options(options: &TrainOptions) -> CalibrationOptions {
    CalibrationOptions::new(
        options.plan.relation_cap,
        options.lens.epsilon(),
        options.lens.temperature(),
    )
}

/// Reports the boundary measurement's contract findings.
///
/// Both notices are report-only channels over the persisted evidence: they steer nothing and
/// refuse nothing, and the run trains and publishes regardless. The check field names the
/// reading that fired, stable for log filtering.
pub(crate) fn warn_boundary_findings(calibration: &ProximalCalibration, temperature: Positive) {
    let spread = calibration.leave_one_out_spread();

    if let Some(certificate) = &calibration.stability()
        && !certificate.pass
    {
        tracing::warn!(
            check = "reviewed_mass_stability_bound",
            effective_support = certificate.effective_support.get(),
            epsilon_zero = certificate.epsilon_zero.get(),
            gap = certificate.gap.get(),
            tau = certificate.tau.get(),
            bound = ?certificate.bound,
            leave_one_out_spread = spread.map(DNonNegative::get),
            "the reviews arm's effective mass fails its evaluated stability bound"
        );
    }

    if let Some(spread) = spread
        && spread > temperature.widen()
    {
        tracing::warn!(
            check = "leave_one_out_radius_spread",
            spread = spread.get(),
            temperature = temperature.get(),
            "a single omitted type moves the pooled radius by more than one transition width"
        );
    }
}
