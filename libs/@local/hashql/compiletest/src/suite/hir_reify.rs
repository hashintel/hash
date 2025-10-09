use hashql_ast::{
    lowering::{ExtractedTypes, lower},
    node::expr::Expr,
};
use hashql_core::{
    heap::Heap,
    module::ModuleRegistry,
    pretty::{PrettyOptions, PrettyPrint as _},
    span::SpanId,
    r#type::environment::Environment,
};
use hashql_hir::{
    context::HirContext, intern::Interner, node::Node, pretty::PrettyPrintEnvironment,
};

use super::{Suite, SuiteDiagnostic, common::process_status};

pub(crate) fn hir_reify<'heap>(
    heap: &'heap Heap,
    mut expr: Expr<'heap>,
    environment: &Environment<'heap>,
    context: &mut HirContext<'_, 'heap>,
    diagnostics: &mut Vec<SuiteDiagnostic>,
) -> Result<(Node<'heap>, ExtractedTypes<'heap>), SuiteDiagnostic> {
    let result = lower(
        heap.intern_symbol("::main"),
        &mut expr,
        environment,
        context.modules,
    );
    let types = process_status(diagnostics, result)?;

    let node = process_status(diagnostics, Node::from_ast(expr, context, &types))?;
    Ok((node, types))
}

pub(crate) struct HirReifySuite;

impl Suite for HirReifySuite {
    fn name(&self) -> &'static str {
        "hir/reify"
    }

    fn run<'heap>(
        &self,
        heap: &'heap Heap,
        expr: Expr<'heap>,
        diagnostics: &mut Vec<SuiteDiagnostic>,
    ) -> Result<String, SuiteDiagnostic> {
        let environment = Environment::new(SpanId::SYNTHETIC, heap);
        let registry = ModuleRegistry::new(&environment);
        let interner = Interner::new(heap);
        let mut context = HirContext::new(&interner, &registry);

        let (node, _) = hir_reify(heap, expr, &environment, &mut context, diagnostics)?;

        Ok(node
            .pretty_print(
                &PrettyPrintEnvironment {
                    env: &environment,
                    symbols: &context.symbols,
                },
                PrettyOptions::default().without_color(),
            )
            .to_string())
    }
}
