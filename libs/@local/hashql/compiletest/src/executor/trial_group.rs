use alloc::borrow::Cow;

use error_stack::Report;
use guppy::graph::{PackageMetadata, cargo::BuildPlatform};
use nextest_filtering::{BinaryQuery, EvalContext, Filterset};
use nextest_metadata::{RustBinaryId, RustTestBinaryKind};
use rayon::iter::{IntoParallelRefIterator as _, ParallelIterator as _};
use termtree::Tree;

use super::{TrialContext, TrialError, trial::Trial};
use crate::TestGroup;

pub(crate) struct TrialGroup<'graph> {
    pub ignore: bool,
    pub trials: Vec<Trial>,
    pub metadata: PackageMetadata<'graph>,
    pub progress: prodash::tree::Item,
}

impl<'graph> TrialGroup<'graph> {
    pub(crate) fn from_test(group: TestGroup<'graph>, root: &prodash::tree::Root) -> Self {
        let mut trials = Vec::with_capacity(group.cases.len());

        let mut progress = root.add_child(group.entry.metadata.name());

        for case in group.cases {
            trials.push(Trial::from_test(case, &mut progress));
        }

        Self {
            metadata: group.entry.metadata,
            ignore: false,
            trials,
            progress,
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

    pub(crate) fn list(&self) -> Tree<Cow<str>> {
        let mut tree = Tree::new(Cow::Owned(format!(
            "{}{}",
            self.metadata.name(),
            if self.ignore { " (ignored)" } else { "" }
        )));

        for trial in &self.trials {
            tree.push(trial.list());
        }

        tree
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

    pub(crate) fn run(&self, context: &TrialContext) -> Vec<Result<(), Report<[TrialError]>>> {
        if self.ignore {
            return Vec::new();
        }

        // We're making use of rayon here, instead of just `thread::scope` so that we don't spam
        // 1000 threads.

        // We collect to a `Vec` so we can estimate how many were successful and how many were
        // not
        self.trials
            .par_iter()
            .map(|trial| trial.run(context))
            .collect()
    }
}
