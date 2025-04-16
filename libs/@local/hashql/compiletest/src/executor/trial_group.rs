use std::io;

use error_stack::Report;
use guppy::graph::{PackageMetadata, cargo::BuildPlatform};
use nextest_filtering::{BinaryQuery, EvalContext, Filterset};
use nextest_metadata::{RustBinaryId, RustTestBinaryKind};
use rayon::iter::{IntoParallelRefIterator as _, ParallelIterator as _};

use super::{TrialContext, TrialError, trial::Trial};
use crate::{TestGroup, reporter::Statistics};

pub(crate) struct TrialGroup<'graph> {
    pub ignore: bool,
    pub trials: Vec<Trial>,
    pub metadata: PackageMetadata<'graph>,
}

impl<'graph> TrialGroup<'graph> {
    pub(crate) fn from_test(group: TestGroup<'graph>, statistics: &Statistics) -> Self {
        let mut trials = Vec::with_capacity(group.cases.len());

        for case in group.cases {
            trials.push(Trial::from_test(case, statistics));
        }

        Self {
            metadata: group.entry.metadata,
            ignore: false,
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

    pub(crate) fn list(&self, mut output: impl io::Write) -> io::Result<()> {
        for trial in &self.trials {
            trial.list(&mut output, self.metadata.name(), self.ignore)?;
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
            .filter_map(|trial| trial.run(&self.metadata, context).err())
            .collect()
    }
}
