use core::cmp::Reverse;

use error_stack::Report;
use rayon::iter::{IntoParallelIterator, IntoParallelRefIterator, ParallelIterator};

use super::{
    context::TrialContext,
    error::TrialError,
    group::TrialGroup,
    stats::TrialStatistics,
    trial::{Trial, TrialDescription},
};

#[derive(Clone)]
pub struct TrialSet<'trial, 'graph> {
    pub trials: Vec<(&'trial TrialGroup<'graph>, &'trial Trial)>,
}

impl<'trial, 'graph> TrialSet<'trial, 'graph> {
    pub fn new() -> Self {
        Self { trials: Vec::new() }
    }

    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            trials: Vec::with_capacity(capacity),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.trials.is_empty()
    }

    pub fn len(&self) -> usize {
        self.trials.len()
    }

    pub fn push(&mut self, group: &'trial TrialGroup<'graph>, trial: &'trial Trial) {
        self.trials.push((group, trial));
    }

    pub fn sort(&mut self) {
        self.trials
            .sort_by_key(|(_, trial)| Reverse(trial.suite.priority()));
    }

    #[tracing::instrument(skip_all)]
    pub fn run(
        &self,
        context: &TrialContext,
    ) -> impl IntoParallelIterator<
        Item = (
            &TrialGroup<'graph>,
            &Trial,
            TrialStatistics,
            Result<(), Report<[TrialError]>>,
        ),
    > {
        self.trials.par_iter().map(|&(group, trial)| {
            let (statistics, result) = trial.run_catch(&group.metadata, context);

            (group, trial, statistics, result)
        })
    }
}
