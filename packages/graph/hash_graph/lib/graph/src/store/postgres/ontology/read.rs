use async_trait::async_trait;
use error_stack::{bail, Context, Report, Result, ResultExt};
use futures::{stream, StreamExt, TryStreamExt};
use type_system::{DataType, EntityType, LinkType, PropertyType};

use crate::{
    ontology::{
        PersistedDataType, PersistedEntityType, PersistedLinkType, PersistedOntologyIdentifier,
        PersistedOntologyMetadata, PersistedPropertyType,
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

pub trait PersistedOntologyType {
    type Inner;

    fn from_record(record: OntologyRecord<Self::Inner>) -> Self;
}

impl PersistedOntologyType for PersistedDataType {
    type Inner = DataType;

    fn from_record(data_type: OntologyRecord<Self::Inner>) -> Self {
        let identifier =
            PersistedOntologyIdentifier::new(data_type.record.id().clone(), data_type.account_id);
        Self::new(data_type.record, PersistedOntologyMetadata::new(identifier))
    }
}

impl PersistedOntologyType for PersistedPropertyType {
    type Inner = PropertyType;

    fn from_record(property_type: OntologyRecord<Self::Inner>) -> Self {
        let identifier = PersistedOntologyIdentifier::new(
            property_type.record.id().clone(),
            property_type.account_id,
        );
        Self::new(
            property_type.record,
            PersistedOntologyMetadata::new(identifier),
        )
    }
}

impl PersistedOntologyType for PersistedLinkType {
    type Inner = LinkType;

    fn from_record(link_type: OntologyRecord<Self::Inner>) -> Self {
        let identifier =
            PersistedOntologyIdentifier::new(link_type.record.id().clone(), link_type.account_id);
        Self::new(link_type.record, PersistedOntologyMetadata::new(identifier))
    }
}

impl PersistedOntologyType for PersistedEntityType {
    type Inner = EntityType;

    fn from_record(entity_type: OntologyRecord<Self::Inner>) -> Self {
        let identifier = PersistedOntologyIdentifier::new(
            entity_type.record.id().clone(),
            entity_type.account_id,
        );
        Self::new(
            entity_type.record,
            PersistedOntologyMetadata::new(identifier),
        )
    }
}

#[async_trait]
impl<C: AsClient, T> Read<T> for PostgresStore<C>
where
    T: PersistedOntologyType + Send,
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
                Ok(result.then(|| T::from_record(ontology_type)))
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
