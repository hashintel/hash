use core::ops::Try;

use super::{Trial, corpus::TrialCorpus, group::TrialGroup};

pub(crate) trait Visitor<'graph> {
    type Result: Try<Output = ()>;

    #[expect(unused_variables, reason = "default impl")]
    fn visit_trial(&mut self, trial: &Trial) -> Self::Result {
        Try::from_output(())
    }

    fn visit_trial_group(&mut self, group: &TrialGroup<'graph>) -> Self::Result {
        walk_trial_group(self, group)
    }

    fn visit_trial_corpus(&mut self, corpus: &TrialCorpus<'graph>) -> Self::Result {
        walk_trial_corpus(self, corpus)
    }
}

pub(crate) fn walk_trial_group<'graph, V: Visitor<'graph> + ?Sized>(
    visitor: &mut V,
    group: &TrialGroup<'graph>,
) -> V::Result {
    for trial in &group.trials {
        visitor.visit_trial(trial)?;
    }

    Try::from_output(())
}

pub(crate) fn walk_trial_corpus<'graph, V: Visitor<'graph> + ?Sized>(
    visitor: &mut V,
    corpus: &TrialCorpus<'graph>,
) -> V::Result {
    for group in &corpus.groups {
        visitor.visit_trial_group(group)?;
    }

    Try::from_output(())
}
