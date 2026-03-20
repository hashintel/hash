#![feature(allocator_api)]
extern crate alloc;

use alloc::sync::Arc;

use error_stack::{Report, ResultExt as _};
use hash_graph_postgres_store::store::{AsClient as _, PostgresStore, PostgresStoreSettings};
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
mod programmatic;
mod seed;

use self::{
    directives::{AxisDirectives, parse_directives},
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
    store: Arc<PostgresStore<Client>>,
    entities: SeededEntities,
}

async fn setup() -> Result<TestContext, Report<SetupError>> {
    let container = Postgres::default()
        .with_user("hash")
        .with_password("hash")
        .with_db_name("hash")
        .with_name("pgvector/pgvector")
        .with_tag("0.8.2-pg18-trixie")
        .with_reuse(ReuseDirective::CurrentSession)
        .with_cmd([
            "postgres",
            "-c",
            "log_statement=all",
            "-c",
            "log_destination=stderr",
        ])
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

    let (client, connection) = tokio_postgres::Config::new()
        .user("hash")
        .password("hash")
        .host(&host)
        .port(port)
        .dbname("hash")
        .connect(NoTls)
        .await
        .change_context(SetupError::Connection)?;
    tokio::spawn(connection);

    let mut store = PostgresStore::new(client, None, Arc::new(PostgresStoreSettings::default()));
    let entities = seed::setup(&mut store).await?;

    Ok(TestContext {
        _container: container,
        store: Arc::new(store),
        entities,
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

    match execution::run(
        &mut pipeline,
        runtime,
        context.store.as_client(),
        &inputs,
        &mut lowered,
    ) {
        Ok((value, events)) => {
            let rendered = render_success(&source, &value, &events, &pipeline)?;
            compare_or_bless(&rendered, expected_output, bless)
        }
        Err(diagnostic) => {
            let rendered = render_failure(&source, &pipeline, &diagnostic);
            Err(Report::new(TestError::Execution).attach(rendered))
        }
    }
}

/// Runs a programmatic test: build MIR directly, execute, compare output.
///
/// Inputs are constructed from seeded entity data using the same
/// [`build_inputs`] helper as J-Expr tests. The programmatic builder
/// only constructs the MIR bodies; it references inputs via
/// `input.load!` statements.
fn run_programmatic_test(
    runtime: &Runtime,
    context: &TestContext,
    builder: ProgrammaticBuilder,
    expected_output: &std::path::Path,
    bless: bool,
) -> Result<(), Report<TestError>> {
    let heap = Heap::new();
    let mut pipeline = Pipeline::new(&heap);
    let (interner, entry, mut bodies) = builder(&pipeline);

    let inputs = build_inputs(
        &heap,
        &pipeline,
        &interner,
        &context.entities,
        &AxisDirectives::default(),
    );

    // Programmatic tests have no J-Expr source, so diagnostics render
    // without source context (all spans are synthetic).
    let source = "";

    match execution::execute(
        &mut pipeline,
        runtime,
        context.store.as_client(),
        &inputs,
        &interner,
        entry,
        &mut bodies,
    ) {
        Ok((value, events)) => {
            let rendered = render_success(source, &value, &events, &pipeline)?;
            compare_or_bless(&rendered, expected_output, bless)
        }
        Err(diagnostic) => {
            let rendered = render_failure(source, &pipeline, &diagnostic);
            Err(Report::new(TestError::Execution).attach(rendered))
        }
    }
}

const PROGRAMMATIC_TESTS: &[(&str, ProgrammaticBuilder)] = &[
    ("property-access", programmatic::property_access),
    ("property-arithmetic", programmatic::property_arithmetic),
];

fn main() -> Result<(), Report<SetupError>> {
    let arguments = libtest_mimic::Arguments::from_args();
    let bless = std::env::args().any(|arg| arg == "--bless") || std::env::var("BLESS").is_ok();

    let runtime = runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .change_context(SetupError::Container)
        .attach("could not build tokio runtime")?;
    let runtime = Arc::new(runtime);

    let context = runtime.block_on(setup())?;
    let context = Arc::new(context);

    let ui_dir = test_ui_dir();
    let mut test_cases = discover_jexpr_tests(&ui_dir);
    test_cases.extend(discover_programmatic_tests(&ui_dir, PROGRAMMATIC_TESTS));

    let trials: Vec<_> = test_cases
        .into_iter()
        .map(|test_case| {
            let context = Arc::clone(&context);
            let runtime = Arc::clone(&runtime);

            libtest_mimic::Trial::test(&test_case.name, move || {
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
