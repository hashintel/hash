use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use tokio_postgres::{GenericClient, RowStream};
use type_system::DataType;

use crate::{
    ontology::{AccountId, PersistedDataType, PersistedOntologyIdentifier},
    store::{
        crud::Read,
        postgres::{ontology::OntologyDatabaseType, parameter_list},
        query::{resolve, Expression, Literal, Path, Resolve},
        AsClient, DataTypeStore, InsertionError, PostgresStore, QueryError, UpdateError,
    },
};

#[async_trait]
impl<C: AsClient> DataTypeStore for PostgresStore<C> {
    async fn create_data_type(
        &mut self,
        data_type: &DataType,
        created_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        let (_, identifier) = transaction.create(data_type, created_by).await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(identifier)
    }

    async fn update_data_type(
        &mut self,
        data_type: &DataType,
        updated_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(UpdateError)?,
        );

        let (_, identifier) = transaction.update(data_type, updated_by).await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(UpdateError)?;

        Ok(identifier)
    }
}

async fn read_data_types(client: &(impl GenericClient + Sync)) -> Result<RowStream, QueryError> {
    client
        .query_raw(
            r#"
            SELECT schema, created_by, MAX(version) OVER (PARTITION by base_uri) = version as latest
            FROM data_types
            INNER JOIN ids
	        ON data_types.version_id = ids.version_id
            ORDER BY base_uri, version DESC;
            "#,
            parameter_list([]),
        )
        .await
        .into_report()
        .change_context(QueryError)
}

// TODO: Make this stateful
//   A stateless filter is not able to reason about previous values or caches. Also, for more
//   complex queries it's not possible to query more data on demand
impl Resolve for (DataType, bool) {
    fn resolve_path(&self, path: &Path) -> Literal {
        match path.segments.as_slice() {
            [] => panic!("Path is empty"),
            [segment] => match segment.identifier.as_str() {
                "uri" => Literal::String(self.0.id().base_uri().to_string()),
                "version" => Literal::Version(self.0.id().version(), self.1),
                "title" => Literal::String(self.0.title().to_owned()),
                "description" => self
                    .0
                    .description()
                    .map_or(Literal::Null, |desc| Literal::String(desc.to_owned())),
                "type" => Literal::String(self.0.json_type().to_owned()),
                key => self
                    .0
                    .additional_properties()
                    .get(key)
                    .unwrap_or_else(|| panic!("Invalid data type key {key}"))
                    .clone()
                    .try_into()
                    .expect("Could not convert value into literal"),
            },
            [segment, segments @ ..] => {
                let value = self
                    .0
                    .additional_properties()
                    .get(&segment.identifier)
                    .unwrap_or_else(|| panic!("Invalid data type key {}", segment.identifier));
                Literal::try_from(value.clone())
                    .expect("Could not convert value into literal")
                    .resolve_path(&Path {
                        segments: segments.to_vec(),
                    })
            }
        }
    }
}

fn apply_filter(element: (DataType, bool), query: &Expression) -> Option<DataType> {
    let mut path = vec![];
    if let Literal::Bool(result) = resolve(query, &element, &mut path) {
        result.then_some(element.0)
    } else {
        panic!("Expression does not result in a boolean value")
    }
}

#[async_trait]
impl<C: AsClient> Read<PersistedDataType> for PostgresStore<C> {
    type Query<'q> = Expression;

    async fn read<'query>(
        &self,
        query: &Self::Query<'query>,
    ) -> Result<Vec<PersistedDataType>, QueryError> {
        let row_stream = read_data_types(self.as_client()).await?;

        row_stream
            .map(|row_result| row_result.into_report().change_context(QueryError))
            .try_filter_map(|row| async move {
                let element: DataType = serde_json::from_value(row.get(0))
                    .into_report()
                    .change_context(QueryError)?;

                let account_id: AccountId = row.get(1);

                Ok(apply_filter((element, row.get(2)), query).map(|element| {
                    let uri = element.versioned_uri();
                    let identifier = PersistedOntologyIdentifier::new(uri.clone(), account_id);
                    PersistedDataType {
                        inner: element,
                        identifier,
                    }
                }))
            })
            .try_collect()
            .await
    }
}
