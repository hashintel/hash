use std::{fs::File, path::PathBuf, thread};

use guppy::{
    PackageId,
    graph::{DependencyDirection, PackageGraph, cargo::BuildPlatform},
};
use nextest_filtering::{
    BinaryQuery, CompiledExpr, EvalContext, Filterset, FiltersetKind, ParseContext, TestQuery,
};
use nextest_metadata::{RustBinaryId, RustTestBinaryKind};
use rayon::iter::{IntoParallelRefIterator, ParallelIterator};

use crate::{
    FileAnnotations, Suite, TestCase, TestGroup, annotation::directive::RunMode, suite::suite,
};

pub(crate) struct Trial {
    suite: &'static dyn Suite,
    path: PathBuf,
    ignore: bool,
    annotations: FileAnnotations,
}

impl Trial {
    fn from_test(case: TestCase) -> Self {
        let suite = suite(&case.spec.suite).expect("suite should be available");

        let file = File::open_buffered(&case.path).expect("should be able to open file");
        let mut annotations = FileAnnotations::new(
            case.path
                .file_stem()
                .expect("path should have file stem")
                .to_str()
                .expect("path name should be valid utf-8"),
        );

        annotations
            .parse_file(file, false)
            .expect("should be able to parse file");

        Self {
            suite,
            path: case.path,
            ignore: matches!(annotations.directive.run, RunMode::Skip { .. }),
            annotations,
        }
    }

    fn filter(&mut self, filterset: &Filterset, context: EvalContext, binary_query: BinaryQuery) {
        let matches = filterset.matches_test(
            &TestQuery {
                binary_query,
                test_name: &self.annotations.directive.name,
            },
            &context,
        );

        self.ignore = !matches;
    }

    fn run(&self) -> Result<(), ()> {
        if self.ignore {
            return Ok(());
        }

        todo!()
    }
}

pub(crate) struct TrialGroup<'graph> {
    id: &'graph PackageId,
    name: String, // resolve the name to a proper Package
    ignore: bool,
    trials: Vec<Trial>,
}

impl<'graph> TrialGroup<'graph> {
    fn from_test(group: TestGroup, graph: &'graph PackageGraph) -> Self {
        let mut trials = Vec::with_capacity(group.cases.len());

        for case in group.cases {
            trials.push(Trial::from_test(case));
        }

        let package_id = graph
            .resolve_package_name(&group.entry.krate)
            .root_ids(DependencyDirection::Forward)
            .next()
            .expect("should be able to resolve package name");

        Self {
            id: package_id,
            name: group.entry.krate,
            ignore: false,
            trials,
        }
    }

    fn filter(&mut self, filterset: &Filterset, context: EvalContext) {
        let binary_id =
            RustBinaryId::from_parts(&self.name, &RustTestBinaryKind::TEST, "compiletest");

        let binary_query = BinaryQuery {
            package_id: self.id,
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

    fn run(&self) -> Result<(), ()> {
        if self.ignore {
            return Ok(());
        }

        self.trials.par_iter().map(Trial::run).collect()
    }
}

pub(crate) struct TrialSet<'graph> {
    groups: Vec<TrialGroup<'graph>>,
}

impl<'graph> TrialSet<'graph> {
    pub(crate) fn from_test(groups: Vec<TestGroup>, graph: &'graph PackageGraph) -> Self {
        let groups = thread::scope(|scope| {
            let mut handles = Vec::new();

            for group in groups {
                let handle = scope.spawn(|| TrialGroup::from_test(group, graph));
                handles.push(handle);
            }

            handles
                .into_iter()
                .map(|handle| handle.join().expect("should be able to join thread"))
                .collect()
        });

        Self { groups }
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

    pub(crate) fn run(&self) -> Result<(), ()> {
        thread::scope(|scope| {
            let mut handles = Vec::new();

            for group in &self.groups {
                let handle = scope.spawn(|| group.run());
                handles.push(handle);
            }

            handles
                .into_iter()
                .try_for_each(|handle| handle.join().expect("should be able to join thread"))
        })
    }
}
