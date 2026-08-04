//! Training-run rejection and failure errors.

use core::{error::Error, fmt};

use super::TrainingSchedule;
use crate::salt::projector::train::{StepError, refresh::RefreshError};

/// A training run failed.
#[derive(Debug, Copy, Clone, PartialEq)]
pub enum TrainError<N> {
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
    DegenerateRadius { radius: f32, coincident: f32 },
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
            Self::NoSemanticEvidence
            | Self::UnbaselinedRadius
            | Self::MissingProximalReviews
            | Self::CoincidentWithoutProximal
            | Self::DegenerateRadius { .. }
            | Self::ScheduleChanged { .. } => None,
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
