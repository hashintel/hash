use core::fmt::Write as _;

use hashql_ast::node::expr::Expr;
use hashql_core::{
    collections::FastHashMap,
    module::ModuleRegistry,
    pretty::{Formatter, RenderOptions},
    r#type::{TypeFormatterOptions, environment::Environment},
    value::{self, List, Opaque, Primitive, Struct, Value},
};
use hashql_eval::graph::read::{FilterSlice, GraphReadCompiler};
use hashql_hir::{
    context::HirContext,
    intern::Interner,
    node::NodeData,
    pretty::{NodeFormatter, NodeFormatterOptions},
    visit::Visitor as _,
};

use super::{RunContext, Suite, SuiteDiagnostic};
use crate::suite::common::{Header, process_status};

pub(crate) struct EvalGraphReadEntitySuite;

impl Suite for EvalGraphReadEntitySuite {
    fn name(&self) -> &'static str {
        "eval/graph/read/entity"
    }

    fn run<'heap>(
        &self,
        RunContext {
            heap, diagnostics, ..
        }: RunContext<'_, 'heap>,
        mut expr: Expr<'heap>,
    ) -> Result<String, SuiteDiagnostic> {
        let mut environment = Environment::new(heap);
        let registry = ModuleRegistry::new(&environment);
        let interner = Interner::new(heap);
        let mut context = HirContext::new(&interner, &registry);

        let mut output = String::new();

        let result = hashql_ast::lowering::lower(
            heap.intern_symbol("::main"),
            &mut expr,
            &environment,
            &registry,
        );
        let types = process_status(diagnostics, result)?;

        let node = process_status(diagnostics, NodeData::from_ast(expr, &mut context, &types))?;
        let node = process_status(
            diagnostics,
            hashql_hir::lower::lower(node, &types, &mut environment, &mut context),
        )?;

        let formatter = Formatter::new(heap);
        let mut formatter = NodeFormatter::new(
            &formatter,
            &environment,
            &context,
            NodeFormatterOptions {
                r#type: TypeFormatterOptions::terse(),
            },
        );

        let _ = writeln!(
            output,
            "{}\n\n{}",
            Header::new("HIR"),
            formatter.render(node, RenderOptions::default().with_plain()),
        );

        let user_id_value = Value::Opaque(Opaque::new(
            heap.intern_symbol("::graph::types::knowledge::entity::EntityUuid"),
            Value::Opaque(Opaque::new(
                heap.intern_symbol("::core::uuid::Uuid"),
                Value::Primitive(Primitive::String(value::String::new(
                    heap.intern_symbol("e2851dbb-7376-4959-9bca-f72cafc4448f"),
                ))),
            )),
        ));

        let mut inputs = FastHashMap::default();
        inputs.insert(
            heap.intern_symbol("example_integer"),
            Value::Primitive(Primitive::Integer(value::Integer::new_unchecked(
                heap.intern_symbol("42"),
            ))),
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
        compiler.visit_node(node);
        let residual = process_status(diagnostics, compiler.finish())?;

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
