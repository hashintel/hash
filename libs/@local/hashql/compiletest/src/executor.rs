use core::error;
use std::{
    fs::{self, File},
    io::Cursor,
    path::PathBuf,
    sync::Arc,
    thread,
};

use guppy::{
    PackageId,
    graph::{DependencyDirection, PackageGraph, cargo::BuildPlatform},
};
use hashql_ast::heap::Heap;
use hashql_core::span::storage::SpanStorage;
use hashql_syntax_jexpr::Parser;
use nextest_filtering::{
    BinaryQuery, CompiledExpr, EvalContext, Filterset, FiltersetKind, ParseContext, TestQuery,
};
use nextest_metadata::{RustBinaryId, RustTestBinaryKind};
use rayon::iter::{IntoParallelRefIterator, ParallelIterator};

use crate::{
    FileAnnotations, Suite, TestCase, TestGroup, annotation::directive::RunMode, suite::suite,
};

pub(crate) struct TrialContext {
    bless: bool,
}

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

    fn run(
        &self,
        context: &TrialContext,
    ) -> Result<(), Box<dyn error::Error + Send + Sync + 'static>> {
        if self.ignore {
            return Ok(());
        }

        let contents = fs::read_to_string(&self.path)?;
        let cursor = Cursor::new(contents.as_str());

        // Actually load the diagnostics
        let mut annotations = self.annotations.clone();
        annotations.parse_file(cursor, true)?;

        // Parse the content w/ J-Expr
        let heap = Heap::new();
        let spans = Arc::new(SpanStorage::new());
        let parser = Parser::new(&heap, Arc::clone(&spans));

        // failing with `?` here is fine, as it suggests that the test itself is invalid J-Expr.
        let expr = parser.parse_expr(contents.as_bytes())?;

        let mut diagnostics = vec![];

        // we're not at a place where we can no longer just `?` to fail
        let result = self.suite.run(expr, &mut diagnostics);

        // TODO: bless = write the files instead

        // load both stdout and stderr (if they exist)
        let stdout_file = self.path.with_extension("stdout");
        let stderr_file = self.path.with_extension("stderr");

        #[expect(clippy::if_then_some_else_none, reason = "false positive")]
        let stdout = if stdout_file.exists() {
            Some(fs::read_to_string(&stdout_file)?)
        } else {
            None
        };

        #[expect(clippy::if_then_some_else_none, reason = "false positive")]
        let stderr = if stderr_file.exists() {
            Some(fs::read_to_string(&stderr_file)?)
        } else {
            None
        };

        todo!()
    }
}

pub(crate) struct TrialGroup<'graph> {
    id: &'graph PackageId,
    name: String,
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

    fn run(
        &self,
        context: &TrialContext,
    ) -> Result<(), Box<dyn error::Error + Send + Sync + 'static>> {
        if self.ignore {
            return Ok(());
        }

        // First collect the values into a `Vec<_>`. That way we can make sure that we fail-slow
        let results: Vec<_> = self
            .trials
            .par_iter()
            .map(|trial| trial.run(context))
            .collect();

        // ... then check if any of the trials failed
        for result in results {
            result?;
        }

        Ok(())
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

    pub(crate) fn run(
        &self,
        context: &TrialContext,
    ) -> Result<(), Box<dyn error::Error + Send + Sync + 'static>> {
        thread::scope(|scope| {
            let mut handles = Vec::new();

            for group in &self.groups {
                let handle = scope.spawn(|| group.run(context));
                handles.push(handle);
            }

            // First collect the values into a `Vec<_>`. That way we can make sure that we fail-slow
            let results: Vec<_> = handles
                .into_iter()
                .map(|handle| handle.join().expect("should be able to join thread"))
                .collect();

            // ... then process the results to ensure a fail-slow behavior
            for result in results {
                result?;
            }

            Ok(())
        })
    }
}
