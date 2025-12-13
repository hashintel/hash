use core::fmt::Write as _;

use hashql_ast::node::expr::Expr;
use hashql_core::{
    collections::HashMapExt as _,
    heap::Heap,
    module::ModuleRegistry,
    pretty::{Formatter, RenderOptions},
    r#type::{
        TypeFormatter, TypeFormatterOptions, environment::Environment, inference::InferenceSolver,
    },
};
use hashql_hir::{
    context::HirContext,
    intern::Interner,
    lower::inference::{TypeInference, TypeInferenceResidual},
    node::{HirIdMap, Node},
    pretty::NodeFormatter,
    visit::{self, Visitor},
};

use super::{
    RunContext, Suite, SuiteDiagnostic,
    common::{Annotated, Header},
    hir_lower_ctor::hir_lower_ctor,
};
use crate::suite::{
    common::{process_issues, process_status},
    hir_lower_alias_replacement::TestOptions,
};

struct HirNodeVisitor<'heap> {
    nodes: HirIdMap<Node<'heap>>,
}

impl<'heap> Visitor<'heap> for HirNodeVisitor<'heap> {
    fn visit_node(&mut self, node: Node<'heap>) {
        self.nodes.insert_unique(node.id, node);

        visit::walk_node(self, node);
    }
}

pub(crate) fn collect_hir_nodes(root: Node<'_>) -> Vec<Node<'_>> {
    let mut visitor = HirNodeVisitor {
        nodes: HirIdMap::default(),
    };

    visitor.visit_node(root);
    let mut nodes: Vec<_> = visitor.nodes.into_values().collect();
    nodes.sort_unstable_by_key(|node| node.id); // ordering for stable results

    nodes
}

pub(crate) fn hir_lower_inference<'env, 'heap>(
    heap: &'heap Heap,
    expr: Expr<'heap>,
    environment: &'env Environment<'heap>,
    context: &mut HirContext<'_, 'heap>,
    options: &mut TestOptions,
) -> Result<
    (
        Node<'heap>,
        InferenceSolver<'env, 'heap>,
        TypeInferenceResidual<'heap>,
    ),
    SuiteDiagnostic,
> {
    let node = hir_lower_ctor(heap, expr, environment, context, options)?;

    let mut inference = TypeInference::new(environment, context);
    inference.visit_node(node);

    let (solver, inference_residual, inference_diagnostics) = inference.finish();
    process_issues(options.diagnostics, inference_diagnostics)?;

    Ok((node, solver, inference_residual))
}

pub(crate) struct HirLowerTypeInferenceSuite;

impl Suite for HirLowerTypeInferenceSuite {
    fn name(&self) -> &'static str {
        "hir/lower/type-inference"
    }

    fn description(&self) -> &'static str {
        "Type inference pass on the HIR"
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

        let (node, solver, _) = hir_lower_inference(
            heap,
            expr,
            &environment,
            &mut context,
            &mut TestOptions {
                skip_alias_replacement: false,
                output: &mut output,
                diagnostics,
            },
        )?;

        let substitution = process_status(diagnostics, solver.solve())?;

        environment.substitution = substitution;

        let formatter = Formatter::new(heap);
        let mut value_formatter = NodeFormatter::with_defaults(&formatter, &environment, &context);
        let mut type_formatter = TypeFormatter::new(
            &formatter,
            &environment,
            TypeFormatterOptions::default().with_resolve_substitutions(true),
        );

        let _ = writeln!(
            output,
            "\n{}\n\n{}",
            Header::new("HIR after type inference"),
            value_formatter.render(node, RenderOptions::default().with_plain())
        );

        let nodes = collect_hir_nodes(node);

        let _ = writeln!(output, "\n{}\n", Header::new("Types"));

        for node in nodes {
            let _ = writeln!(
                output,
                "{}\n",
                Annotated {
                    content: value_formatter.render(node, RenderOptions::default().with_plain()),
                    annotation: type_formatter.render(
                        context.map.type_id(node.id),
                        RenderOptions::default().with_plain()
                    )
                }
            );
        }

        Ok(output)
    }
}
