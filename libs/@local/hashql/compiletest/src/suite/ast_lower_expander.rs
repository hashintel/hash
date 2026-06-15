use error_stack::ReportSink;
use hashql_ast::{
    self, format::SyntaxDump as _, lower::expander::Expander, node::expr::Expr, visit::Visitor as _,
};
use hashql_core::{
    heap::Scratch,
    module::{ModuleRegistry, namespace::ModuleNamespace},
    r#type::environment::Environment,
};
use hashql_diagnostics::Diagnostic;

use super::{RunContext, Suite, SuiteDiagnostic, SuiteDirectives, common::process_issues};
use crate::harness::trial::TrialError;

fn should_continue(
    this: &impl Suite,
    directives: &SuiteDirectives,
    reports: &mut ReportSink<TrialError>,
) -> bool {
    let Some(r#continue) = directives.get("continue") else {
        return false;
    };

    let Some(r#continue) = r#continue.as_bool() else {
        reports.capture(TrialError::Run(
            this.name(),
            "suite#continue must be a valid boolean",
        ));

        return false;
    };

    r#continue
}

pub(crate) struct AstLowerExpanderSuite;

impl Suite for AstLowerExpanderSuite {
    fn name(&self) -> &'static str {
        "ast/lower/expander"
    }

    fn description(&self) -> &'static str {
        "Expansion of special forms in the AST"
    }

    fn run<'heap>(
        &self,
        RunContext {
            heap,
            diagnostics,
            suite_directives,
            reports,
            ..
        }: RunContext<'_, 'heap>,
        mut expr: Expr<'heap>,
    ) -> Result<String, SuiteDiagnostic> {
        let environment = Environment::new(heap);
        let registry = ModuleRegistry::new(&environment);
        let mut scratch = Scratch::new();

        let mut namespace = ModuleNamespace::new(&registry);
        namespace.import_prelude();

        let mut expander = Expander::new(namespace, &mut scratch);
        expander.visit_expr(&mut expr);

        if should_continue(self, suite_directives, reports) {
            diagnostics.extend(expander.take_diagnostics().map(Diagnostic::boxed));
        } else {
            process_issues(diagnostics, expander.take_diagnostics())?;
        }

        Ok(expr.syntax_dump_to_string())
    }
}
