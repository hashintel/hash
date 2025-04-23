use hashql_ast::{
    format::SyntaxDump as _, lowering::pre_expansion_name_resolver::PreExpansionNameResolver,
    node::expr::Expr, visit::Visitor as _,
};
use hashql_core::heap::Heap;

use super::{Suite, SuiteDiagnostic};

pub(crate) struct AstLoweringNameResolverSuite;

impl Suite for AstLoweringNameResolverSuite {
    fn name(&self) -> &'static str {
        "ast/lowering/pre-expansion-name-resolver"
    }

    fn run<'heap>(
        &self,
        heap: &'heap Heap,
        mut expr: Expr<'heap>,
        _: &mut Vec<SuiteDiagnostic>,
    ) -> Result<String, SuiteDiagnostic> {
        let mut resolver = PreExpansionNameResolver::new(heap);
        resolver.prefill();

        resolver.visit_expr(&mut expr);

        Ok(expr.syntax_dump_to_string())
    }
}
