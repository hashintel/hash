use std::io::Write;

use clap::Parser;
use error_stack::{IntoReport, Result, ResultExt};
use graph::{
    knowledge::Entity,
    logging::{init_logger, LoggingArgs},
    store::{
        crud::Read, query::Filter, test_graph, test_graph::BlockProtocolModuleVersions,
        DatabaseConnectionInfo, PostgresStorePool, StorePool,
    },
};
use tokio_postgres::NoTls;
use type_system::{DataType, EntityType, PropertyType};

use crate::error::GraphError;

#[derive(Debug, Parser)]
pub struct SnapshotDumpArgs;

#[derive(Debug, Parser)]
pub enum SnapshotCommand {
    Dump(SnapshotDumpArgs),
}

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub struct SnapshotArgs {
    #[command(subcommand)]
    pub command: SnapshotCommand,

    #[clap(flatten)]
    pub log_config: LoggingArgs,

    #[clap(flatten)]
    pub db_info: DatabaseConnectionInfo,
}

pub async fn snapshot(args: SnapshotArgs) -> Result<(), GraphError> {
    let _log_guard = init_logger(&args.log_config);

    let pool = PostgresStorePool::new(&args.db_info, NoTls)
        .await
        .change_context(GraphError)
        .map_err(|report| {
            tracing::error!(error = ?report, "Failed to connect to database");
            report
        })?;

    let store = pool
        .acquire()
        .await
        .change_context(GraphError)
        .map_err(|report| {
            tracing::error!(error = ?report, "Failed to acquire database connection");
            report
        })?;

    match args.command {
        SnapshotCommand::Dump(_) => {
            let data_types = Read::<test_graph::OntologyTypeRecord<DataType>>::read(
                &store,
                &Filter::All(vec![]),
                None,
            )
            .await
            .change_context(GraphError)?;

            let property_types = Read::<test_graph::OntologyTypeRecord<PropertyType>>::read(
                &store,
                &Filter::All(vec![]),
                None,
            )
            .await
            .change_context(GraphError)?;

            let entity_types = Read::<test_graph::OntologyTypeRecord<EntityType>>::read(
                &store,
                &Filter::All(vec![]),
                None,
            )
            .await
            .change_context(GraphError)?;

            let entities = Read::<Entity>::read(&store, &Filter::All(vec![]), None)
                .await
                .change_context(GraphError)?
                .into_iter()
                .map(test_graph::EntityRecord::from)
                .collect();

            let test_graph = test_graph::TestData {
                block_protocol_module_versions: BlockProtocolModuleVersions {
                    graph: semver::Version::new(0, 3, 0),
                },
                data_types,
                property_types,
                entity_types,
                entities,
                custom: test_graph::CustomGlobalMetadata::default(),
            };

            serde_json::to_writer(&mut std::io::stdout(), &test_graph)
                .into_report()
                .change_context(GraphError)?;
            writeln!(std::io::stdout())
                .into_report()
                .change_context(GraphError)?;
        }
    }

    Ok(())
}
