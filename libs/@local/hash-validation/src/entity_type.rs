use std::collections::HashMap;

use error_stack::{Report, ResultExt};
use graph_types::knowledge::entity::{Entity, EntityProperties};
use serde_json::Value as JsonValue;
use thiserror::Error;
use type_system::{url::BaseUrl, DataType, EntityType, Object, PropertyType};

use crate::{
    error::{Actual, Expected},
    OntologyTypeProvider, Schema, Validate,
};

#[derive(Debug, Error)]
pub enum EntityValidationError {
    #[error("The properties of the entity do not match the schema")]
    InvalidProperties,
}

impl<P> Schema<HashMap<BaseUrl, JsonValue>, P> for EntityType
where
    P: OntologyTypeProvider<PropertyType> + OntologyTypeProvider<DataType> + Sync,
{
    type Error = EntityValidationError;

    async fn validate_value<'a>(
        &'a self,
        value: &'a HashMap<BaseUrl, serde_json::Value>,
        provider: &'a P,
    ) -> Result<(), Report<EntityValidationError>> {
        // TODO: Distinguish between format validation and content validation so it's possible
        //       to directly use the correct type.
        //   see https://linear.app/hash/issue/BP-33
        Object::<_, 0>::new(self.properties().clone(), self.required().to_vec())
            .expect("`Object` was already validated")
            .validate_value(value, provider)
            .await
            .change_context(EntityValidationError::InvalidProperties)
            .attach_lazy(|| Expected::EntityType(self.clone()))
            .attach_lazy(|| Actual::Properties(EntityProperties::new(value.clone())))
    }
}

impl<P> Validate<EntityType, P> for EntityProperties
where
    P: OntologyTypeProvider<PropertyType> + OntologyTypeProvider<DataType> + Sync,
{
    type Error = EntityValidationError;

    async fn validate(&self, schema: &EntityType, provider: &P) -> Result<(), Report<Self::Error>> {
        schema.validate_value(self.properties(), provider).await
    }
}

impl<P> Validate<EntityType, P> for Entity
where
    P: OntologyTypeProvider<PropertyType> + OntologyTypeProvider<DataType> + Sync,
{
    type Error = EntityValidationError;

    async fn validate(&self, schema: &EntityType, provider: &P) -> Result<(), Report<Self::Error>> {
        self.properties.validate(schema, provider).await
    }
}

#[cfg(test)]
mod tests {
    use crate::tests::validate_entity;

    #[tokio::test]
    async fn address() {
        let property_types = [
            graph_test_data::property_type::ADDRESS_LINE_1_V1,
            graph_test_data::property_type::POSTCODE_NUMBER_V1,
            graph_test_data::property_type::CITY_V1,
        ];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_entity(
            graph_test_data::entity::ADDRESS_V1,
            graph_test_data::entity_type::UK_ADDRESS_V1,
            property_types,
            data_types,
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn block() {
        let property_types = [graph_test_data::property_type::NAME_V1];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_entity(
            graph_test_data::entity::BLOCK_V1,
            graph_test_data::entity_type::BLOCK_V1,
            property_types,
            data_types,
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn book() {
        validate_entity(
            graph_test_data::entity::BOOK_V1,
            graph_test_data::entity_type::BOOK_V1,
            [
                graph_test_data::property_type::NAME_V1,
                graph_test_data::property_type::BLURB_V1,
                graph_test_data::property_type::PUBLISHED_ON_V1,
            ],
            [graph_test_data::data_type::TEXT_V1],
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn building() {
        let property_types = [];
        let data_types = [];

        validate_entity(
            graph_test_data::entity::BUILDING_V1,
            graph_test_data::entity_type::BUILDING_V1,
            property_types,
            data_types,
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn organization() {
        let property_types = [graph_test_data::property_type::NAME_V1];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_entity(
            graph_test_data::entity::ORGANIZATION_V1,
            graph_test_data::entity_type::ORGANIZATION_V1,
            property_types,
            data_types,
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn page() {
        let property_types = [graph_test_data::property_type::TEXT_V1];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_entity(
            graph_test_data::entity::PAGE_V1,
            graph_test_data::entity_type::PAGE_V1,
            property_types,
            data_types,
        )
        .await
        .expect("validation failed");

        validate_entity(
            graph_test_data::entity::PAGE_V2,
            graph_test_data::entity_type::PAGE_V2,
            property_types,
            data_types,
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn person() {
        let property_types = [graph_test_data::property_type::NAME_V1];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_entity(
            graph_test_data::entity::PERSON_ALICE_V1,
            graph_test_data::entity_type::PERSON_V1,
            property_types,
            data_types,
        )
        .await
        .expect("validation failed");

        validate_entity(
            graph_test_data::entity::PERSON_BOB_V1,
            graph_test_data::entity_type::PERSON_V1,
            property_types,
            data_types,
        )
        .await
        .expect("validation failed");

        validate_entity(
            graph_test_data::entity::PERSON_CHARLES_V1,
            graph_test_data::entity_type::PERSON_V1,
            property_types,
            data_types,
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn playlist() {
        let property_types = [graph_test_data::property_type::NAME_V1];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_entity(
            graph_test_data::entity::PLAYLIST_V1,
            graph_test_data::entity_type::PLAYLIST_V1,
            property_types,
            data_types,
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn song() {
        let property_types = [graph_test_data::property_type::NAME_V1];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_entity(
            graph_test_data::entity::SONG_V1,
            graph_test_data::entity_type::SONG_V1,
            property_types,
            data_types,
        )
        .await
        .expect("validation failed");
    }
}
