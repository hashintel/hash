use core::fmt::Write as _;

use hashql_ast::node::expr::Expr;
use hashql_core::{
    collection::FastHashMap,
    heap::Heap,
    literal::{IntegerLiteral, LiteralKind, StringLiteral},
    module::ModuleRegistry,
    pretty::{PrettyOptions, PrettyPrint as _},
    r#type::environment::Environment,
    value::{List, Opaque, Struct, Value},
};
use hashql_eval::graph::read::{FilterSlice, GraphReadCompiler};
use hashql_hir::{intern::Interner, node::Node, visit::Visitor as _};

use super::{Suite, SuiteDiagnostic};
use crate::suite::common::{Header, process_result, process_status};

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

        let result = hashql_ast::lowering::lower(
            heap.intern_symbol("::main"),
            &mut expr,
            &environment,
            &registry,
        );
        let types = process_status(diagnostics, result)?;

        let interner = Interner::new(heap);
        let node = process_status(
            diagnostics,
            Node::from_ast(expr, &environment, &interner, &types),
        )?;

        let node = process_status(
            diagnostics,
            hashql_hir::lower::lower(node, &types, &mut environment, &registry, &interner),
        )?;

        let _ = writeln!(
            output,
            "{}\n\n{}",
            Header::new("HIR"),
            node.pretty_print(&environment, PrettyOptions::default().without_color())
        );

        let user_id_value = Value::Opaque(Opaque::new(
            heap.intern_symbol("::graph::types::knowledge::entity::EntityUuid"),
            Value::Opaque(Opaque::new(
                heap.intern_symbol("::core::uuid::Uuid"),
                Value::Primitive(LiteralKind::String(StringLiteral {
                    value: heap.intern_symbol("e2851dbb-7376-4959-9bca-f72cafc4448f"),
                })),
            )),
        ));

        let mut inputs = FastHashMap::default();
        inputs.insert(
            heap.intern_symbol("example_integer"),
            Value::Primitive(LiteralKind::Integer(IntegerLiteral {
                value: heap.intern_symbol("42"),
            })),
        );
        inputs.insert(heap.intern_symbol("user_id"), user_id_value.clone());
        inputs.insert(
            heap.intern_symbol("user"),
            Value::Struct(Struct::from_fields(
                heap,
                [(heap.intern_symbol("id"), user_id_value.clone())],
            )),
        );
        inputs.insert(
            heap.intern_symbol("user_ids"),
            Value::List(List::from_values([user_id_value])),
        );

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
