#![feature(allocator_api)]
extern crate alloc;

use alloc::alloc::Global;
use core::error::Error;
use std::sync::Arc;

use hashql_core::heap::Heap;
use hashql_mir::interpret::Inputs;
use testcontainers::{ImageExt as _, ReuseDirective, runners::AsyncRunner as _};
use testcontainers_modules::postgres::Postgres;
use tokio::runtime::{self, Runtime};
use tokio_postgres::{Client, NoTls};

mod discover;
mod execution;
mod output;
mod seed;

use self::{
    discover::{TestSource, discover_jexpr_tests, discover_programmatic_tests, test_ui_dir},
    output::{compare_or_bless, render_value},
    seed::SeededEntities,
};

struct TestContext {
    runtime: Runtime,
    entities: SeededEntities,
    host: String,
    port: u16,
}

impl TestContext {
    async fn connect(&self) -> Result<Client, Box<dyn Error>> {
        let (client, connection) = tokio_postgres::Config::new()
            .user("hash")
            .password("hash")
            .host(&self.host)
            .port(self.port)
            .dbname("hash")
            .connect(NoTls)
            .await?;
        tokio::spawn(connection);

        Ok(client)
    }
}

async fn setup() -> Result<TestContext, Box<dyn Error>> {
    let container = Postgres::default()
        .with_user("hash")
        .with_password("hash")
        .with_reuse(ReuseDirective::CurrentSession)
        .start()
        .await?;

    let host = container.get_host().await?.to_string();
    let port = container.get_host_port_ipv4(5432).await?;

    let (_store, entities) = seed::setup(&host, port).await?;

    Ok(TestDatabase {
        _container: container,
        entities,
        host,
        port,
    })
}

const PROGRAMMATIC_TESTS: &[(&str, ())] = &[];

fn main() -> Result<(), Box<dyn Error>> {
    let arguments = libtest_mimic::Arguments::from_args();
    let bless = std::env::args().any(|arg| arg == "--bless");

    let runtime = runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;
    let runtime = Arc::new(runtime);

    let mut context = runtime.block_on(setup())?;

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
                let heap = Heap::new();
                let inputs = Inputs::<Global>::new();

                let client = runtime.block_on(context.connect())?;

                let result = match &test_case.source {
                    TestSource::JExpr { path } => {
                        let bytes = std::fs::read(path)?;

                        execution::execute_parse(&runtime, client, &heap, &inputs, &bytes)
                            .map_err(|diagnostic| format!("{diagnostic:?}"))
                    }
                    TestSource::Programmatic { index: _ } => {
                        todo!("programmatic test execution")
                    }
                }?;

                let rendered = render_value(&result);
                compare_or_bless(&rendered, &test_case.expected_output, bless)?;
                Ok(())
            })
        })
        .collect();

    libtest_mimic::run(&arguments, trials).exit();
}
