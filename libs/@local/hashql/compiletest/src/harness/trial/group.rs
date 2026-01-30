use guppy::graph::{PackageMetadata, cargo::BuildPlatform};
use nextest_filtering::{BinaryQuery, EvalContext, Filterset};
use nextest_metadata::{RustBinaryId, RustTestBinaryKind};

use super::{set::TrialSet, trial::Trial};
use crate::harness::test::TestGroup;

pub struct TrialGroup<'graph> {
    pub ignore: bool,
    pub trials: Vec<Trial>,
    pub metadata: PackageMetadata<'graph>,
}

impl<'graph> TrialGroup<'graph> {
    pub(crate) fn from_test(group: TestGroup<'graph>) -> Self {
        let mut trials = Vec::with_capacity(group.cases.len());

        for case in group.cases {
            trials.push(Trial::from_test(case));
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

    pub(crate) fn into_set<'this>(&'this self, set: &mut TrialSet<'this, 'graph>) -> bool {
        let mut ignore = true;

        for trial in &self.trials {
            if trial.include() {
                set.push(self, trial);
                ignore = false;
            }
        }

        !ignore
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
}
