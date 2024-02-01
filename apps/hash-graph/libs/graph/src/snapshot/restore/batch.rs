use async_trait::async_trait;
use authorization::backend::ZanzibarBackend;
use error_stack::Result;

use crate::{
    snapshot::{
        entity::EntityRowBatch,
        ontology::{
            DataTypeRowBatch, EntityTypeRowBatch, OntologyTypeMetadataRowBatch,
            PropertyTypeRowBatch,
        },
        owner::AccountRowBatch,
        web::WebBatch,
        WriteBatch,
    },
    store::{AsClient, InsertionError, PostgresStore},
};

pub enum SnapshotRecordBatch {
    Accounts(AccountRowBatch),
    Webs(WebBatch),
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
        WebBatch::begin(postgres_client).await?;
        OntologyTypeMetadataRowBatch::begin(postgres_client).await?;
        DataTypeRowBatch::begin(postgres_client).await?;
        PropertyTypeRowBatch::begin(postgres_client).await?;
        EntityTypeRowBatch::begin(postgres_client).await?;
        EntityRowBatch::begin(postgres_client).await?;
        Ok(())
    }

    async fn write(
        self,
        postgres_client: &PostgresStore<C>,
        authorization_api: &mut (impl ZanzibarBackend + Send),
    ) -> Result<(), InsertionError> {
        match self {
            Self::Accounts(account) => account.write(postgres_client, authorization_api).await,
            Self::Webs(web) => web.write(postgres_client, authorization_api).await,
            Self::OntologyTypes(ontology) => {
                ontology.write(postgres_client, authorization_api).await
            }
            Self::DataTypes(data_type) => data_type.write(postgres_client, authorization_api).await,
            Self::PropertyTypes(property) => {
                property.write(postgres_client, authorization_api).await
            }
            Self::EntityTypes(entity_type) => {
                entity_type.write(postgres_client, authorization_api).await
            }
            Self::Entities(entity) => entity.write(postgres_client, authorization_api).await,
        }
    }

    async fn commit(
        postgres_client: &PostgresStore<C>,
        validation: bool,
    ) -> Result<(), InsertionError> {
        AccountRowBatch::commit(postgres_client, validation).await?;
        WebBatch::commit(postgres_client, validation).await?;
        OntologyTypeMetadataRowBatch::commit(postgres_client, validation).await?;
        DataTypeRowBatch::commit(postgres_client, validation).await?;
        PropertyTypeRowBatch::commit(postgres_client, validation).await?;
        EntityTypeRowBatch::commit(postgres_client, validation).await?;
        EntityRowBatch::commit(postgres_client, validation).await?;
        Ok(())
    }
}
