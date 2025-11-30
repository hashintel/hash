use hashql_ast::{
    lowering::{ExtractedTypes, lower},
    node::expr::Expr,
};
use hashql_core::{
    heap::Heap,
    module::ModuleRegistry,
    pretty::{Formatter, RenderOptions},
    r#type::environment::Environment,
};
use hashql_hir::{
    context::HirContext,
    intern::Interner,
    node::{Node, NodeData},
    pretty::NodeFormatter,
};

use super::{RunContext, Suite, SuiteDiagnostic, common::process_status};

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

    let node = process_status(diagnostics, NodeData::from_ast(expr, context, &types))?;
    Ok((node, types))
}

pub(crate) struct HirReifySuite;

impl Suite for HirReifySuite {
    fn name(&self) -> &'static str {
        "hir/reify"
    }

    fn run<'heap>(
        &self,
        RunContext {
            heap, diagnostics, ..
        }: RunContext<'_, 'heap>,
        expr: Expr<'heap>,
    ) -> Result<String, SuiteDiagnostic> {
        let environment = Environment::new(heap);
        let registry = ModuleRegistry::new(&environment);
        let interner = Interner::new(heap);
        let mut context = HirContext::new(&interner, &registry);

        let (node, _) = hir_reify(heap, expr, &environment, &mut context, diagnostics)?;

        let formatter = Formatter::new(heap);
        let mut formatter = NodeFormatter::with_defaults(&formatter, &environment, &context);

        Ok(formatter
            .render(node, RenderOptions::default().with_plain())
            .to_string())
    }
}
