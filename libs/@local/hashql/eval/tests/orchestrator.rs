use core::error::Error;
use std::sync::Arc;

use hash_graph_postgres_store::store::{PostgresStore, PostgresStoreSettings};
use hash_graph_store::migration::StoreMigration;
use testcontainers::{ImageExt as _, ReuseDirective, runners::AsyncRunner as _};
use testcontainers_modules::postgres::Postgres;
use tokio::runtime::{self, Runtime};
use tokio_postgres::{Client, NoTls};

async fn setup() -> Result<
    (
        PostgresStore<Client>,
        testcontainers::ContainerAsync<Postgres>,
    ),
    Box<dyn Error>,
> {
    let container = Postgres::default()
        .with_user("hash")
        .with_password("hash")
        .with_reuse(ReuseDirective::CurrentSession)
        .start()
        .await?;

    let host = container.get_host().await?;
    let port = container.get_host_port_ipv4(5432).await?;

    let (client, connection) = tokio_postgres::Config::new()
        .host(host.to_string())
        .port(port)
        .connect(NoTls)
        .await?;
    tokio::spawn(connection);

    let mut store = PostgresStore::new(client, None, Arc::new(PostgresStoreSettings::default()));
    store.run_migrations().await?;

    // TODO: setup data (TODO: if this is a re-used container, don't we need to like make sure we
    // haven't already done this?)

    Ok((store, container))
}

fn main() -> Result<(), Box<dyn Error>> {
    let arguments = libtest_mimic::Arguments::from_args();

    let runtime = runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;

    let container = runtime.block_on(setup())?;

    let mut trials = vec![];

    libtest_mimic::run(&arguments, trials).exit();
}
