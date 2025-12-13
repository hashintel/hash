use core::fmt::Write as _;

use hashql_ast::node::expr::Expr;
use hashql_core::{
    module::ModuleRegistry,
    pretty::{Formatter, RenderOptions},
    r#type::environment::Environment,
};
use hashql_hir::{context::HirContext, intern::Interner, pretty::NodeFormatter};

use super::{
    RunContext, Suite, SuiteDiagnostic,
    common::{Annotated, Header},
};
use crate::suite::{
    common::process_status,
    hir_lower_alias_replacement::TestOptions,
    hir_lower_inference::{collect_hir_nodes, hir_lower_inference},
};

pub(crate) struct HirLowerTypeInferenceIntrinsicsSuite;

impl Suite for HirLowerTypeInferenceIntrinsicsSuite {
    fn name(&self) -> &'static str {
        "hir/lower/type-inference/intrinsics"
    }

    fn description(&self) -> &'static str {
        "Type inference for intrinsic functions"
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

        let (node, solver, inference_residual) = hir_lower_inference(
            heap,
            expr,
            &environment,
            &mut context,
            &mut TestOptions {
                skip_alias_replacement: true,
                output: &mut output,
                diagnostics,
            },
        )?;

        // We sort so that the output is deterministic
        let mut inference_intrinsics: Vec<_> = inference_residual
            .intrinsics
            .iter()
            .map(|(&id, &type_id)| (id, type_id))
            .collect();
        inference_intrinsics.sort_unstable_by_key(|&(id, _)| id);

        let substitution = process_status(diagnostics, solver.solve())?;

        environment.substitution = substitution;

        let formatter = Formatter::new(heap);
        let mut formatter = NodeFormatter::with_defaults(&formatter, &environment, &context);

        let _ = writeln!(
            output,
            "\n{}\n\n{}",
            Header::new("HIR after type inference"),
            formatter.render(node, RenderOptions::default().with_plain())
        );

        let _ = writeln!(output, "\n{}\n", Header::new("Intrinsics"));

        let nodes = collect_hir_nodes(node);

        for (hir_id, intrinsic) in inference_intrinsics {
            // binary search is okay here because the nodes are sorted by id
            let node = nodes[nodes
                .binary_search_by_key(&hir_id, |node| node.id)
                .expect("should exist")];

            let _ = writeln!(
                output,
                "{}\n",
                Annotated {
                    content: formatter.render(node, RenderOptions::default().with_plain()),
                    annotation: intrinsic
                }
            );
        }

        Ok(output)
    }
}
