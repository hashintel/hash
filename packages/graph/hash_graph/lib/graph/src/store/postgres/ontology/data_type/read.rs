use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use tokio_postgres::{GenericClient, RowStream};
use type_system::DataType;

use crate::{
    ontology::{AccountId, PersistedDataType, PersistedOntologyIdentifier},
    store::{
        postgres::parameter_list,
        query::{Expression, ExpressionResolver, Literal, Path, PathResolver},
        QueryError,
    },
};

pub struct PostgresDataTypeResolver<'con, C> {
    client: &'con C,
}

impl<'con, C> PostgresDataTypeResolver<'con, C> {
    #[must_use]
    pub const fn new(client: &'con C) -> Self {
        Self { client }
    }
}

pub struct DataTypeRecordResolver<'record, 'con, C> {
    data_type: &'record DataType,
    is_latest: bool,
    client: &'con C,
}

#[async_trait]
impl<C: Sync> PathResolver for DataTypeRecordResolver<'_, '_, C> {
    async fn resolve(&self, path: &Path) -> Literal {
        match path.segments.as_slice() {
            [] => panic!("Path is empty"),
            [segment] => match segment.identifier.as_str() {
                "uri" => Literal::String(self.data_type.id().base_uri().to_string()),
                "version" => Literal::Version(self.data_type.id().version(), self.is_latest),
                "title" => Literal::String(self.data_type.title().to_owned()),
                "description" => self
                    .data_type
                    .description()
                    .map_or(Literal::Null, |desc| Literal::String(desc.to_owned())),
                "type" => Literal::String(self.data_type.json_type().to_owned()),
                key => self
                    .data_type
                    .additional_properties()
                    .get(key)
                    .unwrap_or_else(|| panic!("Invalid data type key {key}"))
                    .clone()
                    .try_into()
                    .expect("Could not convert value into literal"),
            },
            [segment, segments @ ..] => {
                let value = self
                    .data_type
                    .additional_properties()
                    .get(&segment.identifier)
                    .unwrap_or_else(|| panic!("Invalid data type key {}", segment.identifier));
                Literal::try_from(value.clone())
                    .expect("Could not convert value into literal")
                    .resolve(&Path {
                        segments: segments.to_vec(),
                    })
                    .await
            }
        }
    }
}

impl<'con, C: GenericClient + Sync> PostgresDataTypeResolver<'con, C> {
    pub async fn read_data_types(&self) -> Result<RowStream, QueryError> {
        self.client
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
}

#[async_trait]
impl<C: GenericClient + Sync> ExpressionResolver for PostgresDataTypeResolver<'_, C> {
    type Record = PersistedDataType;

    async fn resolve(&mut self, expression: &Expression) -> Result<Vec<Self::Record>, QueryError> {
        let client = &self.client;
        self.read_data_types()
            .await?
            .map(|row_result| row_result.into_report().change_context(QueryError))
            .try_filter_map(|row| async move {
                let element: DataType = serde_json::from_value(row.get(0))
                    .into_report()
                    .change_context(QueryError)?;

                let mut resolver = DataTypeRecordResolver {
                    data_type: &element,
                    is_latest: row.get(2),
                    client,
                };

                if let Literal::Bool(result) = expression.evaluate(&mut resolver).await {
                    Ok(result.then(|| {
                        let uri = element.id();
                        let account_id: AccountId = row.get(1);
                        let identifier = PersistedOntologyIdentifier::new(uri.clone(), account_id);
                        PersistedDataType {
                            inner: element,
                            identifier,
                        }
                    }))
                } else {
                    panic!("Expression does not result in a boolean value")
                }
            })
            .try_collect()
            .await
    }
}
