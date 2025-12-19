use core::{any::Any, cmp::Reverse};
use std::{
    io,
    panic::{self},
};

use error_stack::Report;
use guppy::graph::{PackageMetadata, cargo::BuildPlatform};
use nextest_filtering::{BinaryQuery, EvalContext, Filterset};
use nextest_metadata::{RustBinaryId, RustTestBinaryKind};
use rayon::iter::{IntoParallelRefIterator as _, ParallelIterator as _};

use super::{TrialContext, TrialDescription, TrialError, trial::Trial};
use crate::{OutputFormat, TestGroup, reporter::Statistics};

// Adapted from: https://github.com/rust-lang/rust/blob/6c8138de8f1c96b2f66adbbc0e37c73525444750/library/std/src/panicking.rs#L779-L787
fn panic_payload_as_str(payload: Box<dyn Any + Send + 'static>) -> String {
    match payload.downcast::<&'static str>() {
        Ok(value) => (*value).to_owned(),
        Err(payload) => payload
            .downcast::<String>()
            .map_or_else(|_| "Box<dyn Any>".to_owned(), |value| *value),
    }
}

pub(crate) struct TrialGroup<'graph, 'stats> {
    pub ignore: bool,
    pub trials: Vec<Trial<'stats>>,
    pub metadata: PackageMetadata<'graph>,
    pub max_priority: usize,
}

impl<'graph, 'stats> TrialGroup<'graph, 'stats> {
    pub(crate) fn from_test(group: TestGroup<'graph>, statistics: &'stats Statistics) -> Self {
        let mut trials = Vec::with_capacity(group.cases.len());
        let mut max_priority = usize::MIN;

        for case in group.cases {
            let trial = Trial::from_test(case, statistics);
            max_priority = max_priority.max(trial.suite.priority());
            trials.push(trial);
        }

        trials.sort_unstable_by_key(|trial| Reverse(trial.suite.priority()));

        Self {
            metadata: group.entry.metadata,
            ignore: false,
            max_priority,
            trials,
        }
    }

    pub(crate) fn filter(&mut self, filterset: &Filterset, context: EvalContext) {
        let binary_id = RustBinaryId::from_parts(
            self.metadata.name(),
            &RustTestBinaryKind::TEST,
            "compiletest",
        );

        let binary_query = BinaryQuery {
            package_id: self.metadata.id(),
            binary_id: &binary_id,
            binary_name: "compiletest",
            kind: &RustTestBinaryKind::TEST,
            platform: BuildPlatform::Target,
        };

        for trial in &mut self.trials {
            trial.filter(filterset, context, binary_query);
        }

        if self.trials.is_empty() || self.trials.iter().all(|trial| trial.ignore) {
            self.ignore = true;
        }
    }

    pub(crate) fn list(&self, mut output: impl io::Write, format: OutputFormat) -> io::Result<()> {
        for trial in &self.trials {
            trial.list(&mut output, self.metadata.name(), self.ignore, format)?;
            writeln!(output)?;
        }

        Ok(())
    }

    pub(crate) const fn len(&self) -> usize {
        self.trials.len()
    }

    pub(crate) fn ignored(&self) -> usize {
        if self.ignore {
            self.trials.len()
        } else {
            self.trials.iter().filter(|trial| trial.ignore).count()
        }
    }

    #[tracing::instrument(skip_all, fields(name = self.metadata.name()))]
    pub(crate) fn run(&self, context: &TrialContext) -> Vec<Report<[TrialError]>> {
        if self.ignore {
            return Vec::new();
        }

        // We're making use of rayon here, instead of just `thread::scope` so that we don't spam
        // 1000 threads.

        // We collect to a `Vec` so we can estimate how many were successful and how many were
        // not
        self.trials
            .par_iter()
            .filter_map(|trial| {
                match panic::catch_unwind(|| trial.run(&self.metadata, context).err()) {
                    Err(panic) => Some(
                        Report::new(TrialError::AssertionFailed {
                            message: panic_payload_as_str(panic),
                        })
                        .attach_opaque(TrialDescription {
                            package: self.metadata.name().to_owned(),
                            namespace: trial.namespace.clone(),
                            name: trial.annotations.directive.name.clone(),
                        })
                        .expand(),
                    ),
                    Ok(error) => error,
                }
            })
            .collect()
    }
}
