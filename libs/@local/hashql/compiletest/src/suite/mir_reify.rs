use hashql_ast::node::expr::Expr;
use hashql_core::{
    heap::Heap, id::IdVec, module::ModuleRegistry, span::SpanId, r#type::environment::Environment,
};
use hashql_hir::{context::HirContext, node::NodeData};
use hashql_mir::{
    body::Body,
    def::{DefId, DefIdVec},
    intern::Interner,
    pretty::TextFormat,
};

use super::{Suite, SuiteDiagnostic, common::process_status};

pub(crate) fn mir_reify<'heap>(
    heap: &'heap Heap,
    mut expr: Expr<'heap>,
    interner: &Interner<'heap>,
    environment: &mut Environment<'heap>,
    diagnostics: &mut Vec<SuiteDiagnostic>,
) -> Result<(DefId, DefIdVec<Body<'heap>>), SuiteDiagnostic> {
    let registry = ModuleRegistry::new(environment);
    let hir_interner = hashql_hir::intern::Interner::new(heap);
    let mut context = HirContext::new(&hir_interner, &registry);

    let result = hashql_ast::lowering::lower(
        heap.intern_symbol("::main"),
        &mut expr,
        environment,
        context.modules,
    );
    let types = process_status(diagnostics, result)?;

    let node = process_status(diagnostics, NodeData::from_ast(expr, &mut context, &types))?;

    let node = process_status(
        diagnostics,
        hashql_hir::lower::lower(node, &types, environment, &mut context),
    )?;

    let mut bodies = IdVec::new();
    let root = process_status(
        diagnostics,
        hashql_mir::reify::from_hir(
            node,
            &mut hashql_mir::reify::ReifyContext {
                bodies: &mut bodies,
                interner,
                environment,
                hir: &context,
                heap,
            },
        ),
    )?;

    Ok((root, bodies))
}

pub(crate) struct MirReifySuite;

impl Suite for MirReifySuite {
    fn name(&self) -> &'static str {
        "mir/reify"
    }

    fn run<'heap>(
        &self,
        heap: &'heap Heap,
        expr: Expr<'heap>,
        diagnostics: &mut Vec<SuiteDiagnostic>,
    ) -> Result<String, SuiteDiagnostic> {
        let mut environment = Environment::new(SpanId::SYNTHETIC, heap);
        let interner = Interner::new(heap);

        let (root, bodies) = mir_reify(heap, expr, &interner, &mut environment, diagnostics)?;

        let mut format = TextFormat {
            writer: Vec::new(),
            indent: 4,
            sources: bodies.as_slice(),
        };
        format
            .format(&bodies, &[root])
            .expect("should be able to write bodies");

        let output = String::from_utf8_lossy_owned(format.writer);
        Ok(output)
    }
}
