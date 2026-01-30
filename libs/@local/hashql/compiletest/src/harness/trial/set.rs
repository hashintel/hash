use core::cmp::Reverse;

use error_stack::Report;
use rayon::iter::{IntoParallelIterator, IntoParallelRefIterator as _, ParallelIterator as _};

use super::{
    Trial, context::TrialContext, error::TrialError, group::TrialGroup, stats::TrialStatistics,
};

#[derive(Clone)]
pub(crate) struct TrialSet<'trial, 'graph> {
    pub trials: Vec<(&'trial TrialGroup<'graph>, &'trial Trial)>,
}

impl<'trial, 'graph> TrialSet<'trial, 'graph> {
    pub(crate) const fn new() -> Self {
        Self { trials: Vec::new() }
    }

    pub(crate) const fn len(&self) -> usize {
        self.trials.len()
    }

    pub(crate) fn push(&mut self, group: &'trial TrialGroup<'graph>, trial: &'trial Trial) {
        self.trials.push((group, trial));
    }

    pub(crate) fn sort(&mut self) {
        self.trials
            .sort_by_key(|(_, trial)| Reverse(trial.suite.priority()));
    }

    #[tracing::instrument(skip_all)]
    pub(crate) fn run(
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
