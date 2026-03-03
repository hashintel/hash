use core::fmt::Write as _;

use hashql_ast::node::expr::Expr;
use hashql_core::{
    heap::Heap,
    module::ModuleRegistry,
    pretty::{Formatter, RenderOptions},
    r#type::{TypeFormatterOptions, environment::Environment},
};
use hashql_hir::{
    context::HirContext,
    intern::Interner,
    lower::hoist::{GraphHoisting, GraphHoistingConfig},
    node::Node,
    pretty::{NodeFormatter, NodeFormatterOptions},
};

use super::{
    RunContext, Suite, SuiteDiagnostic, hir_lower_alias_replacement::TestOptions,
    hir_lower_normalization::hir_lower_normalization,
};
use crate::suite::common::Header;

pub(crate) fn hir_lower_graph_hoisting<'heap>(
    heap: &'heap Heap,
    expr: Expr<'heap>,
    environment: &mut Environment<'heap>,
    context: &mut HirContext<'_, 'heap>,
    options: &mut TestOptions,
) -> Result<Node<'heap>, SuiteDiagnostic> {
    let node = hir_lower_normalization(heap, expr, environment, context, options)?;

    let hoisting = GraphHoisting::new(context, GraphHoistingConfig::default());
    let node = hoisting.run(node);

    Ok(node)
}

pub(crate) struct HirLowerGraphHoistingSuite;

impl Suite for HirLowerGraphHoistingSuite {
    fn name(&self) -> &'static str {
        "hir/lower/graph-hoisting"
    }

    fn description(&self) -> &'static str {
        "Graph operation hoisting in the HIR"
    }

    fn run<'heap>(
        &self,
        RunContext {
            heap, diagnostics, ..
        }: RunContext<'_, 'heap>,
        expr: Expr<'heap>,
    ) -> Result<String, SuiteDiagnostic> {
        let mut environment = Environment::new(heap);
        let registry = ModuleRegistry::new(&environment);
        let interner = Interner::new(heap);
        let mut context = HirContext::new(&interner, &registry);

        let mut output = String::new();

        let node = hir_lower_graph_hoisting(
            heap,
            expr,
            &mut environment,
            &mut context,
            &mut TestOptions {
                skip_alias_replacement: false,
                output: &mut output,
                diagnostics,
            },
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
            "\n{}\n\n{}",
            Header::new("HIR after graph hoisting"),
            formatter.render(node, RenderOptions::default().with_plain())
        );

        Ok(output)
    }
}
