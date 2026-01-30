use core::{any::Any, cmp::Reverse};
use std::panic;

use error_stack::Report;
use rayon::iter::{IntoParallelIterator, IntoParallelRefIterator, ParallelIterator};

use super::{
    context::TrialContext,
    error::TrialError,
    group::TrialGroup,
    stats::TrialStatistics,
    trial::{Trial, TrialDescription},
};

// Adapted from: https://github.com/rust-lang/rust/blob/6c8138de8f1c96b2f66adbbc0e37c73525444750/library/std/src/panicking.rs#L779-L787
fn panic_payload_as_str(payload: Box<dyn Any + Send + 'static>) -> String {
    match payload.downcast::<&'static str>() {
        Ok(value) => (*value).to_owned(),
        Err(payload) => payload
            .downcast::<String>()
            .map_or_else(|_| "Box<dyn Any>".to_owned(), |value| *value),
    }
}

pub struct TrialSet<'trial, 'graph> {
    trials: Vec<(&'trial TrialGroup<'graph>, &'trial Trial)>,
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
            let (statistics, result) =
                match panic::catch_unwind(|| trial.run(&group.metadata, context)) {
                    Err(panic) => (
                        TrialStatistics::panic(),
                        Err(Report::new(TrialError::AssertionFailed {
                            message: panic_payload_as_str(panic),
                        })
                        .attach_opaque(TrialDescription {
                            package: group.metadata.name().to_owned(),
                            namespace: trial.namespace.clone(),
                            name: trial.annotations.directive.name.clone(),
                        })
                        .expand()),
                    ),
                    Ok(error) => error,
                };

            (group, trial, statistics, result)
        })
    }
}
