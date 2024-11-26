use error_stack::Report;
use hash_graph_authorization::{AuthorizationApi, backend::ZanzibarBackend};
use hash_graph_store::error::InsertionError;

use crate::{
    snapshot::{
        WriteBatch,
        entity::EntityRowBatch,
        ontology::{
            DataTypeRowBatch, EntityTypeRowBatch, OntologyTypeMetadataRowBatch,
            PropertyTypeRowBatch,
        },
        owner::AccountRowBatch,
        web::WebBatch,
    },
    store::{AsClient, PostgresStore},
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

impl<C, A> WriteBatch<C, A> for SnapshotRecordBatch
where
    C: AsClient,
    A: AuthorizationApi + ZanzibarBackend,
{
    async fn begin(
        postgres_client: &mut PostgresStore<C, A>,
    ) -> Result<(), Report<InsertionError>> {
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
        postgres_client: &mut PostgresStore<C, A>,
    ) -> Result<(), Report<InsertionError>> {
        match self {
            Self::Accounts(account) => account.write(postgres_client).await,
            Self::Webs(web) => web.write(postgres_client).await,
            Self::OntologyTypes(ontology) => ontology.write(postgres_client).await,
            Self::DataTypes(data_type) => data_type.write(postgres_client).await,
            Self::PropertyTypes(property) => property.write(postgres_client).await,
            Self::EntityTypes(entity_type) => entity_type.write(postgres_client).await,
            Self::Entities(entity) => entity.write(postgres_client).await,
        }
    }

    async fn commit(
        postgres_client: &mut PostgresStore<C, A>,
    ) -> Result<(), Report<InsertionError>> {
        AccountRowBatch::commit(postgres_client).await?;
        WebBatch::commit(postgres_client).await?;
        OntologyTypeMetadataRowBatch::commit(postgres_client).await?;
        DataTypeRowBatch::commit(postgres_client).await?;
        PropertyTypeRowBatch::commit(postgres_client).await?;
        EntityTypeRowBatch::commit(postgres_client).await?;
        EntityRowBatch::commit(postgres_client).await?;
        Ok(())
    }
}
