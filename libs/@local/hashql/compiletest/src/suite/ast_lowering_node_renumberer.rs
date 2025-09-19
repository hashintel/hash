use hashql_ast::{
    format::SyntaxDump as _,
    lowering::{
        node_renumberer::NodeRenumberer, pre_expansion_name_resolver::PreExpansionNameResolver,
        special_form_expander::SpecialFormExpander,
    },
    node::expr::Expr,
    visit::Visitor as _,
};
use hashql_core::{
    heap::Heap, module::ModuleRegistry, span::SpanId, r#type::environment::Environment,
};

use super::{Suite, SuiteDiagnostic, common::process_issues};

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
        let environment = Environment::new(SpanId::SYNTHETIC, heap);
        let registry = ModuleRegistry::new(&environment);

        let mut resolver = PreExpansionNameResolver::new(&registry);

        resolver.visit_expr(&mut expr);

        let mut expander = SpecialFormExpander::new(heap);
        expander.visit_expr(&mut expr);

        process_issues(diagnostics, expander.take_diagnostics())?;

        let mut renumberer = NodeRenumberer::new();
        renumberer.visit_expr(&mut expr);

        Ok(expr.syntax_dump_to_string())
    }
}
