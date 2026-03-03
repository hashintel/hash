use hashql_ast::{
    format::SyntaxDump as _, lowering::special_form_expander::SpecialFormExpander,
    node::expr::Expr, visit::Visitor as _,
};

use super::{RunContext, Suite, SuiteDiagnostic, common::process_issues};

pub(crate) struct AstLoweringSpecialFormExpanderSuite;

impl Suite for AstLoweringSpecialFormExpanderSuite {
    fn name(&self) -> &'static str {
        "ast/lowering/special-form-expander"
    }

    fn description(&self) -> &'static str {
        "Special form and macro expansion in the AST"
    }

    fn run<'heap>(
        &self,
        RunContext {
            heap, diagnostics, ..
        }: RunContext<'_, 'heap>,
        mut expr: Expr<'heap>,
    ) -> Result<String, SuiteDiagnostic> {
        let mut expander = SpecialFormExpander::new(heap);

        expander.visit_expr(&mut expr);

        process_issues(diagnostics, expander.take_diagnostics())?;

        Ok(expr.syntax_dump_to_string())
    }
}
