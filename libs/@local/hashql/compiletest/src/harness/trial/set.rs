use core::cmp::Reverse;

use super::{Trial, group::TrialGroup};

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
}
