extern crate alloc;

use core::error::Error;

use testcontainers::{ImageExt as _, ReuseDirective, runners::AsyncRunner as _};
use testcontainers_modules::postgres::Postgres;
use tokio::runtime;

mod seed;

use self::seed::SeededEntities;

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

fn main() -> Result<(), Box<dyn Error>> {
    let arguments = libtest_mimic::Arguments::from_args();

    let runtime = runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;

    let database = runtime.block_on(setup())?;

    let trials = vec![];

    libtest_mimic::run(&arguments, trials).exit();
}
