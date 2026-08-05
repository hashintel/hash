//! The outer trust-region state machine.
//!
//! [`solve`] drives the loop over one [`ScaledProblem`]. Every fit starts at `ζ = 0`. Each outer
//! iteration certifies the accepted gradient and then runs the exact Newton inner solve. It prices
//! the resulting candidate against the predicted model reduction and accepts or rejects it by
//! ratio. The accepted point moves only on acceptance; rejection shrinks the trust radius toward
//! its minimum and an expanded radius requires a validated boundary step. Success is [`Converged`]
//! (a fresh final joint evaluation re-proving the certificate) and every other terminal is a
//! typed [`SolverFailure`] in the normative precedence order: validation, accepted-gradient
//! success, outer budget, inner Newton, invalid predicted reduction, resolution construction,
//! resolution stall, candidate numerical failure, ratio classification, then radius underflow.

use super::{
    SOLVER_DIMENSIONS,
    config::SolverConfig,
    flat,
    newton::{NewtonOutcome, newton_step},
    problem::ScaledProblem,
    receipt::{
        CandidateOutcome, CurvatureDiagnostic, OuterOutcome, OuterReceipt, ReceiptCoordinates,
        ReceiptDetail, StartDigests, vector_digest,
    },
    resolution::objective_resolution,
    stable::{checked_dot, stable_l2},
    terminal::SolverFailure,
    work::WorkCounters,
};
use crate::math::{AlignedDVecN, BoxedDVecN};

/// The accepted iterate in scaled coordinates, with its objective and gradient.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct AcceptedPoint {
    /// The accepted point `ζ` in scaled coordinates.
    pub zeta: BoxedDVecN<SOLVER_DIMENSIONS>,
    /// The normalized objective at the point.
    pub objective: f64,
    /// The scaled gradient at the point.
    pub scaled_gradient: BoxedDVecN<SOLVER_DIMENSIONS>,
}

/// The mutable control state beside the accepted point.
///
/// A rejection changes only this state; an acceptance replaces the accepted point after its
/// candidate gradient proves finite.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct SolverControl {
    /// The current trust radius.
    pub radius: f64,
    /// Consecutively rejected candidates since the last acceptance.
    pub consecutive_rejections: u64,
    /// Outer iterations started.
    pub outer_iterations_started: u64,
    /// The work counters of the whole fit, preparation included.
    pub counters: WorkCounters,
}

impl SolverControl {
    /// Fresh control state carrying the preparation-charged counters.
    const fn new(radius: f64, counters: WorkCounters) -> Self {
        Self {
            radius,
            consecutive_rejections: 0,
            outer_iterations_started: 0,
            counters,
        }
    }
}

/// The initial gradient norm and its derived threshold, persisted as certificate evidence.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct CertificateEvidence {
    /// The initial scaled-gradient norm `‖gζ,0‖₂`.
    pub initial_gradient_norm: f64,
    /// The derived threshold `max(absolute, relative·‖gζ,0‖₂)`.
    pub gradient_threshold: f64,
}

/// A certified solution, with its accepted point re-proven by the final joint evaluation.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Converged {
    /// The accepted point carrying the fresh final objective and gradient.
    pub point: AcceptedPoint,
}

/// Everything one solve reports: the terminal, the last accepted state, control, evidence, and
/// receipts.
#[derive(Debug)]
pub(crate) struct SolverRun {
    /// The certified solution or the typed failure.
    pub outcome: Result<Converged, SolverFailure>,
    /// The last accepted point. On failure its objective is the final objective.
    pub accepted: AcceptedPoint,
    /// Control state at termination, counters included.
    pub control: SolverControl,
    /// Certificate evidence, present once the solve derives the threshold.
    pub certificate: Option<CertificateEvidence>,
    /// One receipt per started outer iteration under a debugging request. A routine fit leaves
    /// this empty.
    pub receipts: Vec<OuterReceipt>,
    /// The coordinate/version identity of the receipts and their digests, present only under a
    /// debugging request, with the receipts it describes.
    pub coordinates: Option<ReceiptCoordinates>,
}

/// Runs the bounded trust-region solve from `ζ = 0` over a prepared problem.
///
/// `counters` carries the preparation charges, and the returned control state carries the counters
/// of the whole fit. `detail` names whether the solve stores receipts at all. A routine fit stores
/// none, and only an explicit debugging consumer requests them. The owner validates the
/// configuration before the solve begins.
pub(crate) fn solve(
    problem: &ScaledProblem<'_>,
    counters: WorkCounters,
    detail: ReceiptDetail,
) -> SolverRun {
    debug_assert!(
        problem.config.validate().is_ok(),
        "the solver configuration is validated",
    );

    let mut control = SolverControl::new(problem.config.radius_initial.get(), counters);
    let mut receipts = Vec::new();
    let mut certificate = None;

    // Every fit starts at ζ = 0, and the initialized joint evaluation prices it.
    let origin = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    let point = problem.point(&origin);
    let Some((objective, scaled_gradient)) = problem.joint(&point, &mut control.counters) else {
        unreachable!("the origin is the zero vector, whose joint request is always finite")
    };
    let mut accepted = AcceptedPoint {
        zeta: origin,
        objective,
        scaled_gradient,
    };

    let outcome = run(
        problem,
        &mut accepted,
        &mut control,
        &mut certificate,
        &mut receipts,
        detail,
    );

    SolverRun {
        outcome,
        accepted,
        control,
        certificate,
        receipts,
        coordinates: (detail == ReceiptDetail::Digests).then_some(ReceiptCoordinates::CURRENT),
    }
}

/// The outer loop over an initialized accepted point.
fn run(
    problem: &ScaledProblem<'_>,
    accepted: &mut AcceptedPoint,
    control: &mut SolverControl,
    certificate: &mut Option<CertificateEvidence>,
    receipts: &mut Vec<OuterReceipt>,
    detail: ReceiptDetail,
) -> Result<Converged, SolverFailure> {
    let config = &problem.config;

    loop {
        let gradient_norm = stable_l2(&accepted.scaled_gradient)
            .ok_or(SolverFailure::NonFiniteAcceptedGradientNorm)?;

        let threshold = gradient_threshold(config, certificate, gradient_norm)?;

        // A passing accepted gradient always returns before the inner solve runs.
        if gradient_norm <= threshold {
            return certify(problem, accepted, control, threshold);
        }

        if control.outer_iterations_started == config.maximum_outer_iterations.get() {
            return Err(SolverFailure::OuterIterationBudget);
        }
        control.outer_iterations_started += 1;

        let mut recorded = start_receipt(receipts, detail, accepted, control, gradient_norm);

        let point = problem.point(&accepted.zeta);
        let inner = newton_step(problem, &point, &accepted.scaled_gradient, control)?;

        let predicted =
            record_inner_step(recorded.as_deref_mut(), &accepted.scaled_gradient, &inner);
        if !predicted.is_finite() || predicted <= 0.0 {
            return Err(SolverFailure::InvalidPredictedReduction);
        }

        let resolution = objective_resolution(accepted.objective, config.objective_resolution_ulps)
            .ok_or(SolverFailure::ResolutionScaleOverflow)?;
        if predicted <= resolution {
            return Err(SolverFailure::ResolutionStall);
        }

        let trial_zeta = flat::advance(&accepted.zeta, 1.0, inner.step());
        let trial_point = problem.point(&trial_zeta);
        let trial_objective = problem.objective(&trial_point, &mut control.counters);
        if !trial_objective.is_finite() {
            if let Some(recorded) = recorded.as_deref_mut() {
                recorded.candidate = Some(CandidateOutcome::RejectedNonFinite);
            }
            control.counters.reject_non_finite_candidate();
            rejected(control, config)?;
            continue;
        }

        let actual = accepted.objective - trial_objective;
        let ratio = actual / predicted;
        if let Some(recorded) = recorded.as_deref_mut() {
            recorded.actual_reduction = actual.is_finite().then_some(actual);
            recorded.ratio = ratio.is_finite().then_some(ratio);
        }
        if !actual.is_finite() || !ratio.is_finite() {
            return Err(SolverFailure::InvalidAcceptanceRatio);
        }

        if ratio < config.eta_accept.get() {
            if let Some(recorded) = recorded.as_deref_mut() {
                recorded.candidate = Some(CandidateOutcome::RejectedByRatio);
            }

            control.counters.reject_finite_candidate();
            rejected(control, config)?;
            continue;
        }

        // Acceptance commits only after the candidate gradient proves finite; a rejected
        // request and a non-finite gradient share the terminal.
        let Some(trial_gradient) = problem
            .gradient(&trial_point, &mut control.counters)
            .filter(|gradient| gradient.is_finite())
        else {
            if let Some(recorded) = recorded.as_deref_mut() {
                recorded.candidate = Some(CandidateOutcome::AcceptedGradientNonFinite);
            }

            control
                .counters
                .record_accepted_by_ratio_gradient_non_finite();
            return Err(SolverFailure::NonFiniteAcceptedCandidateGradient);
        };

        if let Some(recorded) = recorded {
            recorded.candidate = Some(CandidateOutcome::Accepted);
            recorded.curvature = Some(curvature_diagnostic(
                inner.step(),
                &trial_gradient,
                &accepted.scaled_gradient,
            ));
        }
        *accepted = AcceptedPoint {
            zeta: trial_zeta,
            objective: trial_objective,
            scaled_gradient: trial_gradient,
        };
        control.counters.accept_candidate();
        control.consecutive_rejections = 0;

        // Only a validated boundary step at or above the expansion ratio grows the radius.
        if inner.is_boundary() && ratio >= config.eta_expand.get() {
            control.radius =
                (config.expansion_factor.get() * control.radius).min(config.radius_maximum.get());
        }
    }
}

/// Returns the run's gradient threshold, deriving the certificate evidence on the first pass.
///
/// The threshold derives once, from the initial scaled-gradient norm, and every later pass reads
/// the stored evidence.
///
/// # Errors
///
/// Returns [`SolverFailure::GradientThresholdOverflow`] when the norm is not finite. The outer loop
/// certifies its accepted norm finite before calling, so a solve never reaches this error.
fn gradient_threshold(
    config: &SolverConfig,
    certificate: &mut Option<CertificateEvidence>,
    gradient_norm: f64,
) -> Result<f64, SolverFailure> {
    if let Some(evidence) = certificate {
        return Ok(evidence.gradient_threshold);
    }

    let evidence = derive_certificate(config, gradient_norm)?;
    *certificate = Some(evidence);
    Ok(evidence.gradient_threshold)
}

/// Stores the started outer iteration's receipt and returns the outcome it records into.
///
/// A debugging request stores one receipt per started outer iteration and the returned outcome
/// collects the iteration's diagnostics; the routine posture stores none and returns [`None`], so
/// the diagnostic-only arithmetic never runs.
fn start_receipt<'receipts>(
    receipts: &'receipts mut Vec<OuterReceipt>,
    detail: ReceiptDetail,
    accepted: &AcceptedPoint,
    control: &SolverControl,
    gradient_norm: f64,
) -> Option<&'receipts mut OuterOutcome> {
    if detail != ReceiptDetail::Digests {
        return None;
    }

    receipts.push(OuterReceipt {
        outer_iteration: control.outer_iterations_started,
        radius: control.radius,
        objective: accepted.objective,
        gradient_norm,
        digests: StartDigests {
            zeta: vector_digest(&accepted.zeta),
            gradient: vector_digest(&accepted.scaled_gradient),
        },
        counters: control.counters,
        outcome: OuterOutcome::default(),
    });
    receipts.last_mut().map(|receipt| &mut receipt.outcome)
}

/// Derives the certificate evidence from the initial scaled-gradient norm.
///
/// # Errors
///
/// Returns [`SolverFailure::GradientThresholdOverflow`] when the norm is not finite, the one case
/// where no valid threshold derives.
pub(super) fn derive_certificate(
    config: &SolverConfig,
    initial_norm: f64,
) -> Result<CertificateEvidence, SolverFailure> {
    let threshold = config
        .gradient_threshold(initial_norm)
        .ok_or(SolverFailure::GradientThresholdOverflow)?;
    Ok(CertificateEvidence {
        initial_gradient_norm: initial_norm,
        gradient_threshold: threshold,
    })
}

/// Returns the predicted model reduction `−g·p − ½·p·Hp` from the returned step and product alone,
/// recording the inner-step summaries when the solve stores a receipt.
///
/// The dots are algorithm inputs and always compute; the norms are diagnostic-only and compute
/// solely for a stored receipt. A failed dot yields NaN, which the caller classifies as an invalid
/// predicted reduction.
fn record_inner_step(
    recorded: Option<&mut OuterOutcome>,
    gradient: &AlignedDVecN<SOLVER_DIMENSIONS>,
    inner: &NewtonOutcome,
) -> f64 {
    let along_gradient = checked_dot(gradient, inner.step());
    let along_curvature = checked_dot(inner.step(), inner.hessian_step());

    let predicted = match (along_gradient, along_curvature) {
        (Some(gradient_term), Some(curvature_term)) => {
            (-0.5_f64).mul_add(curvature_term, -gradient_term)
        }
        _ => f64::NAN,
    };

    if let Some(recorded) = recorded {
        recorded.tag = Some(inner.tag());
        recorded.newton_residual = inner.residual();
        recorded.step_norm = stable_l2(inner.step());
        recorded.hessian_step_norm = stable_l2(inner.hessian_step());
        recorded.gradient_step = along_gradient;
        recorded.step_curvature = along_curvature;
        recorded.predicted_reduction = predicted.is_finite().then_some(predicted);
    }
    predicted
}

/// Applies one rejection to the control state.
///
/// The streak counter is a reported diagnostic only: no budget bounds it, because radius underflow
/// always arrives first under any shrink factor at or below `0.4` over the default twelve-decade
/// radius band.
///
/// # Errors
///
/// Returns [`SolverFailure::RadiusUnderflow`] when the rejected attempt already used the minimum
/// radius. A rejection that first clips to the minimum permits one later attempt there.
pub(super) fn rejected(
    control: &mut SolverControl,
    config: &SolverConfig,
) -> Result<(), SolverFailure> {
    control.consecutive_rejections += 1;

    #[expect(
        clippy::float_cmp,
        reason = "the minimum radius is reached only through an exact clip to its bytes"
    )]
    if control.radius == config.radius_minimum.get() {
        return Err(SolverFailure::RadiusUnderflow);
    }

    // Both factors are finite and positive, so the shrink and its clip stay in domain.
    control.radius = (config.shrink_factor.get() * control.radius).max(config.radius_minimum.get());
    Ok(())
}

/// Re-proves the certificate at the accepted point with a fresh joint evaluation.
pub(super) fn certify(
    problem: &ScaledProblem<'_>,
    accepted: &AcceptedPoint,
    control: &mut SolverControl,
    threshold: f64,
) -> Result<Converged, SolverFailure> {
    let point = problem.point(&accepted.zeta);
    let Some((objective, gradient)) = problem.joint(&point, &mut control.counters) else {
        return Err(SolverFailure::FinalCertificationNonFinite);
    };

    if !objective.is_finite() {
        return Err(SolverFailure::FinalCertificationNonFinite);
    }
    let norm = stable_l2(&gradient).ok_or(SolverFailure::FinalCertificationNonFinite)?;
    if norm > threshold {
        return Err(SolverFailure::FinalCertificateMismatch);
    }

    Ok(Converged {
        point: AcceptedPoint {
            zeta: accepted.zeta.clone(),
            objective,
            scaled_gradient: gradient,
        },
    })
}

/// The accepted-step curvature diagnostic `p·y` and `(p·y) / (p·p)` with `y = g_trial − g`.
fn curvature_diagnostic(
    step: &AlignedDVecN<SOLVER_DIMENSIONS>,
    trial_gradient: &AlignedDVecN<SOLVER_DIMENSIONS>,
    accepted_gradient: &AlignedDVecN<SOLVER_DIMENSIONS>,
) -> CurvatureDiagnostic {
    let difference = flat::advance(trial_gradient, -1.0, accepted_gradient);
    if !difference.is_finite() {
        return CurvatureDiagnostic::NonFiniteDifference;
    }

    let Some(along) = checked_dot(step, &difference) else {
        return CurvatureDiagnostic::NonFiniteDot;
    };
    let Some(square) = checked_dot(step, step) else {
        return CurvatureDiagnostic::NonFiniteDot;
    };

    let normalized = along / square;
    if normalized.is_finite() {
        CurvatureDiagnostic::Value { along, normalized }
    } else {
        CurvatureDiagnostic::NonFiniteNormalization
    }
}
