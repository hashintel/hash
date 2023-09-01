#![allow(unused_attributes)] // This file is used as module in other tests
#![feature(async_fn_in_trait, associated_type_bounds)]

use std::{mem, thread::JoinHandle};

use authorization::{
    backend::{
        AuthorizationApi, CheckError, CheckResponse, CreateRelationError, CreateRelationResponse,
        DeleteRelationError, DeleteRelationResponse, DeleteRelationsError, DeleteRelationsResponse,
        ExportSchemaError, ExportSchemaResponse, ImportSchemaError, ImportSchemaResponse,
        Precondition, RelationFilter, SpiceDb,
    },
    zanzibar::{Affiliation, Consistency, Relation, Resource, StringTuple, Subject},
};
use error_stack::Report;
use tokio::sync::oneshot::Sender;

pub struct TestApi {
    client: SpiceDb,

    tuples: Vec<StringTuple>,
    cleanup: Option<(Sender<Vec<StringTuple>>, JoinHandle<()>)>,
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
    #[allow(clippy::missing_panics_doc)] // Only the cleanup thread may panic
    pub fn connect() -> Self {
        let host =
            std::env::var("HASH_SPICEDB_HOST").unwrap_or_else(|_| "http://localhost".to_owned());
        let http_port =
            std::env::var("HASH_SPICEDB_HTTP_PORT").unwrap_or_else(|_| "8443".to_owned());
        let key = std::env::var("HASH_SPICEDB_GRPC_PRESHARED_KEY")
            .unwrap_or_else(|_| "secret".to_owned());

        let client = SpiceDb {
            configuration: authorization::backend::SpiceDbConfig {
                base_path: std::borrow::Cow::Owned(format!("{host}:{http_port}")),
                client: reqwest::Client::new(),
                key: std::borrow::Cow::Owned(key.clone()),
            },
        };

        let (tuple_sender, tuple_receiver) = tokio::sync::oneshot::channel();

        let cleanup_task = std::thread::spawn(move || {
            tokio::runtime::Runtime::new()
                .expect("failed to create runtime")
                .block_on(async {
                    let mut client = SpiceDb {
                        configuration: authorization::backend::SpiceDbConfig {
                            base_path: std::borrow::Cow::Owned(format!("{host}:{http_port}")),
                            // Sending the client to another thread seems to break the client
                            // so we create a new one here
                            client: reqwest::Client::new(),
                            key: std::borrow::Cow::Owned(key.clone()),
                        },
                    };

                    for tuple in tuple_receiver.await.expect("failed to receive tuples") {
                        let tuple: StringTuple = tuple;
                        client
                            .delete_relation(&tuple.resource, &tuple.affiliation, &tuple.subject, [
                            ])
                            .await
                            .expect("failed to delete relations");
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

impl AuthorizationApi for TestApi {
    async fn import_schema(
        &mut self,
        schema: &str,
    ) -> Result<ImportSchemaResponse, Report<ImportSchemaError>> {
        self.client.import_schema(schema).await
    }

    async fn export_schema(&self) -> Result<ExportSchemaResponse, Report<ExportSchemaError>> {
        self.client.export_schema().await
    }

    async fn create_relation<'p, R, A, S, P>(
        &mut self,
        resource: &R,
        relation: &A,
        subject: &S,
        preconditions: P,
    ) -> Result<CreateRelationResponse, Report<CreateRelationError>>
    where
        R: Resource + ?Sized + Sync + 'p,
        A: Relation<R> + ?Sized + Sync,
        S: Subject + ?Sized + Sync,
        P: IntoIterator<Item = Precondition<'p, R>, IntoIter: Send> + Send + 'p,
    {
        let result = self
            .client
            .create_relation(resource, relation, subject, preconditions)
            .await?;

        self.tuples
            .push(StringTuple::from_tuple(resource, relation, subject));

        Ok(result)
    }

    async fn delete_relation<'p, R, A, S, P>(
        &mut self,
        resource: &R,
        relation: &A,
        subject: &S,
        preconditions: P,
    ) -> Result<DeleteRelationResponse, Report<DeleteRelationError>>
    where
        R: Resource + ?Sized + Sync + 'p,
        A: Relation<R> + ?Sized + Sync,
        S: Subject + ?Sized + Sync,
        P: IntoIterator<Item = Precondition<'p, R>, IntoIter: Send> + Send + 'p,
    {
        self.client
            .delete_relation(resource, relation, subject, preconditions)
            .await
    }

    async fn delete_relations<'f, R>(
        &mut self,
        filter: RelationFilter<'_, R>,
        preconditions: impl IntoIterator<Item = Precondition<'f, R>> + Send,
    ) -> Result<DeleteRelationsResponse, Report<DeleteRelationsError>>
    where
        R: Resource<Namespace: Sync, Id: Sync> + ?Sized + 'f,
    {
        self.client.delete_relations(filter, preconditions).await
    }

    async fn check<R, P, S>(
        &self,
        resource: &R,
        permission: &P,
        subject: &S,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>>
    where
        R: Resource + ?Sized + Sync,
        P: Affiliation<R> + ?Sized + Sync,
        S: Subject + ?Sized + Sync,
    {
        self.client
            .check(resource, permission, subject, consistency)
            .await
    }
}
