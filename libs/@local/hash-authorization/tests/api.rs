#![allow(unused_attributes, unreachable_pub)] // This file is used as module in other tests
#![feature(async_fn_in_trait, associated_type_bounds)]

use authorization::{
    backend::{
        CheckError, CheckResponse, CreateRelationError, CreateRelationResponse,
        DeleteRelationError, DeleteRelationResponse, ExportSchemaError, ExportSchemaResponse,
        ImportSchemaError, ImportSchemaResponse, ReadError, SpiceDbOpenApi, ZanzibarBackend,
    },
    zanzibar::{types::relationship::RelationshipFilter, Consistency, Tuple},
};
use error_stack::Report;
use serde::Serialize;

pub struct TestApi {
    client: SpiceDbOpenApi,
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
    /// # Panics
    ///
    /// Panics if the connection to `SpiceDB` fails.
    #[must_use]
    pub fn connect() -> Self {
        let host =
            std::env::var("HASH_SPICEDB_HOST").unwrap_or_else(|_| "http://localhost".to_owned());
        let http_port =
            std::env::var("HASH_SPICEDB_HTTP_PORT").unwrap_or_else(|_| "8443".to_owned());
        let key = std::env::var("HASH_SPICEDB_GRPC_PRESHARED_KEY")
            .unwrap_or_else(|_| "secret".to_owned());

        Self {
            client: SpiceDbOpenApi::new(format!("{host}:{http_port}"), Some(&key))
                .expect("failed to connect to SpiceDB"),
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

    async fn create_relations<T>(
        &mut self,
        tuples: impl IntoIterator<Item = T, IntoIter: Send> + Send,
    ) -> Result<CreateRelationResponse, Report<CreateRelationError>>
    where
        T: Tuple + Send + Sync,
    {
        self.client.create_relations(tuples).await
    }

    async fn touch_relations<T>(
        &mut self,
        tuples: impl IntoIterator<Item = T, IntoIter: Send> + Send,
    ) -> Result<CreateRelationResponse, Report<CreateRelationError>>
    where
        T: Tuple + Send + Sync,
    {
        self.client.touch_relations(tuples).await
    }

    async fn delete_relations<T>(
        &mut self,
        tuples: impl IntoIterator<Item = T, IntoIter: Send> + Send,
    ) -> Result<DeleteRelationResponse, Report<DeleteRelationError>>
    where
        T: Tuple + Send + Sync,
    {
        self.client.delete_relations(tuples).await
    }

    async fn check<T>(
        &self,
        tuple: &T,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>>
    where
        T: Tuple + Sync,
    {
        self.client.check(tuple, consistency).await
    }

    async fn read_relations<R>(
        &self,
        _filter: RelationshipFilter<
            '_,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
        >,
        _consistency: Consistency<'_>,
    ) -> Result<Vec<R>, Report<ReadError>> {
        Ok(Vec::new())
    }
}
