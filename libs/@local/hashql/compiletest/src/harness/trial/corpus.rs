use std::thread;

use guppy::graph::PackageGraph;
use nextest_filtering::{CompiledExpr, EvalContext, Filterset, FiltersetKind, ParseContext};

use super::{group::TrialGroup, set::TrialSet};
use crate::harness::test::TestCorpus;

pub struct TrialCorpus<'graph> {
    pub groups: Vec<TrialGroup<'graph>>,
}

impl<'graph> TrialCorpus<'graph> {
    pub(crate) fn from_test(corpus: TestCorpus<'graph>) -> Self {
        let groups: Vec<_> = thread::scope(|scope| {
            let mut handles = Vec::new();

            for group in corpus.groups {
                let handle = scope.spawn(|| TrialGroup::from_test(group));
                handles.push(handle);
            }

            handles
                .into_iter()
                .map(|handle| handle.join().expect("should be able to join thread"))
                .collect()
        });

        Self { groups }
    }

    pub(crate) fn into_set(&self) -> TrialSet {
        let mut set = TrialSet::new();

        for group in &self.groups {
            group.into_set(&mut set);
        }

        set
    }

    pub(crate) fn filter(&mut self, filter: String, graph: &'graph PackageGraph) {
        let context = ParseContext::new(graph);

        let filterset = Filterset::parse(filter, &context, FiltersetKind::Test)
            .expect("should be a valid filterset expression");

        let context = EvalContext {
            default_filter: &CompiledExpr::ALL,
        };

        for group in &mut self.groups {
            group.filter(&filterset, context);
        }
    }

    pub(crate) fn len(&self) -> usize {
        self.groups.iter().map(TrialGroup::len).sum()
    }

    pub(crate) fn ignored(&self) -> usize {
        self.groups.iter().map(TrialGroup::ignored).sum()
    }
}
