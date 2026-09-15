//! The validated constants a training run is declared with.
//!
//! A run's configuration settles before its first step and stays fixed across the whole run.
//! The types here validate that configuration at construction, and the run consumes plain
//! values and re-checks nothing step to step.

use core::{fmt, num::NonZero};

use crate::{
    math::{
        NonNegative, Positive, PositiveUnitFraction, UnitFraction, nz, positive_unit_fraction,
        unit_fraction,
    },
    salt::projector::{
        budget::Budget,
        loss::{AffinityEnergy, CoincidentEnergy, ProximalEnergy, RelationEnergy, SupportOptions},
        miner::MinerOptions,
        train::{BatchPlan, Coefficients},
    },
};

/// A training schedule violated a cross-field constraint.
#[derive(Debug)]
pub(crate) enum TrainingScheduleError {
    /// The initial learning rate is below the minimum learning rate.
    InitialLearningRateSmallerThanMinimum {
        /// The configured initial learning rate.
        initial: PositiveUnitFraction,
        /// The configured minimum learning rate.
        minimum: UnitFraction,
    },
    /// The phase boundary lies beyond the run.
    BoundaryGreaterThanSteps {
        /// The configured run length.
        steps: NonZero<usize>,
        /// The configured phase boundary.
        boundary: usize,
    },
}

impl fmt::Display for TrainingScheduleError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InitialLearningRateSmallerThanMinimum { initial, minimum } => {
                write!(
                    fmt,
                    "the minimum learning rate must be less than or equal to the initial learning \
                     rate: initial={initial}, minimum={minimum}"
                )
            }
            Self::BoundaryGreaterThanSteps { steps, boundary } => {
                write!(
                    fmt,
                    "the boundary must be less than or equal to the number of steps: \
                     steps={steps}, boundary={boundary}"
                )
            }
        }
    }
}

impl core::error::Error for TrainingScheduleError {}

/// Raw schedule fields admitted by [`TrainingSchedule::new`].
#[derive(Debug, serde::Deserialize)]
pub(crate) struct TrainingScheduleOptions {
    /// The run length in steps.
    pub steps: NonZero<usize>,
    /// The phase-boundary step index.
    pub boundary: usize,
    /// The refresh cadence in steps.
    pub refresh_interval: NonZero<usize>,
    /// The cosine schedule's opening learning rate.
    pub initial_learning_rate: PositiveUnitFraction,
    /// The cosine schedule's floor learning rate.
    pub minimum_learning_rate: UnitFraction,
}

impl TryFrom<TrainingScheduleOptions> for TrainingSchedule {
    type Error = TrainingScheduleError;

    fn try_from(value: TrainingScheduleOptions) -> Result<Self, Self::Error> {
        Self::new(value)
    }
}

/// A validated step schedule.
///
/// Run length, phase boundary, refresh cadence, and the learning-rate envelope.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(try_from = "TrainingScheduleOptions")]
pub(crate) struct TrainingSchedule {
    steps: NonZero<usize>,
    boundary: usize,
    refresh_interval: NonZero<usize>,
    initial_learning_rate: PositiveUnitFraction,
    minimum_learning_rate: UnitFraction,
}

impl TrainingSchedule {
    /// Validates a schedule.
    ///
    /// The boundary is the step index at which the Proximal radius freezes and the step ladder
    /// opens. Steps below it train at the zero step only. A boundary equal to the step count never
    /// opens the ladder: the run is semantic-only and records no boundary evidence. Refresh ticks
    /// run at step zero and every `refresh_interval` steps after it.
    ///
    /// # Errors
    ///
    /// Returns [`TrainingScheduleError`] for misordered learning rates or a boundary beyond the
    /// run.
    pub(crate) const fn new(
        TrainingScheduleOptions {
            steps,
            boundary,
            refresh_interval,
            initial_learning_rate,
            minimum_learning_rate,
        }: TrainingScheduleOptions,
    ) -> Result<Self, TrainingScheduleError> {
        if minimum_learning_rate > initial_learning_rate {
            return Err(
                TrainingScheduleError::InitialLearningRateSmallerThanMinimum {
                    initial: initial_learning_rate,
                    minimum: minimum_learning_rate,
                },
            );
        }

        if boundary > steps.get() {
            return Err(TrainingScheduleError::BoundaryGreaterThanSteps { steps, boundary });
        }

        Ok(Self {
            steps,
            boundary,
            refresh_interval,
            initial_learning_rate,
            minimum_learning_rate,
        })
    }

    /// Builds the ratified schedule shrunk to a requested step count.
    ///
    /// The midpoint boundary splits the opening segment and the ladder evenly, mirroring the
    /// ratified schedule's shape. The learning-rate envelope and the refresh cadence stay the
    /// ratified ones.
    #[must_use]
    pub(crate) fn shortened(steps: NonZero<usize>) -> Self {
        Self::new(TrainingScheduleOptions {
            steps,
            boundary: steps.get().div_euclid(2),
            refresh_interval: nz!(250),
            initial_learning_rate: positive_unit_fraction!(1.0e-3),
            minimum_learning_rate: unit_fraction!(1.0e-5),
        })
        .expect("a halved boundary and fixed ordered rates should form a valid schedule")
    }

    /// Returns the run length in steps.
    #[inline]
    #[must_use]
    pub(crate) const fn steps(self) -> NonZero<usize> {
        self.steps
    }

    /// Returns the phase-boundary step index.
    #[inline]
    #[must_use]
    pub(crate) const fn boundary(self) -> usize {
        self.boundary
    }

    /// Returns the refresh cadence in steps.
    #[inline]
    #[must_use]
    pub(crate) const fn refresh_interval(self) -> NonZero<usize> {
        self.refresh_interval
    }

    /// Returns the cosine schedule's opening learning rate.
    #[inline]
    #[must_use]
    pub(crate) const fn initial_learning_rate(self) -> PositiveUnitFraction {
        self.initial_learning_rate
    }

    /// Returns the cosine schedule's floor learning rate.
    #[inline]
    #[must_use]
    pub(crate) const fn minimum_learning_rate(self) -> UnitFraction {
        self.minimum_learning_rate
    }
}

/// The validated relation-lens constants the boundary composes with.
///
/// The Coincident energy arrives fully configured: its radius is a configuration value, and no
/// calibration measures it. The boundary measures only the Proximal radius, while `temperature`
/// and the scale guard `epsilon` complete the composed energy.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct RelationLens {
    pub coincident: CoincidentEnergy,
    pub temperature: Positive,
    pub epsilon: Positive,
}

impl RelationLens {
    /// Composes the relation energy at a Proximal radius.
    ///
    /// The Proximal energy takes the radius at the lens temperature, and the configured
    /// Coincident energy and the scale guard complete the mixture. Returns [`None`] unless the
    /// Coincident radius lies strictly below the Proximal one, the ordering
    /// [`RelationEnergy::new`] requires.
    #[must_use]
    pub(crate) fn energy(self, radius: NonNegative) -> Option<RelationEnergy> {
        let proximal = ProximalEnergy {
            radius,
            temperature: self.temperature,
        };

        RelationEnergy::new(self.coincident, proximal, self.epsilon)
    }
}

/// The training run's numerical contract.
///
/// Every field is a validated value, and the struct is plain wiring. `forward_rows` bounds each
/// corpus-forward slice at refresh ticks and the boundary, and with it the peak device memory of a
/// whole-corpus pass.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct TrainOptions {
    /// The step schedule.
    pub schedule: TrainingSchedule,
    /// The per-step sampling plan.
    pub plan: BatchPlan,
    /// The semantic affinity energy.
    pub affinity: AffinityEnergy,
    /// The support-term constants.
    pub support: SupportOptions,
    /// The per-node relation-gradient diagnostics' baseline convention.
    pub budget: Budget,
    /// The objective coefficients.
    pub coefficients: Coefficients,
    /// The hard-negative mining schedule.
    pub miner: MinerOptions,
    /// The relation-lens constants.
    pub lens: RelationLens,
    /// Rows per corpus-forward slice.
    pub forward_rows: NonZero<usize>,
}
