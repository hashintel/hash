use std::{fmt::Debug, str::FromStr};

use async_trait::async_trait;
use error_stack::{Context, IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::{uri::VersionedUri, DataType, EntityType, PropertyType};

use crate::{
    ontology::{
        DataTypeWithMetadata, EntityTypeWithMetadata, OntologyElementMetadata,
        PersistedOntologyType, PropertyTypeWithMetadata,
    },
    provenance::{CreatedById, OwnedById, ProvenanceMetadata, UpdatedById},
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

impl From<OntologyRecord<DataType>> for DataTypeWithMetadata {
    fn from(data_type: OntologyRecord<DataType>) -> Self {
        let identifier = data_type.record.id().clone().into();

        Self::new(
            data_type.record,
            OntologyElementMetadata::new(
                identifier,
                ProvenanceMetadata::new(data_type.created_by_id, data_type.updated_by_id),
                data_type.owned_by_id,
            ),
        )
    }
}

impl From<OntologyRecord<PropertyType>> for PropertyTypeWithMetadata {
    fn from(property_type: OntologyRecord<PropertyType>) -> Self {
        let identifier = property_type.record.id().clone().into();

        Self::new(
            property_type.record,
            OntologyElementMetadata::new(
                identifier,
                ProvenanceMetadata::new(property_type.created_by_id, property_type.updated_by_id),
                property_type.owned_by_id,
            ),
        )
    }
}

impl From<OntologyRecord<EntityType>> for EntityTypeWithMetadata {
    fn from(entity_type: OntologyRecord<EntityType>) -> Self {
        let identifier = entity_type.record.id().clone().into();
        Self::new(
            entity_type.record,
            OntologyElementMetadata::new(
                identifier,
                ProvenanceMetadata::new(entity_type.created_by_id, entity_type.updated_by_id),
                entity_type.owned_by_id,
            ),
        )
    }
}

#[async_trait]
impl<C: AsClient, T> Read<T> for PostgresStore<C>
where
    T: for<'q> PersistedOntologyType<
            Inner: PostgresQueryRecord<Path<'q>: Debug + Sync>
                       + OntologyDatabaseType
                       + TryFrom<serde_json::Value, Error: Context>
                       + Send
                       + 'static,
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
                let owned_by_id = OwnedById::new(row.get(2));
                let created_by_id = CreatedById::new(row.get(3));
                let updated_by_id = UpdatedById::new(row.get(4));

                let edition_identifier = versioned_uri.into();
                Ok(T::new(
                    record,
                    OntologyElementMetadata::new(
                        edition_identifier,
                        ProvenanceMetadata::new(created_by_id, updated_by_id),
                        owned_by_id,
                    ),
                ))
            })
            .try_collect()
            .await
    }
}
