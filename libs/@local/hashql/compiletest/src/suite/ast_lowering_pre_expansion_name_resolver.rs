use hashql_ast::{
    format::SyntaxDump as _, lowering::pre_expansion_name_resolver::PreExpansionNameResolver,
    node::expr::Expr, visit::Visitor as _,
};
use hashql_core::{module::ModuleRegistry, r#type::environment::Environment};

use super::{RunContext, Suite, SuiteDiagnostic};

pub(crate) struct AstLoweringNameResolverSuite;

impl Suite for AstLoweringNameResolverSuite {
    fn name(&self) -> &'static str {
        "ast/lowering/pre-expansion-name-resolver"
    }

    fn run<'heap>(
        &self,
        RunContext { heap, .. }: RunContext<'_, 'heap>,
        mut expr: Expr<'heap>,
    ) -> Result<String, SuiteDiagnostic> {
        let environment = Environment::new(heap);
        let registry = ModuleRegistry::new(&environment);

        let mut resolver = PreExpansionNameResolver::new(&registry);

        resolver.visit_expr(&mut expr);

        Ok(expr.syntax_dump_to_string())
    }
}
