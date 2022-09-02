use async_trait::async_trait;
use error_stack::{bail, Context, Report, Result, ResultExt};
use futures::TryStreamExt;
use type_system::{DataType, EntityType, LinkType, PropertyType};

use crate::{
    ontology::{
        PersistedDataType, PersistedEntityType, PersistedLinkType, PersistedOntologyIdentifier,
        PersistedPropertyType,
    },
    store::{
        crud::Read,
        postgres::{
            ontology::OntologyDatabaseType,
            resolve::{PostgresContext, Record},
        },
        query::{Expression, ExpressionError, Literal, Resolve},
        AsClient, PostgresStore, QueryError,
    },
};

pub trait PersistedOntologyType {
    type Inner;

    fn new(inner: Self::Inner, identifier: PersistedOntologyIdentifier) -> Self;
}

impl PersistedOntologyType for PersistedDataType {
    type Inner = DataType;

    fn new(inner: Self::Inner, identifier: PersistedOntologyIdentifier) -> Self {
        Self { inner, identifier }
    }
}

impl PersistedOntologyType for PersistedPropertyType {
    type Inner = PropertyType;

    fn new(inner: Self::Inner, identifier: PersistedOntologyIdentifier) -> Self {
        Self { inner, identifier }
    }
}

impl PersistedOntologyType for PersistedLinkType {
    type Inner = LinkType;

    fn new(inner: Self::Inner, identifier: PersistedOntologyIdentifier) -> Self {
        Self { inner, identifier }
    }
}

impl PersistedOntologyType for PersistedEntityType {
    type Inner = EntityType;

    fn new(inner: Self::Inner, identifier: PersistedOntologyIdentifier) -> Self {
        Self { inner, identifier }
    }
}

#[async_trait]
impl<C: AsClient, T> Read<T> for PostgresStore<C>
where
    T: PersistedOntologyType + Send,
    T::Inner: OntologyDatabaseType + TryFrom<serde_json::Value> + Send,
    <T::Inner as TryFrom<serde_json::Value>>::Error: Context,
    Record<T::Inner>: Resolve<Self> + Sync,
{
    type Query<'q> = Expression;

    async fn read<'query>(&self, query: &Self::Query<'query>) -> Result<Vec<T>, QueryError> {
        self.read_all_ontology_types::<T::Inner>()
            .await?
            .try_filter_map(|ontology_type| async move {
                if let Literal::Bool(result) = query
                    .evaluate(&ontology_type, self)
                    .await
                    .change_context(QueryError)?
                {
                    Ok(result.then(|| {
                        let uri = ontology_type.record.versioned_uri();
                        let identifier =
                            PersistedOntologyIdentifier::new(uri.clone(), ontology_type.account_id);
                        T::new(ontology_type.record, identifier)
                    }))
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
