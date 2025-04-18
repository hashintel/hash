use hashql_ast::{
    format::SyntaxDump as _,
    heap::Heap,
    lowering::{
        node_renumberer::NodeRenumberer, pre_expansion_name_resolver::PreExpansionNameResolver,
        special_form_expander::SpecialFormExpander,
    },
    node::expr::Expr,
    visit::Visitor as _,
};

use super::{Suite, SuiteDiagnostic, common::process_diagnostics};

pub(crate) struct AstLoweringNodeRenumbererSuite;

impl Suite for AstLoweringNodeRenumbererSuite {
    fn name(&self) -> &'static str {
        "ast/lowering/node-renumberer"
    }

    fn run<'heap>(
        &self,
        heap: &'heap Heap,
        mut expr: Expr<'heap>,
        diagnostics: &mut Vec<SuiteDiagnostic>,
    ) -> Result<String, SuiteDiagnostic> {
        let mut resolver = PreExpansionNameResolver::new(heap);
        resolver.prefill();

        resolver.visit_expr(&mut expr);

        let mut expander = SpecialFormExpander::new(heap);
        expander.visit_expr(&mut expr);

        process_diagnostics(diagnostics, expander.take_diagnostics())?;

        let mut renumberer = NodeRenumberer::new();
        renumberer.visit_expr(&mut expr);

        Ok(expr.syntax_dump_to_string())
    }
}
