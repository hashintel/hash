//! Training-run rejection and failure errors.

use core::{error::Error, fmt};

use super::{TrainingEvidence, TrainingSchedule, objective::SplitPopulation};
use crate::{
    math::{Diverged, NonNegative},
    salt::projector::{
        band::BandRefusal,
        evidence::EvidenceRefusal,
        gauge::GaugeRefusal,
        scale::frozen::InvalidRuler,
        train::{StepError, refresh::RefreshError},
    },
};

/// What refused inside the target objective.
///
/// Every variant is a data-dependent reading that could not be made. Nothing branches on the
/// variants: each carries its failed check's own fields, and the enclosing
/// [`TargetRefusal`] states the one consequence they share.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum TargetRefusalCause<N> {
    /// The ruler could not freeze over the boundary frame, so the estimand's denominator does
    /// not exist.
    Ruler(InvalidRuler<N>),
    /// The band constraint refused to freeze: the declared radius does not exist over the
    /// stored coordinates.
    Band(BandRefusal),
    /// The gauge refused, at the boundary freeze or inside a step's live fit.
    Gauge(GaugeRefusal),
    /// A step's accumulated target reading diverged: an unbounded data-dependent fold left
    /// double precision, or the finished estimand overflowed its narrowing to working
    /// precision, so the step publishes no reading.
    Reading(Diverged<f64>),
    /// A per-evaluation evidence reading refused, and an evaluation that cannot state its
    /// declared evidence publishes nothing.
    Evidence(EvidenceRefusal),
}

impl<N> fmt::Display for TargetRefusalCause<N>
where
    N: fmt::Display,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Ruler(error) => error.fmt(fmt),
            Self::Band(error) => error.fmt(fmt),
            Self::Gauge(error) => error.fmt(fmt),
            Self::Reading(diverged) => write!(
                fmt,
                "the step's accumulated target reading diverged to {:e}",
                diverged.raw
            ),
            Self::Evidence(error) => error.fmt(fmt),
        }
    }
}

/// The failed reading beside everything a refused run measured before it.
///
/// A refusal ends the run with no activation candidate and no target claim, so the prior active
/// generation stays the serving one. The refusal is an
/// outcome rather than an error, so the run record cannot die with an unwinding call. What the
/// record holds at each refusal stage is fixed. The boundary record is present exactly when
/// the radius freeze completed, and the target record exactly when the phase froze. The
/// preserved interval ends at the last completed reading before the failed one.
#[derive(Debug)]
pub(crate) struct TargetRefusal<N> {
    /// The training step the refusal fired at.
    pub step: usize,
    /// The failed reading.
    pub cause: TargetRefusalCause<N>,
    /// Everything the run measured before the refusal.
    ///
    /// The run record as accumulated at the refusal, with the boundary record and the target
    /// record sealed into it. Rows in the record name the trainer's own row domain: the record
    /// is a reading of the run that refused, so no later boundary re-labels it.
    #[cfg_attr(
        not(test),
        expect(
            dead_code,
            reason = "a boundary refusal carries its sealed run record for the training \
                      supervisor to persist at attempt close; that supervisor is not yet wired"
        )
    )]
    pub evidence: Box<TrainingEvidence<N>>,
}

impl<N> fmt::Display for TargetRefusal<N>
where
    N: fmt::Display,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let Self { step, cause, .. } = self;
        write!(
            fmt,
            "the target objective refused at step {step} ({cause}); the run publishes no \
             activation candidate and the prior active generation stays",
        )
    }
}

/// A training run failed.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum TrainError<N> {
    /// The semantic graph carries no edge weight: there is no layout evidence to train against.
    NoSemanticEvidence,
    /// The schedule's boundary is step zero.
    ///
    /// A radius measured there would describe an untrained map rather than the semantic-only
    /// baseline that defines the measurement.
    UnbaselinedRadius,
    /// The attraction index carries Proximal force but no reviewed verdict covers any of it.
    ///
    /// Without a reviewed verdict the measurement cannot produce a radius.
    MissingProximalReviews,
    /// The attraction index carries Coincident force but no Proximal force.
    ///
    /// No measurement can therefore set the Proximal radius the relation energy composes with.
    CoincidentWithoutProximal,
    /// The frozen Proximal radius does not exceed the Coincident one.
    DegenerateRadius {
        radius: NonNegative,
        coincident: NonNegative,
    },
    /// A refresh tick or boundary measurement failed.
    Refresh(RefreshError<N>),
    /// A training step failed.
    Step(StepError<N>),
    /// A resumed ladder received a schedule differing from the one its opening segment ran under.
    ///
    /// The scheduler position and the phase boundary therefore no longer describe the same run.
    ScheduleChanged {
        opening: TrainingSchedule,
        resumed: TrainingSchedule,
    },
    /// The target configuration's ruler refused at admission: the schedule leaves the ruler no
    /// reference to freeze.
    Ruler(InvalidRuler<N>),
    /// The target configuration's gauge refused at admission: the declared draw cannot support
    /// the run's evidence obligation.
    Gauge(GaugeRefusal),
    /// A step's accumulated target reading diverged, and the target pass owns the refusal.
    TargetReading(Diverged<f64>),
    /// The declared canonical step lies outside the training curriculum's step set.
    CanonicalStepOutOfSchedule { step: usize },
    /// The target estimand's declared unit population carries no mass.
    ///
    /// A forceless attraction index and an index whose every instance weighs zero resolve the
    /// same way: the run belongs to the vacuous-record taxonomy, decided at split time, before
    /// any fit exists to evaluate.
    EmptyTargetPopulation,
    /// The target objective needs relation-type draws, and the plan draws none.
    TargetWithoutUnitDraws,
    /// The declared penalty's slope dies at a zero violation while the margin is zero.
    ///
    /// Distance equality would then carry no corrective force, which the ruled subgradient
    /// constraint forbids: such a penalty pairs only with a positive margin.
    PenaltyWithoutForceAtEquality,
    /// A row belongs to more than one declared split population.
    ///
    /// The movement participants, gauge anchors, held-out endpoints, and matched controls are
    /// pairwise-disjoint under one split rule. A shared row hands the optimizer a channel into
    /// a reference population, or lets a reference absorb the movement it exists to certify.
    /// A row listed twice inside one population names that population on both sides.
    SplitPopulationsOverlap {
        /// The population that claimed the row first.
        first: SplitPopulation,
        /// The population whose membership collided.
        second: SplitPopulation,
        /// The shared node row.
        row: N,
    },
}

impl<N> TrainError<N> {
    /// Maps the rows the error names into another row domain.
    pub(crate) fn map_rows<M>(self, row: impl FnOnce(N) -> M) -> TrainError<M> {
        match self {
            Self::NoSemanticEvidence => TrainError::NoSemanticEvidence,
            Self::UnbaselinedRadius => TrainError::UnbaselinedRadius,
            Self::MissingProximalReviews => TrainError::MissingProximalReviews,
            Self::CoincidentWithoutProximal => TrainError::CoincidentWithoutProximal,
            Self::DegenerateRadius { radius, coincident } => {
                TrainError::DegenerateRadius { radius, coincident }
            }
            Self::Refresh(error) => TrainError::Refresh(error.map_rows(row)),
            Self::Step(error) => TrainError::Step(error.map_rows(row)),
            Self::ScheduleChanged { opening, resumed } => {
                TrainError::ScheduleChanged { opening, resumed }
            }
            Self::Ruler(error) => TrainError::Ruler(error.map_rows(row)),
            Self::Gauge(error) => TrainError::Gauge(error),
            Self::TargetReading(diverged) => TrainError::TargetReading(diverged),
            Self::CanonicalStepOutOfSchedule { step } => {
                TrainError::CanonicalStepOutOfSchedule { step }
            }
            Self::EmptyTargetPopulation => TrainError::EmptyTargetPopulation,
            Self::TargetWithoutUnitDraws => TrainError::TargetWithoutUnitDraws,
            Self::PenaltyWithoutForceAtEquality => TrainError::PenaltyWithoutForceAtEquality,
            Self::SplitPopulationsOverlap {
                first,
                second,
                row: shared,
            } => TrainError::SplitPopulationsOverlap {
                first,
                second,
                row: row(shared),
            },
        }
    }
}

impl<N> fmt::Display for TrainError<N>
where
    N: fmt::Display,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoSemanticEvidence => {
                fmt.write_str("the semantic graph carries no edge weight to train against")
            }
            Self::UnbaselinedRadius => fmt.write_str(
                "the boundary sits at step zero, so the Proximal radius would be measured on an \
                 untrained map; give the opening segment steps",
            ),
            Self::MissingProximalReviews => fmt.write_str(
                "the attraction index carries Proximal force but no reviewed-Proximal verdict \
                 covers any of it; confirm Proximal types in review",
            ),
            Self::CoincidentWithoutProximal => fmt.write_str(
                "the attraction index carries Coincident force but no Proximal force, so no \
                 reviewed-Proximal measurement can set the radius the relation energy composes \
                 with; train with the relation evidence withheld",
            ),
            Self::DegenerateRadius { radius, coincident } => write!(
                fmt,
                "the frozen Proximal radius {radius} does not exceed the Coincident radius \
                 {coincident}",
            ),
            Self::Refresh(error) => error.fmt(fmt),
            Self::Step(error) => error.fmt(fmt),
            Self::ScheduleChanged { .. } => fmt.write_str(
                "the resumed schedule differs from the one the opening segment ran under; resume \
                 with the schedule the checkpoint was trained under",
            ),
            Self::Ruler(error) => error.fmt(fmt),
            Self::Gauge(error) => error.fmt(fmt),
            Self::TargetReading(diverged) => write!(
                fmt,
                "the step's accumulated target reading diverged to {:e}",
                diverged.raw
            ),
            Self::CanonicalStepOutOfSchedule { step } => write!(
                fmt,
                "the declared canonical step index {step} lies outside the training curriculum",
            ),
            Self::EmptyTargetPopulation => fmt.write_str(
                "the target estimand's declared unit population carries no mass; the run belongs \
                 to the vacuous-record taxonomy",
            ),
            Self::TargetWithoutUnitDraws => fmt.write_str(
                "the target objective needs relation-type draws and the plan draws none; give the \
                 plan a positive relation-type count",
            ),
            Self::PenaltyWithoutForceAtEquality => fmt.write_str(
                "the declared penalty's slope dies at a zero violation and the margin is zero, so \
                 distance equality would carry no corrective force; declare a positive margin or \
                 a penalty with force at equality",
            ),
            Self::SplitPopulationsOverlap { first, second, row } => write!(
                fmt,
                "{first} and {second} share node row {row}; the declared split populations must \
                 be pairwise-disjoint under the split rule",
            ),
        }
    }
}

impl<N> Error for TrainError<N>
where
    N: fmt::Debug + fmt::Display + 'static,
{
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Refresh(error) => Some(error),
            Self::Step(error) => Some(error),
            Self::Ruler(error) => Some(error),
            Self::Gauge(error) => Some(error),
            Self::NoSemanticEvidence
            | Self::UnbaselinedRadius
            | Self::MissingProximalReviews
            | Self::CoincidentWithoutProximal
            | Self::DegenerateRadius { .. }
            | Self::ScheduleChanged { .. }
            | Self::TargetReading(..)
            | Self::CanonicalStepOutOfSchedule { .. }
            | Self::EmptyTargetPopulation
            | Self::TargetWithoutUnitDraws
            | Self::PenaltyWithoutForceAtEquality
            | Self::SplitPopulationsOverlap { .. } => None,
        }
    }
}

impl<N> From<RefreshError<N>> for TrainError<N> {
    fn from(error: RefreshError<N>) -> Self {
        Self::Refresh(error)
    }
}

impl<N> From<StepError<N>> for TrainError<N> {
    fn from(error: StepError<N>) -> Self {
        Self::Step(error)
    }
}
