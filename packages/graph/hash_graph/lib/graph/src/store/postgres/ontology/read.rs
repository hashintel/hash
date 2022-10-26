use async_trait::async_trait;
use error_stack::{bail, Context, Report, Result, ResultExt};
use futures::{stream, StreamExt, TryStreamExt};
use type_system::{DataType, EntityType, LinkType, PropertyType};

use crate::{
    ontology::{
        PersistedDataType, PersistedEntityType, PersistedLinkType, PersistedOntologyIdentifier,
        PersistedOntologyMetadata, PersistedOntologyType, PersistedPropertyType,
    },
    store::{
        crud::Read,
        postgres::{
            context::{OntologyRecord, PostgresContext},
            ontology::OntologyDatabaseType,
        },
        query::{Expression, ExpressionError, Literal, Resolve},
        AsClient, PostgresStore, QueryError,
    },
};

impl From<OntologyRecord<DataType>> for PersistedDataType {
    fn from(data_type: OntologyRecord<DataType>) -> Self {
        let identifier =
            PersistedOntologyIdentifier::new(data_type.record.id().clone(), data_type.owned_by_id);

        Self::new(
            data_type.record,
            PersistedOntologyMetadata::new(
                identifier,
                data_type.created_by_id,
                data_type.updated_by_id,
                data_type.removed_by_id,
            ),
        )
    }
}

impl From<OntologyRecord<PropertyType>> for PersistedPropertyType {
    fn from(property_type: OntologyRecord<PropertyType>) -> Self {
        let identifier = PersistedOntologyIdentifier::new(
            property_type.record.id().clone(),
            property_type.owned_by_id,
        );

        Self::new(
            property_type.record,
            PersistedOntologyMetadata::new(
                identifier,
                property_type.created_by_id,
                property_type.updated_by_id,
                property_type.removed_by_id,
            ),
        )
    }
}

impl From<OntologyRecord<LinkType>> for PersistedLinkType {
    fn from(link_type: OntologyRecord<LinkType>) -> Self {
        let identifier =
            PersistedOntologyIdentifier::new(link_type.record.id().clone(), link_type.owned_by_id);

        Self::new(
            link_type.record,
            PersistedOntologyMetadata::new(
                identifier,
                link_type.created_by_id,
                link_type.updated_by_id,
                link_type.removed_by_id,
            ),
        )
    }
}

impl From<OntologyRecord<EntityType>> for PersistedEntityType {
    fn from(entity_type: OntologyRecord<EntityType>) -> Self {
        let identifier = PersistedOntologyIdentifier::new(
            entity_type.record.id().clone(),
            entity_type.owned_by_id,
        );
        Self::new(
            entity_type.record,
            PersistedOntologyMetadata::new(
                identifier,
                entity_type.created_by_id,
                entity_type.updated_by_id,
                entity_type.removed_by_id,
            ),
        )
    }
}

#[async_trait]
impl<C: AsClient, T> Read<T> for PostgresStore<C>
where
    T: PersistedOntologyType + From<OntologyRecord<T::Inner>> + Send,
    T::Inner: OntologyDatabaseType + TryFrom<serde_json::Value, Error: Context> + Send,
    OntologyRecord<T::Inner>: Resolve<Self> + Sync,
{
    type Query<'q> = Expression;

    async fn read<'query>(&self, query: &Self::Query<'query>) -> Result<Vec<T>, QueryError> {
        // TODO: We need to work around collecting all records before filtering
        //   related: https://app.asana.com/0/1202805690238892/1202923536131158/f
        stream::iter(
            self.read_all_ontology_types::<T::Inner>()
                .await?
                .collect::<Vec<_>>()
                .await,
        )
        .try_filter_map(|ontology_type| async move {
            if let Literal::Bool(result) = query
                .evaluate(&ontology_type, self)
                .await
                .change_context(QueryError)?
            {
                Ok(result.then(|| T::from(ontology_type)))
            } else {
                bail!(
                    Report::new(ExpressionError)
                        .attach_printable("does not result in a boolean value")
                        .change_context(QueryError)
                );
            }
        })
        .try_collect()
        .await
    }
}
