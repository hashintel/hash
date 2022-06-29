mod postgres;

use std::fmt;

use async_trait::async_trait;
use error_stack::{Context, Result};
pub use postgres::PostgresDatabase;

#[derive(Debug)]
pub struct DatastoreError;

impl Context for DatastoreError {}

impl fmt::Display for DatastoreError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("The Datastore encountered an error")
    }
}

/// Describes the API of a Datastore implementation
#[async_trait]
trait Datastore {
    async fn create_data_type() -> Result<(), DatastoreError>;

    async fn get_data_type() -> Result<(), DatastoreError>;

    async fn get_data_many() -> Result<(), DatastoreError>;

    async fn update_data_type() -> Result<(), DatastoreError>;

    async fn create_property_type() -> Result<(), DatastoreError>;

    async fn get_property_type() -> Result<(), DatastoreError>;

    async fn get_property_many() -> Result<(), DatastoreError>;

    async fn update_property_type() -> Result<(), DatastoreError>;

    async fn create_entity_type() -> Result<(), DatastoreError>;

    async fn get_entity_type() -> Result<(), DatastoreError>;

    async fn get_entity_type_many() -> Result<(), DatastoreError>;

    async fn update_entity_type() -> Result<(), DatastoreError>;

    // TODO - perhaps we want to separate the Datastore into the Type Graph and the Data Graph

    async fn create_entity() -> Result<(), DatastoreError>;

    async fn get_entity() -> Result<(), DatastoreError>;

    async fn get_entity_many() -> Result<(), DatastoreError>;

    async fn update_entity() -> Result<(), DatastoreError>;
}
