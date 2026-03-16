#![feature(allocator_api)]
extern crate alloc;

use core::error::Error;

use testcontainers::{ImageExt as _, ReuseDirective, runners::AsyncRunner as _};
use testcontainers_modules::postgres::Postgres;
use tokio::runtime;

mod discover;
mod execution;
mod seed;

use self::{
    discover::{discover_jexpr_tests, discover_programmatic_tests, test_ui_dir},
    seed::SeededEntities,
};

struct TestDatabase {
    _container: testcontainers::ContainerAsync<Postgres>,
    entities: SeededEntities,
}

async fn setup() -> Result<TestDatabase, Box<dyn Error>> {
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
    })
}

/// Registry of programmatic tests. Each entry is a name and a placeholder
/// for the body-building function (to be filled in).
const PROGRAMMATIC_TESTS: &[(&str, ())] = &[
    // ("hydrate-link-data", ()),
    // ("continuation-round-trip", ()),
];

fn main() -> Result<(), Box<dyn Error>> {
    let arguments = libtest_mimic::Arguments::from_args();

    let runtime = runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;

    let database = runtime.block_on(setup())?;

    let ui_dir = test_ui_dir();
    let mut test_cases = discover_jexpr_tests(&ui_dir);
    test_cases.extend(discover_programmatic_tests(&ui_dir, PROGRAMMATIC_TESTS));

    let trials: Vec<_> = test_cases
        .into_iter()
        .map(|test_case| {
            libtest_mimic::Trial::test(&test_case.name, move || {
                // TODO: trial execution (Bilal's part)
                Ok(())
            })
        })
        .collect();

    libtest_mimic::run(&arguments, trials).exit();
}
