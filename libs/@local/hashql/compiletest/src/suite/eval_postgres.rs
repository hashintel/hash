use core::{alloc::Allocator, fmt::Write as _};

use hashql_ast::node::expr::Expr;
use hashql_core::{
    heap::ResetAllocator as _,
    pretty::Formatter,
    r#type::{TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use hashql_eval::{context::EvalContext, postgres::PostgresCompiler};
use hashql_mir::{
    body::{Body, basic_block::BasicBlockId, terminator::TerminatorKind},
    context::MirContext,
    def::DefIdSlice,
    intern::Interner,
    pass::{
        GlobalAnalysisPass as _,
        analysis::SizeEstimationAnalysis,
        execution::{ExecutionAnalysis, ExecutionAnalysisResidual, TargetId},
    },
    pretty::{TextFormatAnnotations, TextFormatOptions},
};

use super::{
    RunContext, Suite, SuiteDiagnostic,
    common::{Header, process_issues},
    mir_pass_transform_post_inline::mir_pass_transform_post_inline,
};

/// Annotates each basic block with its execution target (Postgres / Interpreter / Embedding).
struct PlacementAnnotation<'ctx, A: Allocator> {
    /// The residual for the body currently being formatted, if it has one.
    current: Option<&'ctx ExecutionAnalysisResidual<A>>,
}

impl<A: Allocator> TextFormatAnnotations for PlacementAnnotation<'_, A> {
    type BasicBlockAnnotation<'this, 'heap>
        = &'static str
    where
        Self: 'this;

    fn annotate_basic_block<'heap>(
        &self,
        id: BasicBlockId,
        _block: &hashql_mir::body::basic_block::BasicBlock<'heap>,
    ) -> Option<Self::BasicBlockAnnotation<'_, 'heap>> {
        let residual = self.current?;
        let target = residual.assignment.get(id)?;

        Some(match *target {
            TargetId::Interpreter => "interpreter",
            TargetId::Postgres => "postgres",
            TargetId::Embedding => "embedding",
        })
    }
}

pub(crate) struct EvalPostgres;

impl Suite for EvalPostgres {
    fn name(&self) -> &'static str {
        "eval/postgres"
    }

    fn description(&self) -> &'static str {
        "PostgreSQL query compilation from MIR"
    }

    fn secondary_file_extensions(&self) -> &[&str] {
        &["mir"]
    }

    fn run<'heap>(
        &self,
        RunContext {
            heap,
            diagnostics,
            secondary_outputs,
            ..
        }: RunContext<'_, 'heap>,
        expr: Expr<'heap>,
    ) -> Result<String, SuiteDiagnostic> {
        let mut environment = Environment::new(heap);
        let interner = Interner::new(heap);

        let (_, mut bodies, mut scratch) = mir_pass_transform_post_inline(
            heap,
            expr,
            &interner,
            (),
            &mut environment,
            diagnostics,
        )?;

        let mut context = MirContext {
            heap,
            env: &environment,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        };

        let mut size_estimation_analysis = SizeEstimationAnalysis::new_in(&scratch);
        size_estimation_analysis.run(&mut context, &bodies);
        let footprints = size_estimation_analysis.finish();
        scratch.reset();

        let analysis = ExecutionAnalysis {
            footprints: &footprints,
            scratch: &mut scratch,
        };
        let analysis = analysis.run_all_in(&mut context, &mut bodies, heap);
        scratch.reset();

        process_issues(diagnostics, context.diagnostics)?;

        // Capture MIR after execution analysis with block placement annotations.
        let mir_buf = format_mir_with_placement(heap, &environment, &bodies, &analysis);
        secondary_outputs.insert("mir", mir_buf);

        let mut context =
            EvalContext::new_in(&environment, &bodies, &analysis, context.heap, &mut scratch);
        scratch.reset();

        // Inside of **all** the bodies, find the `GraphRead` terminators to compile.
        let mut prepared_queries = Vec::new();
        let mut compiler = PostgresCompiler::new_in(&mut context, &mut scratch);

        for body in &bodies {
            for block in &*body.basic_blocks {
                if let TerminatorKind::GraphRead(read) = &block.terminator.kind {
                    let prepared_query = compiler.compile(read);
                    prepared_queries.push(prepared_query);
                }
            }
        }

        scratch.reset();
        process_issues(diagnostics, context.diagnostics)?;

        let mut output = String::new();

        for (index, query) in prepared_queries.iter().enumerate() {
            if index > 0 {
                let _ = writeln!(output);
            }

            let sql = query.transpile().to_string();

            let _ = writeln!(output, "{}\n\n{sql}", Header::new("SQL"));

            if !query.parameters.is_empty() {
                let _ = writeln!(
                    output,
                    "\n{}\n\n{}",
                    Header::new("Parameters"),
                    query.parameters
                );
            }
        }

        Ok(output)
    }
}

fn format_mir_with_placement<'heap, A: Allocator>(
    heap: &'heap hashql_core::heap::Heap,
    env: &Environment<'heap>,
    bodies: &DefIdSlice<Body<'heap>>,
    analysis: &DefIdSlice<Option<ExecutionAnalysisResidual<A>>>,
) -> String {
    let formatter = Formatter::new(heap);
    let types = TypeFormatter::new(
        &formatter,
        env,
        TypeFormatterOptions::terse().with_qualified_opaque_names(true),
    );

    let mut text_format = TextFormatOptions {
        writer: Vec::<u8>::new(),
        indent: 4,
        sources: bodies,
        types,
        annotations: PlacementAnnotation { current: None },
    }
    .build();

    // Format each body, setting the current residual so the annotation can look up
    // block targets for graph-read filter bodies.
    let mut first = true;
    for body in bodies {
        text_format.replace_annotations(PlacementAnnotation {
            current: analysis.get(body.id).and_then(Option::as_ref),
        });

        if !first {
            text_format.writer.extend_from_slice(b"\n\n");
        }
        first = false;

        text_format
            .format_body(body)
            .expect("should be able to format body");
    }

    String::from_utf8_lossy_owned(text_format.writer)
}
