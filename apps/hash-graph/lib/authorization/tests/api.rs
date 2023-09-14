#![allow(unused_attributes)] // This file is used as module in other tests
#![feature(async_fn_in_trait, associated_type_bounds)]

use std::{mem, thread::JoinHandle};

use authorization::{
    backend::{
        CheckError, CheckResponse, CreateRelationError, CreateRelationResponse,
        DeleteRelationError, DeleteRelationResponse, DeleteRelationsError, DeleteRelationsResponse,
        ExportSchemaError, ExportSchemaResponse, ImportSchemaError, ImportSchemaResponse,
        Precondition, RelationFilter, SpiceDbOpenApi, ZanzibarBackend,
    },
    zanzibar::{Consistency, Tuple, UntypedTuple},
};
use error_stack::Report;
use tokio::sync::oneshot::Sender;

pub struct TestApi {
    client: SpiceDbOpenApi,

    tuples: Vec<UntypedTuple<'static>>,
    cleanup: Option<(Sender<Vec<UntypedTuple<'static>>>, JoinHandle<()>)>,
}

impl TestApi {
    /// Connects to the `SpiceDB` instance specified by the environment variables.
    ///
    /// The following environment variables are used:
    /// - `HASH_SPICEDB_HOST`: The host to connect to. Defaults to `http://localhost`.
    /// - `HASH_SPICEDB_HTTP_PORT`: The port to connect to. Defaults to `8443`.
    /// - `HASH_SPICEDB_GRPC_PRESHARED_KEY`: The preshared key to use for authentication. Defaults
    ///   to `secret`.
    ///
    /// After disconnecting every created relation will be deleted again.
    #[must_use]
    #[allow(clippy::missing_panics_doc, clippy::print_stderr)] // Only the cleanup thread may panic
    pub fn connect() -> Self {
        let host =
            std::env::var("HASH_SPICEDB_HOST").unwrap_or_else(|_| "http://localhost".to_owned());
        let http_port =
            std::env::var("HASH_SPICEDB_HTTP_PORT").unwrap_or_else(|_| "8443".to_owned());
        let key = std::env::var("HASH_SPICEDB_GRPC_PRESHARED_KEY")
            .unwrap_or_else(|_| "secret".to_owned());

        let client = SpiceDbOpenApi::new(format!("{host}:{http_port}"), &key)
            .expect("failed to connect to SpiceDB");

        let (tuple_sender, tuple_receiver) = tokio::sync::oneshot::channel();

        let cleanup_task = std::thread::spawn(move || {
            tokio::runtime::Runtime::new()
                .expect("failed to create runtime")
                .block_on(async {
                    // Sending the client to another thread seems to break the client
                    // so we create a new one here
                    let mut client = SpiceDbOpenApi::new(format!("{host}:{http_port}"), &key)
                        .expect("failed to connect to SpiceDB");

                    let tuples: Vec<UntypedTuple> =
                        tuple_receiver.await.expect("failed to receive tuples");

                    if let Err(error) = client.delete_relations(&tuples, []).await {
                        eprintln!(
                            "failed to delete relations: {error:?} while cleaning up {} tuples",
                            tuples.len()
                        );
                        for tuple in &tuples {
                            eprintln!("\n  - {tuple}");
                        }
                    }
                });
        });

        Self {
            client,
            tuples: Vec::new(),
            cleanup: Some((tuple_sender, cleanup_task)),
        }
    }
}

impl Drop for TestApi {
    #[allow(clippy::print_stderr, clippy::use_debug)]
    fn drop(&mut self) {
        let (sender, thread) = self.cleanup.take().expect("cleanup task already dropped");
        sender
            .send(mem::take(&mut self.tuples))
            .expect("failed to send namespaces");
        if let Err(error) = thread.join() {
            eprintln!("failed to join cleanup thread: {error:?}\n");
        }
    }
}

impl ZanzibarBackend for TestApi {
    async fn import_schema(
        &mut self,
        schema: &str,
    ) -> Result<ImportSchemaResponse, Report<ImportSchemaError>> {
        self.client.import_schema(schema).await
    }

    async fn export_schema(&self) -> Result<ExportSchemaResponse, Report<ExportSchemaError>> {
        self.client.export_schema().await
    }

    async fn create_relations<'p, 't, T>(
        &mut self,
        tuples: impl IntoIterator<Item = &'t T, IntoIter: Send> + Send,
        preconditions: impl IntoIterator<Item = Precondition<'p>, IntoIter: Send> + Send + 'p,
    ) -> Result<CreateRelationResponse, Report<CreateRelationError>>
    where
        T: Tuple + Send + Sync + 't,
    {
        let (tuples, untyped_tuples): (Vec<_>, Vec<_>) = tuples
            .into_iter()
            .map(|tuple| {
                let untyped_tuples = UntypedTuple::from_tuple(tuple).into_owned();
                (tuple, untyped_tuples)
            })
            .unzip();

        let result = self.client.create_relations(tuples, preconditions).await?;

        self.tuples.extend(untyped_tuples);

        Ok(result)
    }

    async fn delete_relations<'p, 't, T>(
        &mut self,
        tuples: impl IntoIterator<Item = &'t T, IntoIter: Send> + Send,
        preconditions: impl IntoIterator<Item = Precondition<'p>, IntoIter: Send> + Send + 'p,
    ) -> Result<DeleteRelationResponse, Report<DeleteRelationError>>
    where
        T: Tuple + Send + Sync + 't,
    {
        self.client.delete_relations(tuples, preconditions).await
    }

    async fn delete_relations_by_filter<'f>(
        &mut self,
        filter: RelationFilter<'_>,
        preconditions: impl IntoIterator<Item = Precondition<'f>> + Send,
    ) -> Result<DeleteRelationsResponse, Report<DeleteRelationsError>> {
        self.client
            .delete_relations_by_filter(filter, preconditions)
            .await
    }

    async fn check(
        &self,
        tuple: &(impl Tuple + Sync),
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>> {
        self.client.check(tuple, consistency).await
    }
}
