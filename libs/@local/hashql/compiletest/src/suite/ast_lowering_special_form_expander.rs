use hashql_ast::{
    format::SyntaxDump as _, heap::Heap, lowering::special_form_expander::SpecialFormExpander,
    node::expr::Expr, visit::Visitor as _,
};
use hashql_diagnostics::category::DiagnosticCategory;

use super::{Suite, SuiteDiagnostic};

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

        let mut reported = expander.take_diagnostics();
        if let Some(last) = reported.pop() {
            diagnostics.extend(reported.into_iter().map(|diagnostic| {
                diagnostic
                    .map_category(|category| Box::new(category) as Box<dyn DiagnosticCategory>)
            }));

            return Err(
                last.map_category(|category| Box::new(category) as Box<dyn DiagnosticCategory>)
            );
        }

        Ok(expr.syntax_dump_to_string())
    }
}
