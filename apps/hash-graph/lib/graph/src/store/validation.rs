use authorization::{
    schema::{DataTypeId, DataTypePermission, PropertyTypeId, PropertyTypePermission},
    zanzibar::Consistency,
    AuthorizationApi,
};
use error_stack::{Report, ResultExt};
use graph_types::{
    account::AccountId,
    ontology::{DataTypeWithMetadata, PropertyTypeWithMetadata},
};
use type_system::{url::VersionedUrl, DataType, PropertyType};
use validation::OntologyTypeProvider;

use crate::{
    store::{crud::Read, query::Filter, QueryError},
    subgraph::temporal_axes::QueryTemporalAxesUnresolved,
};

#[derive(Debug, Copy, Clone)]
pub struct StoreProvider<'a, S, A> {
    pub store: &'a S,
    pub actor_id: AccountId,
    pub authorization_api: &'a A,
    pub consistency: Consistency<'static>,
}

impl<S, A> OntologyTypeProvider<DataType> for StoreProvider<'_, S, A>
where
    S: Read<DataTypeWithMetadata, Record = DataTypeWithMetadata>,
    A: AuthorizationApi + Sync,
{
    #[expect(refining_impl_trait)]
    async fn provide_type(&self, type_id: &VersionedUrl) -> Result<DataType, Report<QueryError>> {
        let data_type_id = DataTypeId::from_url(type_id);
        self.authorization_api
            .check_data_type_permission(
                self.actor_id,
                DataTypePermission::View,
                data_type_id,
                self.consistency,
            )
            .await
            .change_context(QueryError)?
            .assert_permission()
            .change_context(QueryError)?;

        self.store
            .read_one(
                &Filter::<S::Record>::for_versioned_url(type_id),
                Some(&QueryTemporalAxesUnresolved::default().resolve()),
            )
            .await
            .map(|data_type| data_type.schema)
    }
}

impl<S, A> OntologyTypeProvider<PropertyType> for StoreProvider<'_, S, A>
where
    S: Read<PropertyTypeWithMetadata, Record = PropertyTypeWithMetadata>,
    A: AuthorizationApi + Sync,
{
    #[expect(refining_impl_trait)]
    async fn provide_type(
        &self,
        type_id: &VersionedUrl,
    ) -> Result<PropertyType, Report<QueryError>> {
        let data_type_id = PropertyTypeId::from_url(type_id);
        self.authorization_api
            .check_property_type_permission(
                self.actor_id,
                PropertyTypePermission::View,
                data_type_id,
                self.consistency,
            )
            .await
            .change_context(QueryError)?
            .assert_permission()
            .change_context(QueryError)?;

        self.store
            .read_one(
                &Filter::<S::Record>::for_versioned_url(type_id),
                Some(&QueryTemporalAxesUnresolved::default().resolve()),
            )
            .await
            .map(|data_type| data_type.schema)
    }
}
