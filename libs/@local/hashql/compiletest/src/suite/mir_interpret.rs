use hashql_core::r#type::environment::Environment;
use hashql_diagnostics::Diagnostic;
use hashql_mir::{
    intern::Interner,
    interpret::{CallStack, Inputs, Runtime, RuntimeConfig},
};

use super::{
    RunContext, Suite, SuiteDiagnostic,
    mir_pass_transform_post_inline::mir_pass_transform_post_inline,
    mir_pass_transform_pre_inline::TextRenderer,
};

pub(crate) struct MirInterpret;

impl Suite for MirInterpret {
    fn name(&self) -> &'static str {
        "mir/interpret"
    }

    fn description(&self) -> &'static str {
        "Run the interpreter on the MIR"
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
        expr: hashql_ast::node::expr::Expr<'heap>,
    ) -> Result<String, SuiteDiagnostic> {
        let mut environment = Environment::new(heap);
        let interner = Interner::new(heap);

        let mut buffer = Vec::new();

        let (root, bodies, _) = mir_pass_transform_post_inline(
            heap,
            expr,
            &interner,
            TextRenderer::new(&mut buffer),
            &mut environment,
            diagnostics,
        )?;

        secondary_outputs.insert("mir", String::from_utf8_lossy_owned(buffer));

        let inputs = Inputs::new();
        let mut runtime = Runtime::new(RuntimeConfig::default(), &bodies, &inputs);
        let callstack = CallStack::new(&runtime, root, []);

        let output = runtime
            .run(callstack, |_| unimplemented!())
            .map_err(Diagnostic::generalize)
            .map_err(Diagnostic::boxed)?;

        Ok(format!("{output:#?}"))
    }
}
