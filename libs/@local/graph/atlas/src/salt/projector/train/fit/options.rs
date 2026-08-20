//! The validated constants a training run is declared with.
//!
//! A run's configuration settles before its first step and stays fixed across the whole run.
//! The types here validate that configuration at construction, so the run consumes plain
//! values and re-checks nothing step to step.

use core::num::NonZero;

use crate::{
    math::{NonNegative, Positive, UnitFraction},
    salt::projector::{
        budget::Budget,
        loss::{AffinityEnergy, CoincidentEnergy, ProximalEnergy, RelationEnergy, SupportOptions},
        miner::MinerOptions,
        train::{BatchPlan, Coefficients},
    },
};

/// A validated step schedule.
///
/// Run length, phase boundary, refresh cadence, and the learning-rate envelope.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct TrainingSchedule {
    steps: NonZero<usize>,
    boundary: usize,
    refresh_interval: NonZero<usize>,
    initial_learning_rate: UnitFraction,
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
    /// Returns [`None`] unless the boundary lies within the run and the rates satisfy the cosine
    /// schedule's domain: both are unit fractions by type, the initial rate is strictly positive,
    /// and the minimum does not exceed it.
    #[must_use]
    pub(crate) const fn new(
        steps: NonZero<usize>,
        boundary: usize,
        refresh_interval: NonZero<usize>,
        initial_learning_rate: UnitFraction,
        minimum_learning_rate: UnitFraction,
    ) -> Option<Self> {
        let rates = initial_learning_rate > 0.0 && minimum_learning_rate <= initial_learning_rate;

        if !(boundary <= steps.get() && rates) {
            return None;
        }
        Some(Self {
            steps,
            boundary,
            refresh_interval,
            initial_learning_rate,
            minimum_learning_rate,
        })
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
    pub(crate) const fn initial_learning_rate(self) -> f64 {
        self.initial_learning_rate.get()
    }

    /// Returns the cosine schedule's floor learning rate.
    #[inline]
    #[must_use]
    pub(crate) const fn minimum_learning_rate(self) -> f64 {
        self.minimum_learning_rate.get()
    }
}

/// The validated relation-lens constants the boundary composes with.
///
/// The Coincident energy arrives fully configured - its radius is a configuration value until a
/// reviewed-Coincident calibration exists. The boundary measures only the Proximal radius, while
/// `temperature` and the scale guard `epsilon` complete the composed energy.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RelationLens {
    coincident: CoincidentEnergy,
    temperature: Positive,
    epsilon: Positive,
}

impl RelationLens {
    /// Composes the lens constants.
    ///
    /// Every field arrives valid by type, so the composition is plain wiring.
    #[must_use]
    pub(crate) const fn new(
        coincident: CoincidentEnergy,
        temperature: Positive,
        epsilon: Positive,
    ) -> Self {
        Self {
            coincident,
            temperature,
            epsilon,
        }
    }

    /// Returns the configured Coincident energy.
    #[inline]
    #[must_use]
    pub(crate) const fn coincident(self) -> CoincidentEnergy {
        self.coincident
    }

    /// Returns the Proximal transition temperature.
    #[inline]
    #[must_use]
    pub(crate) const fn temperature(self) -> Positive {
        self.temperature
    }

    /// Returns the local-scale guard.
    #[inline]
    #[must_use]
    pub(crate) const fn epsilon(self) -> Positive {
        self.epsilon
    }

    /// Composes the relation energy at a Proximal radius.
    ///
    /// The Proximal energy takes the radius at the lens temperature, and the configured
    /// Coincident energy and the scale guard complete the mixture. Returns [`None`] unless the
    /// Coincident radius lies strictly below the Proximal one, the ordering
    /// [`RelationEnergy::new`] requires.
    #[must_use]
    pub(crate) fn energy(self, radius: NonNegative) -> Option<RelationEnergy> {
        let proximal = ProximalEnergy::new(radius, self.temperature);
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
