use hashql_ast::{
    format::SyntaxDump as _,
    lower::{expander::Expander, sanitizer::Sanitizer},
    node::expr::Expr,
    visit::Visitor as _,
};
use hashql_core::{
    heap::Scratch,
    module::{ModuleRegistry, namespace::ModuleNamespace},
    r#type::environment::Environment,
};

use super::{RunContext, Suite, SuiteDiagnostic, common::process_issues};

pub(crate) struct AstLowerSanitizerSuite;

impl Suite for AstLowerSanitizerSuite {
    fn name(&self) -> &'static str {
        "ast/lower/sanitizer"
    }

    fn description(&self) -> &'static str {
        "AST structure validation and sanitization"
    }

    fn run<'heap>(
        &self,
        RunContext {
            heap, diagnostics, ..
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
        process_issues(diagnostics, expander.take_diagnostics())?;

        let mut sanitizer = Sanitizer::new();
        sanitizer.visit_expr(&mut expr);

        process_issues(diagnostics, sanitizer.take_diagnostics())?;

        Ok(expr.syntax_dump_to_string())
    }
}
