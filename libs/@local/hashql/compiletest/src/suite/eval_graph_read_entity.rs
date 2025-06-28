use core::fmt::Write as _;

use hashql_ast::node::expr::Expr;
use hashql_core::{
    collection::FastHashMap,
    heap::Heap,
    module::ModuleRegistry,
    pretty::{PrettyOptions, PrettyPrint as _},
    r#type::environment::Environment,
};
use hashql_eval::graph::read::{FilterSlice, GraphReadCompiler};
use hashql_hir::{intern::Interner, node::Node, visit::Visitor as _};

use super::{Suite, SuiteDiagnostic};
use crate::suite::common::{Header, process_diagnostics, process_result};

pub(crate) struct EvalGraphReadEntitySuite;

impl Suite for EvalGraphReadEntitySuite {
    fn name(&self) -> &'static str {
        "eval/graph/read/entity"
    }

    fn run<'heap>(
        &self,
        heap: &'heap Heap,
        mut expr: Expr<'heap>,
        diagnostics: &mut Vec<SuiteDiagnostic>,
    ) -> Result<String, SuiteDiagnostic> {
        let mut environment = Environment::new(expr.span, heap);
        let registry = ModuleRegistry::new(&environment);
        let mut output = String::new();

        let (types, lower_diagnostics) = hashql_ast::lowering::lower(
            heap.intern_symbol("::main"),
            &mut expr,
            &environment,
            &registry,
        );

        process_diagnostics(diagnostics, lower_diagnostics)?;

        let interner = Interner::new(heap);
        let (node, reify_diagnostics) = Node::from_ast(expr, &environment, &interner, &types);
        process_diagnostics(diagnostics, reify_diagnostics)?;

        let node = node.expect("should be `Some` if there are non-fatal errors");

        let node = process_result(
            diagnostics,
            hashql_hir::lower::lower(node, &types, &mut environment, &registry, &interner),
        )?;

        let _ = writeln!(
            output,
            "{}\n\n{}",
            Header::new("HIR"),
            node.pretty_print(&environment, PrettyOptions::default().without_color())
        );

        // TODO: currently we don't support any inputs in tests
        let inputs = FastHashMap::default();

        let mut compiler = GraphReadCompiler::new(heap, &inputs);
        compiler.visit_node(&node);
        let residual = process_result(diagnostics, compiler.finish())?;

        let FilterSlice::Entity { range } = residual.output[&node.id].clone();

        let filters = residual.filters.entity(range);

        #[expect(clippy::use_debug)]
        let _ = writeln!(
            output,
            "\n{}\n\n{:#?}",
            Header::new("Entity Filter"),
            filters
        );

        Ok(output)
    }
}
