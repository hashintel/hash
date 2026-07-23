//! Training-run rejection and failure errors.

use core::{error::Error, fmt};

use super::TrainingSchedule;
use crate::salt::projector::train::{StepError, refresh::RefreshError};

/// A training run failed.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum TrainError {
    /// The semantic graph carries no edge weight: there is no layout evidence to train against.
    NoSemanticEvidence,
    /// The schedule's boundary is step zero.
    ///
    /// So the Proximal radius would be measured on an untrained map instead of the semantic-only
    /// baseline the measurement is defined over.
    UnbaselinedRadius,
    /// The attraction index carries Proximal force but no reviewed verdict covers any of it.
    ///
    /// So no radius can be measured.
    MissingProximalReviews,
    /// The attraction index carries Coincident force but no Proximal force.
    ///
    /// So no measurement can set the Proximal radius the relation energy composes with.
    CoincidentWithoutProximal,
    /// The frozen Proximal radius does not exceed the Coincident one.
    DegenerateRadius { radius: f32, coincident: f32 },
    /// A refresh tick or boundary measurement failed.
    Refresh(RefreshError),
    /// A training step failed.
    Step(StepError),
    /// A resumed ladder was handed a schedule differing from the one its opening segment ran under.
    ///
    /// So the scheduler position and the phase boundary no longer describe the same run.
    ScheduleChanged {
        opening: TrainingSchedule,
        resumed: TrainingSchedule,
    },
}

impl fmt::Display for TrainError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::NoSemanticEvidence => {
                fmt.write_str("the semantic graph carries no edge weight to train against")
            }
            Self::UnbaselinedRadius => fmt.write_str(
                "the boundary sits at step zero, so the Proximal radius would be measured on an \
                 untrained map; give the opening segment steps or supply the configured radius \
                 assertion",
            ),
            Self::MissingProximalReviews => fmt.write_str(
                "the attraction index carries Proximal force but no reviewed-Proximal verdict \
                 covers any of it; confirm Proximal types in review or supply the configured \
                 radius assertion",
            ),
            Self::CoincidentWithoutProximal => fmt.write_str(
                "the attraction index carries Coincident force but no Proximal force, so no \
                 measurement can set the Proximal radius; supply the configured radius assertion",
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

impl Error for TrainError {
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

impl From<RefreshError> for TrainError {
    fn from(error: RefreshError) -> Self {
        Self::Refresh(error)
    }
}

impl From<StepError> for TrainError {
    fn from(error: StepError) -> Self {
        Self::Step(error)
    }
}
