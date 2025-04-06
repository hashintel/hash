use hashql_ast::{
    format::SyntaxDump as _, heap::Heap, lowering::name_resolver::NameResolver, node::expr::Expr,
    visit::Visitor as _,
};

use super::{Suite, SuiteDiagnostic};

pub(crate) struct AstLoweringNameResolverSuite;

impl Suite for AstLoweringNameResolverSuite {
    fn name(&self) -> &'static str {
        "ast/lowering/name-resolver"
    }

    fn run<'heap>(
        &self,
        heap: &'heap Heap,
        mut expr: Expr<'heap>,
        _: &mut Vec<SuiteDiagnostic>,
    ) -> Result<String, SuiteDiagnostic> {
        let mut resolver = NameResolver::new(heap);
        resolver.prefill();

        resolver.visit_expr(&mut expr);

        Ok(expr.syntax_dump_to_string())
    }
}
