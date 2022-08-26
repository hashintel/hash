use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use tokio_postgres::{GenericClient, RowStream};
use type_system::PropertyType;

use crate::{
    ontology::{AccountId, PersistedOntologyIdentifier, PersistedPropertyType},
    store::{
        postgres::parameter_list,
        query::{Expression, ExpressionResolver, Literal, Path, PathResolver},
        QueryError,
    },
};

pub struct PostgresPropertyTypeResolver<'con, C> {
    client: &'con C,
}

impl<'con, C> PostgresPropertyTypeResolver<'con, C> {
    #[must_use]
    pub const fn new(client: &'con C) -> Self {
        Self { client }
    }
}

impl<'con, C: GenericClient + Sync> PostgresPropertyTypeResolver<'con, C> {
    pub async fn read_property_types(&self) -> Result<RowStream, QueryError> {
        self.client
            .query_raw(
                r#"
                SELECT schema, created_by, MAX(version) OVER (PARTITION by base_uri) = version as latest
                FROM property_types
                INNER JOIN ids
                ON property_types.version_id = ids.version_id
                ORDER BY base_uri, version DESC;
                "#,
                parameter_list([]),
            )
            .await
            .into_report()
            .change_context(QueryError)
    }
}

pub struct PropertyTypeRecordResolver<'record, 'con, C> {
    property_type: &'record PropertyType,
    is_latest: bool,
    client: &'con C,
}

#[async_trait]
impl<C: Sync> PathResolver for PropertyTypeRecordResolver<'_, '_, C> {
    async fn resolve(&self, path: &Path) -> Literal {
        match path.segments.as_slice() {
            [] => panic!("Path is empty"),
            [segment] => match segment.identifier.as_str() {
                "uri" => Literal::String(self.property_type.id().base_uri().to_string()),
                "version" => Literal::Version(self.property_type.id().version(), self.is_latest),
                "title" => Literal::String(self.property_type.title().to_owned()),
                "description" => self
                    .property_type
                    .description()
                    .map_or(Literal::Null, |desc| Literal::String(desc.to_owned())),
                key => panic!("{key} is not a valid property type key"),
            },
            [segment, segments @ ..] => match segment.identifier.as_str() {
                "dataTypes" => todo!("Implement data types for {segments:?}"),
                "propertyTypes" => todo!("Implement property types for {segments:?}"),
                key => panic!("{key} is not a valid property type key"),
            },
        }
    }
}

#[async_trait]
impl<C: GenericClient + Sync> ExpressionResolver for PostgresPropertyTypeResolver<'_, C> {
    type Record = PersistedPropertyType;

    async fn resolve(&mut self, expression: &Expression) -> Result<Vec<Self::Record>, QueryError> {
        let client = &self.client;
        self.read_property_types()
            .await?
            .map(|row_result| row_result.into_report().change_context(QueryError))
            .try_filter_map(|row| async move {
                let element: PropertyType = serde_json::from_value(row.get(0))
                    .into_report()
                    .change_context(QueryError)?;

                let mut resolver = PropertyTypeRecordResolver {
                    property_type: &element,
                    is_latest: row.get(2),
                    client,
                };

                if let Literal::Bool(result) = expression.evaluate(&mut resolver).await {
                    Ok(result.then(|| {
                        let uri = element.id();
                        let account_id: AccountId = row.get(1);
                        let identifier = PersistedOntologyIdentifier::new(uri.clone(), account_id);
                        PersistedPropertyType {
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
