use hashql_ast::{
    format::SyntaxDump as _,
    lowering::{
        node_renumberer::NodeRenumberer, pre_expansion_name_resolver::PreExpansionNameResolver,
        special_form_expander::SpecialFormExpander,
    },
    node::expr::Expr,
    visit::Visitor as _,
};
use hashql_core::{module::ModuleRegistry, r#type::environment::Environment};

use super::{RunContext, Suite, SuiteDiagnostic, common::process_issues};

pub(crate) struct AstLoweringNodeRenumbererSuite;

impl Suite for AstLoweringNodeRenumbererSuite {
    fn name(&self) -> &'static str {
        "ast/lowering/node-renumberer"
    }

    fn description(&self) -> &'static str {
        "Sequential node ID assignment in the AST"
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

        let mut renumberer = NodeRenumberer::new();
        renumberer.visit_expr(&mut expr);

        Ok(expr.syntax_dump_to_string())
    }
}
