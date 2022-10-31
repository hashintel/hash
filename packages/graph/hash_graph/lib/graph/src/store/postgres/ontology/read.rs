use std::{fmt::Debug, str::FromStr};

use async_trait::async_trait;
use error_stack::{Context, IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::{uri::VersionedUri, DataType, EntityType, PropertyType};

use crate::{
    ontology::{
        PersistedDataType, PersistedEntityType, PersistedOntologyIdentifier,
        PersistedOntologyMetadata, PersistedOntologyType, PersistedPropertyType,
    },
    store::{
        crud::Read,
        postgres::{
            context::OntologyRecord,
            ontology::OntologyDatabaseType,
            query::{PostgresQueryRecord, SelectCompiler},
        },
        query::Filter,
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
    T: for<'q> PersistedOntologyType<
            Inner: PostgresQueryRecord<'q, Path<'q>: Debug + Sync>
                       + OntologyDatabaseType
                       + TryFrom<serde_json::Value, Error: Context>
                       + Send,
        > + Send,
{
    type Query<'q> = Filter<'q, T::Inner>;

    async fn read<'f: 'q, 'q>(&self, filter: &'f Self::Query<'q>) -> Result<Vec<T>, QueryError> {
        let mut compiler = SelectCompiler::with_default_selection();
        compiler.add_filter(filter);
        let (statement, parameters) = compiler.compile();

        self.as_client()
            .query_raw(&statement, parameters.iter().copied())
            .await
            .into_report()
            .change_context(QueryError)?
            .map(|row| row.into_report().change_context(QueryError))
            .and_then(|row| async move {
                let versioned_uri = VersionedUri::from_str(row.get(0))
                    .into_report()
                    .change_context(QueryError)?;
                let record = <T::Inner>::try_from(row.get::<_, serde_json::Value>(1))
                    .into_report()
                    .change_context(QueryError)?;
                let owned_by_id = row.get(2);
                let created_by_id = row.get(3);
                let updated_by_id = row.get(4);
                let removed_by_id = row.get(5);

                let identifier = PersistedOntologyIdentifier::new(versioned_uri, owned_by_id);
                Ok(T::new(
                    record,
                    PersistedOntologyMetadata::new(
                        identifier,
                        created_by_id,
                        updated_by_id,
                        removed_by_id,
                    ),
                ))
            })
            .try_collect()
            .await
    }
}
