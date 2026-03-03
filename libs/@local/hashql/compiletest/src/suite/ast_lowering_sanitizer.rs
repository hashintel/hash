use hashql_ast::{
    format::SyntaxDump as _,
    lowering::{
        pre_expansion_name_resolver::PreExpansionNameResolver, sanitizer::Sanitizer,
        special_form_expander::SpecialFormExpander,
    },
    node::expr::Expr,
    visit::Visitor as _,
};
use hashql_core::{module::ModuleRegistry, r#type::environment::Environment};

use super::{RunContext, Suite, SuiteDiagnostic, common::process_issues};

pub(crate) struct AstLoweringSanitizerSuite;

impl Suite for AstLoweringSanitizerSuite {
    fn name(&self) -> &'static str {
        "ast/lowering/sanitizer"
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

        let mut resolver = PreExpansionNameResolver::new(&registry);

        resolver.visit_expr(&mut expr);

        let mut expander = SpecialFormExpander::new(heap);
        expander.visit_expr(&mut expr);

        process_issues(diagnostics, expander.take_diagnostics())?;

        let mut sanitizer = Sanitizer::new();
        sanitizer.visit_expr(&mut expr);

        process_issues(diagnostics, sanitizer.take_diagnostics())?;

        Ok(expr.syntax_dump_to_string())
    }
}
