#![feature(allocator_api)]
extern crate alloc;

use alloc::sync::Arc;

use error_stack::{Report, ResultExt as _};
use hashql_compiletest::pipeline::Pipeline;
use hashql_core::heap::Heap;
use testcontainers::{ImageExt as _, ReuseDirective, runners::AsyncRunner as _};
use testcontainers_modules::postgres::Postgres;
use tokio::runtime::{self, Runtime};
use tokio_postgres::{Client, NoTls};

mod directives;
mod discover;
mod error;
mod execution;
mod inputs;
mod output;
mod seed;

use self::{
    directives::parse_directives,
    discover::{
        ProgrammaticBuilder, TestSource, discover_jexpr_tests, discover_programmatic_tests,
        test_ui_dir,
    },
    error::{SetupError, TestError},
    inputs::build_inputs,
    output::{compare_or_bless, render_failure, render_success},
    seed::SeededEntities,
};

struct TestContext {
    _container: testcontainers::ContainerAsync<Postgres>,
    entities: SeededEntities,
    host: String,
    port: u16,
}

impl TestContext {
    fn connect(&self, runtime: &Runtime) -> Result<Client, Report<TestError>> {
        let (client, connection) = runtime
            .block_on(
                tokio_postgres::Config::new()
                    .user("hash")
                    .password("hash")
                    .host(&self.host)
                    .port(self.port)
                    .dbname("hash")
                    .connect(NoTls),
            )
            .change_context(TestError::Connection)?;
        runtime.handle().spawn(connection);
        Ok(client)
    }
}

async fn setup() -> Result<TestContext, Report<SetupError>> {
    let container = Postgres::default()
        .with_user("hash")
        .with_password("hash")
        .with_reuse(ReuseDirective::CurrentSession)
        .start()
        .await
        .change_context(SetupError::Container)?;

    let host = container
        .get_host()
        .await
        .change_context(SetupError::Container)
        .attach("could not resolve container host")?
        .to_string();
    let port = container
        .get_host_port_ipv4(5432)
        .await
        .change_context(SetupError::Container)
        .attach("could not resolve container port")?;

    let (_store, entities) = seed::setup(&host, port).await?;

    Ok(TestContext {
        _container: container,
        entities,
        host,
        port,
    })
}

/// Runs a J-Expr test: parse, lower, build inputs, execute, compare output.
fn run_jexpr_test(
    runtime: &Runtime,
    context: &TestContext,
    path: &std::path::Path,
    expected_output: &std::path::Path,
    bless: bool,
) -> Result<(), Report<TestError>> {
    let bytes = std::fs::read(path)
        .change_context(TestError::ReadSource)
        .attach_with(|| format!("{}", path.display()))?;

    let source = String::from_utf8_lossy(&bytes);
    let axis_directives = parse_directives(&source);
    let heap = Heap::new();
    let mut pipeline = Pipeline::new(&heap);

    let client = context.connect(runtime)?;

    // Lower first so the type environment is populated, then build inputs.
    let mut lowered = match execution::lower(&mut pipeline, &bytes) {
        Ok(lowered) => lowered,
        Err(diagnostic) => {
            let rendered = render_failure(&source, &pipeline, &diagnostic);
            return Err(Report::new(TestError::Execution).attach(rendered));
        }
    };

    let inputs = build_inputs(
        &heap,
        &pipeline,
        &lowered.interner,
        &context.entities,
        &axis_directives,
    );

    match execution::run(&mut pipeline, runtime, client, &inputs, &mut lowered) {
        Ok(value) => {
            let rendered = render_success(&source, &value, &pipeline)?;
            compare_or_bless(&rendered, expected_output, bless)
        }
        Err(diagnostic) => {
            let rendered = render_failure(&source, &pipeline, &diagnostic);
            Err(Report::new(TestError::Execution).attach(rendered))
        }
    }
}

/// Runs a programmatic test: build MIR directly, execute, compare output.
fn run_programmatic_test(
    runtime: &Runtime,
    context: &TestContext,
    builder: ProgrammaticBuilder,
    expected_output: &std::path::Path,
    bless: bool,
) -> Result<(), Report<TestError>> {
    let heap = Heap::new();
    let (interner, entry, mut bodies, inputs) = builder(&heap);
    let mut pipeline = Pipeline::new(&heap);

    let client = context.connect(runtime)?;

    // Programmatic tests have no J-Expr source, so diagnostics render
    // without source context (all spans are synthetic).
    let source = "";

    match execution::execute(
        &mut pipeline,
        runtime,
        client,
        &inputs,
        &interner,
        entry,
        &mut bodies,
    ) {
        Ok(value) => {
            let rendered = render_success(source, &value, &pipeline)?;
            compare_or_bless(&rendered, expected_output, bless)
        }
        Err(diagnostic) => {
            let rendered = render_failure(source, &pipeline, &diagnostic);
            Err(Report::new(TestError::Execution).attach(rendered))
        }
    }
}

const PROGRAMMATIC_TESTS: &[(&str, ProgrammaticBuilder)] = &[];

fn main() -> Result<(), Report<SetupError>> {
    let arguments = libtest_mimic::Arguments::from_args();
    let bless = std::env::args().any(|arg| arg == "--bless");

    let runtime = runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .change_context(SetupError::Container)
        .attach("could not build tokio runtime")?;

    let context = runtime.block_on(setup())?;
    let context = Arc::new(context);

    let ui_dir = test_ui_dir();
    let mut test_cases = discover_jexpr_tests(&ui_dir);
    test_cases.extend(discover_programmatic_tests(&ui_dir, PROGRAMMATIC_TESTS));

    let trials: Vec<_> = test_cases
        .into_iter()
        .map(|test_case| {
            let context = Arc::clone(&context);

            libtest_mimic::Trial::test(&test_case.name, move || {
                let runtime = runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|error| format!("could not build trial runtime: {error}"))?;

                let result = match &test_case.source {
                    TestSource::JExpr { path } => {
                        run_jexpr_test(&runtime, &context, path, &test_case.expected_output, bless)
                    }
                    TestSource::Programmatic { builder } => run_programmatic_test(
                        &runtime,
                        &context,
                        *builder,
                        &test_case.expected_output,
                        bless,
                    ),
                };

                result.map_err(|report| format!("{report:?}").into())
            })
        })
        .collect();

    libtest_mimic::run(&arguments, trials).exit();
}
