use hashql_ast::{
    format::SyntaxDump as _, lowering::special_form_expander::SpecialFormExpander,
    node::expr::Expr, visit::Visitor as _,
};
use hashql_core::heap::Heap;

use super::{Suite, SuiteDiagnostic, common::process_issues};

pub(crate) struct AstLoweringSpecialFormExpanderSuite;

impl Suite for AstLoweringSpecialFormExpanderSuite {
    fn name(&self) -> &'static str {
        "ast/lowering/special-form-expander"
    }

    fn run<'heap>(
        &self,
        heap: &'heap Heap,
        mut expr: Expr<'heap>,
        diagnostics: &mut Vec<SuiteDiagnostic>,
    ) -> Result<String, SuiteDiagnostic> {
        let mut expander = SpecialFormExpander::new(heap);

        expander.visit_expr(&mut expr);

        process_issues(diagnostics, expander.take_diagnostics())?;

        Ok(expr.syntax_dump_to_string())
    }
}
