use error_stack::Report;
use hash_graph_store::error::InsertionError;

use crate::{
    snapshot::{
        WriteBatch,
        action::ActionRowBatch,
        entity::EntityRowBatch,
        ontology::{
            DataTypeRowBatch, EntityTypeRowBatch, OntologyTypeMetadataRowBatch,
            PropertyTypeRowBatch,
        },
        policy::PolicyRowBatch,
        principal::PrincipalRowBatch,
    },
    store::{AsClient, PostgresStore},
};

pub enum SnapshotRecordBatch {
    Principals(PrincipalRowBatch),
    OntologyTypes(OntologyTypeMetadataRowBatch),
    DataTypes(DataTypeRowBatch),
    PropertyTypes(PropertyTypeRowBatch),
    EntityTypes(EntityTypeRowBatch),
    Entities(EntityRowBatch),
    Actions(ActionRowBatch),
    Policies(PolicyRowBatch),
}

impl<C> WriteBatch<C> for SnapshotRecordBatch
where
    C: AsClient,
{
    async fn begin(postgres_client: &mut PostgresStore<C>) -> Result<(), Report<InsertionError>> {
        PrincipalRowBatch::begin(postgres_client).await?;
        OntologyTypeMetadataRowBatch::begin(postgres_client).await?;
        DataTypeRowBatch::begin(postgres_client).await?;
        PropertyTypeRowBatch::begin(postgres_client).await?;
        EntityTypeRowBatch::begin(postgres_client).await?;
        EntityRowBatch::begin(postgres_client).await?;
        ActionRowBatch::begin(postgres_client).await?;
        PolicyRowBatch::begin(postgres_client).await?;
        Ok(())
    }

    async fn write(
        self,
        postgres_client: &mut PostgresStore<C>,
    ) -> Result<(), Report<InsertionError>> {
        match self {
            Self::Principals(principals) => principals.write(postgres_client).await,
            Self::OntologyTypes(ontology) => ontology.write(postgres_client).await,
            Self::DataTypes(data_type) => data_type.write(postgres_client).await,
            Self::PropertyTypes(property) => property.write(postgres_client).await,
            Self::EntityTypes(entity_type) => entity_type.write(postgres_client).await,
            Self::Entities(entity) => entity.write(postgres_client).await,
            Self::Actions(action) => action.write(postgres_client).await,
            Self::Policies(policy) => policy.write(postgres_client).await,
        }
    }

    async fn commit(
        postgres_client: &mut PostgresStore<C>,
        ignore_validation_errors: bool,
    ) -> Result<(), Report<InsertionError>> {
        PrincipalRowBatch::commit(postgres_client, ignore_validation_errors).await?;
        OntologyTypeMetadataRowBatch::commit(postgres_client, ignore_validation_errors).await?;
        DataTypeRowBatch::commit(postgres_client, ignore_validation_errors).await?;
        PropertyTypeRowBatch::commit(postgres_client, ignore_validation_errors).await?;
        EntityTypeRowBatch::commit(postgres_client, ignore_validation_errors).await?;
        EntityRowBatch::commit(postgres_client, ignore_validation_errors).await?;
        ActionRowBatch::commit(postgres_client, ignore_validation_errors).await?;
        PolicyRowBatch::commit(postgres_client, ignore_validation_errors).await?;
        Ok(())
    }
}
