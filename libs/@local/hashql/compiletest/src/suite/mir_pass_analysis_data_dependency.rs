use std::io::Write as _;

use hashql_ast::node::expr::Expr;
use hashql_core::r#type::environment::Environment;
use hashql_diagnostics::DiagnosticIssues;
use hashql_mir::{
    context::MirContext,
    intern::Interner,
    pass::{AnalysisPass as _, analysis::DataDependencyAnalysis},
};

use super::{RunContext, Suite, SuiteDiagnostic};
use crate::suite::{
    common::{Header, process_issues},
    mir_reify::{mir_format_text, mir_reify},
};

pub(crate) struct MirPassAnalysisDataDependency;

impl Suite for MirPassAnalysisDataDependency {
    fn name(&self) -> &'static str {
        "mir/pass/analysis/data-dependency"
    }

    fn description(&self) -> &'static str {
        "Data dependency analysis on the MIR"
    }

    fn run<'heap>(
        &self,
        RunContext {
            heap, diagnostics, ..
        }: RunContext<'_, 'heap>,
        expr: Expr<'heap>,
    ) -> Result<String, SuiteDiagnostic> {
        let mut environment = Environment::new(heap);
        let interner = Interner::new(heap);

        let mut buffer = Vec::new();

        let (root, mut bodies) = mir_reify(heap, expr, &interner, &mut environment, diagnostics)?;

        writeln!(buffer, "{}\n", Header::new("MIR")).expect("should be able to write to buffer");
        mir_format_text(heap, &environment, &mut buffer, root, &bodies);

        let mut context = MirContext {
            heap,
            env: &environment,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        };

        let body = &mut bodies[root];
        let mut analysis = DataDependencyAnalysis::new();
        analysis.run(&mut context, body);
        let graph = analysis.finish();
        let transient = graph.transient(&interner);

        let _ = writeln!(
            buffer,
            "\n{}\n\n{}\n\n{}\n\n{}",
            Header::new("Data Dependency Graph"),
            graph,
            Header::new("Transient Data Dependency Graph"),
            transient,
        );

        process_issues(diagnostics, context.diagnostics)?;

        Ok(String::from_utf8_lossy_owned(buffer))
    }
}
