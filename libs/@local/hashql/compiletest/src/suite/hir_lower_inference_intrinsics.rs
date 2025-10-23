use core::fmt::Write as _;

use hashql_ast::node::expr::Expr;
use hashql_core::{
    heap::Heap,
    module::ModuleRegistry,
    pretty::{PrettyOptions, PrettyPrint as _},
    r#type::environment::Environment,
};
use hashql_hir::{context::HirContext, intern::Interner, pretty::PrettyPrintEnvironment};

use super::{
    Suite, SuiteDiagnostic,
    common::{Annotated, Header},
};
use crate::suite::{
    common::process_status, hir_lower_alias_replacement::TestOptions,
    hir_lower_inference::hir_lower_inference,
};

pub(crate) struct HirLowerTypeInferenceIntrinsicsSuite;

impl Suite for HirLowerTypeInferenceIntrinsicsSuite {
    fn name(&self) -> &'static str {
        "hir/lower/type-inference/intrinsics"
    }

    fn run<'heap>(
        &self,
        heap: &'heap Heap,
        expr: Expr<'heap>,
        diagnostics: &mut Vec<SuiteDiagnostic>,
    ) -> Result<String, SuiteDiagnostic> {
        let mut environment = Environment::new(expr.span, heap);
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

        let _ = writeln!(
            output,
            "\n{}\n\n{}",
            Header::new("HIR after type inference"),
            node.pretty_print(
                &PrettyPrintEnvironment {
                    env: &environment,
                    symbols: &context.symbols,
                    map: &context.map,
                },
                PrettyOptions::default().without_color()
            )
        );

        let _ = writeln!(output, "\n{}\n", Header::new("Intrinsics"));

        for (hir_id, intrinsic) in inference_intrinsics {
            let _ = writeln!(
                output,
                "{}\n",
                Annotated {
                    content: interner.node.index(hir_id).pretty_print(
                        &PrettyPrintEnvironment {
                            env: &environment,
                            symbols: &context.symbols,
                            map: &context.map,
                        },
                        PrettyOptions::default().without_color()
                    ),
                    annotation: intrinsic
                }
            );
        }

        Ok(output)
    }
}
