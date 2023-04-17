use async_trait::async_trait;
use error_stack::Result;

use crate::{
    snapshot::{
        account::AccountRowBatch,
        entity::EntityRowBatch,
        ontology::{
            DataTypeRowBatch, EntityTypeRowBatch, OntologyTypeMetadataRowBatch,
            PropertyTypeRowBatch,
        },
        WriteBatch,
    },
    store::{AsClient, InsertionError, PostgresStore},
};

pub enum SnapshotRecordBatch {
    Accounts(AccountRowBatch),
    OntologyTypes(OntologyTypeMetadataRowBatch),
    DataTypes(DataTypeRowBatch),
    PropertyTypes(PropertyTypeRowBatch),
    EntityTypes(EntityTypeRowBatch),
    Entities(EntityRowBatch),
}

#[async_trait]
impl<C: AsClient> WriteBatch<C> for SnapshotRecordBatch {
    async fn begin(postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        AccountRowBatch::begin(postgres_client).await?;
        OntologyTypeMetadataRowBatch::begin(postgres_client).await?;
        DataTypeRowBatch::begin(postgres_client).await?;
        PropertyTypeRowBatch::begin(postgres_client).await?;
        EntityTypeRowBatch::begin(postgres_client).await?;
        EntityRowBatch::begin(postgres_client).await?;
        Ok(())
    }

    async fn write(&self, postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        match self {
            Self::Accounts(account) => account.write(postgres_client).await,
            Self::OntologyTypes(ontology) => ontology.write(postgres_client).await,
            Self::DataTypes(data_type) => data_type.write(postgres_client).await,
            Self::PropertyTypes(property) => property.write(postgres_client).await,
            Self::EntityTypes(entity_type) => entity_type.write(postgres_client).await,
            Self::Entities(entity) => entity.write(postgres_client).await,
        }
    }

    async fn commit(postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        AccountRowBatch::commit(postgres_client).await?;
        OntologyTypeMetadataRowBatch::commit(postgres_client).await?;
        DataTypeRowBatch::commit(postgres_client).await?;
        PropertyTypeRowBatch::commit(postgres_client).await?;
        EntityTypeRowBatch::commit(postgres_client).await?;
        EntityRowBatch::commit(postgres_client).await?;
        Ok(())
    }
}
