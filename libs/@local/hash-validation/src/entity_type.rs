use std::borrow::Borrow;

use error_stack::{Report, ResultExt};
use futures::{stream, StreamExt, TryStreamExt};
use graph_types::knowledge::{
    entity::{Entity, EntityId, PropertyObject},
    link::LinkData,
};
use thiserror::Error;
use type_system::{
    url::{BaseUrl, OntologyTypeVersion, VersionedUrl},
    ClosedEntityType, DataType, Object, PropertyType,
};

use crate::{
    error::{Actual, Expected},
    EntityProvider, EntityTypeProvider, OntologyTypeProvider, Schema, Validate, ValidationProfile,
};

macro_rules! extend_report {
    ($status:ident, $error:expr $(,)?) => {
        if let Err(ref mut report) = $status {
            report.extend_one(error_stack::report!($error))
        } else {
            $status = Err(error_stack::report!($error))
        }
    };
}

#[derive(Debug, Error)]
pub enum EntityValidationError {
    #[error("The properties of the entity do not match the schema")]
    InvalidProperties,
    #[error("The entity is not a link but contains link data")]
    UnexpectedLinkData,
    #[error("The entity is a link but does not contain link data")]
    MissingLinkData,
    #[error("Entities without a type are not allowed")]
    EmptyEntityTypes,
    #[error("the validator was unable to read the entity type `{ids:?}`")]
    EntityTypeRetrieval { ids: Vec<VersionedUrl> },
    #[error("the validator was unable to read the entity `{id}`")]
    EntityRetrieval { id: EntityId },
    #[error("The link type `{link_types:?}` is not allowed")]
    InvalidLinkTypeId { link_types: Vec<VersionedUrl> },
    #[error("The link target `{target_types:?}` is not allowed")]
    InvalidLinkTargetId { target_types: Vec<VersionedUrl> },
}

impl<P> Schema<PropertyObject, P> for ClosedEntityType
where
    P: OntologyTypeProvider<PropertyType> + OntologyTypeProvider<DataType> + Sync,
{
    type Error = EntityValidationError;

    async fn validate_value<'a>(
        &'a self,
        value: &'a PropertyObject,
        profile: ValidationProfile,
        provider: &'a P,
    ) -> Result<(), Report<EntityValidationError>> {
        // TODO: Distinguish between format validation and content validation so it's possible
        //       to directly use the correct type.
        //   see https://linear.app/hash/issue/BP-33
        Object::<_, 0>::new(self.properties.clone(), self.required.clone())
            .expect("`Object` was already validated")
            .validate_value(value.properties(), profile, provider)
            .await
            .change_context(EntityValidationError::InvalidProperties)
            .attach_lazy(|| Expected::EntityType(self.clone()))
            .attach_lazy(|| Actual::Properties(value.clone()))
    }
}

impl<P> Validate<ClosedEntityType, P> for PropertyObject
where
    P: OntologyTypeProvider<PropertyType> + OntologyTypeProvider<DataType> + Sync,
{
    type Error = EntityValidationError;

    async fn validate(
        &self,
        schema: &ClosedEntityType,
        profile: ValidationProfile,
        provider: &P,
    ) -> Result<(), Report<Self::Error>> {
        schema.validate_value(self, profile, provider).await
    }
}

impl<P> Validate<ClosedEntityType, P> for Option<&LinkData>
where
    P: EntityProvider
        + EntityTypeProvider
        + OntologyTypeProvider<PropertyType>
        + OntologyTypeProvider<DataType>
        + Sync,
{
    type Error = EntityValidationError;

    async fn validate(
        &self,
        schema: &ClosedEntityType,
        profile: ValidationProfile,
        provider: &P,
    ) -> Result<(), Report<Self::Error>> {
        let mut status: Result<(), Report<EntityValidationError>> = Ok(());

        // TODO: The link type should be a const but the type system crate does not allow
        //       to make this a `const` variable.
        //   see https://linear.app/hash/issue/BP-57
        let link_type_id = VersionedUrl {
            base_url: BaseUrl::new(
                "https://blockprotocol.org/@blockprotocol/types/entity-type/link/".to_owned(),
            )
            .expect("Not a valid URL"),
            version: OntologyTypeVersion::new(1),
        };
        let is_link = schema.schemas.contains_key(&link_type_id);

        if let Some(link_data) = self {
            if !is_link {
                extend_report!(status, EntityValidationError::UnexpectedLinkData);
            }

            if let Err(error) = schema.validate_value(*link_data, profile, provider).await {
                extend_report!(status, error);
            }
        } else if is_link {
            extend_report!(status, EntityValidationError::MissingLinkData);
        }

        status
    }
}

impl<P> Validate<ClosedEntityType, P> for Entity
where
    P: EntityProvider
        + EntityTypeProvider
        + OntologyTypeProvider<PropertyType>
        + OntologyTypeProvider<DataType>
        + Sync,
{
    type Error = EntityValidationError;

    async fn validate(
        &self,
        schema: &ClosedEntityType,
        profile: ValidationProfile,
        provider: &P,
    ) -> Result<(), Report<Self::Error>> {
        let mut status: Result<(), Report<EntityValidationError>> = Ok(());

        if self.metadata.entity_type_ids.is_empty() {
            extend_report!(status, EntityValidationError::EmptyEntityTypes);
        }
        if let Err(error) = self.properties.validate(schema, profile, provider).await {
            extend_report!(status, error);
        }
        if let Err(error) = self
            .link_data
            .as_ref()
            .validate(schema, profile, provider)
            .await
        {
            extend_report!(status, error);
        }

        status
    }
}

impl<P> Schema<LinkData, P> for ClosedEntityType
where
    P: EntityProvider + EntityTypeProvider + Sync,
{
    type Error = EntityValidationError;

    // TODO: validate link data
    //   see https://linear.app/hash/issue/H-972
    async fn validate_value<'a>(
        &'a self,
        link_data: &'a LinkData,
        _: ValidationProfile,
        provider: &'a P,
    ) -> Result<(), Report<EntityValidationError>> {
        let mut status: Result<(), Report<EntityValidationError>> = Ok(());

        let left_entity = provider
            .provide_entity(link_data.left_entity_id, true)
            .await
            .change_context_lazy(|| EntityValidationError::EntityRetrieval {
                id: link_data.left_entity_id,
            })?;

        let left_entity_type = stream::iter(&left_entity.borrow().metadata.entity_type_ids)
            .then(|entity_type| async {
                Ok::<_, Report<EntityValidationError>>(
                    provider
                        .provide_type(entity_type)
                        .await
                        .change_context_lazy(|| EntityValidationError::EntityTypeRetrieval {
                            ids: left_entity.borrow().metadata.entity_type_ids.clone(),
                        })?
                        .borrow()
                        .clone(),
                )
            })
            .try_collect::<Self>()
            .await?;

        let right_entity = provider
            .provide_entity(link_data.right_entity_id, true)
            .await
            .change_context_lazy(|| EntityValidationError::EntityRetrieval {
                id: link_data.right_entity_id,
            })?;

        let right_entity_type = stream::iter(&right_entity.borrow().metadata.entity_type_ids)
            .then(|entity_type| async {
                Ok::<_, Report<EntityValidationError>>(
                    provider
                        .provide_type(entity_type)
                        .await
                        .change_context_lazy(|| EntityValidationError::EntityTypeRetrieval {
                            ids: right_entity.borrow().metadata.entity_type_ids.clone(),
                        })?
                        .borrow()
                        .clone(),
                )
            })
            .try_collect::<Self>()
            .await?;

        // We track that at least one link type was found to avoid reporting an error if no
        // link type was found.
        let mut found_link_target = false;
        for link_type_id in self.schemas.keys() {
            let Some(maybe_allowed_targets) = left_entity_type.links.links().get(link_type_id)
            else {
                continue;
            };

            // At least one link type was found
            found_link_target = true;

            let Some(allowed_targets) = maybe_allowed_targets.array().items() else {
                continue;
            };

            // Link destinations are constrained, search for the right entity's type
            let mut found_match = false;
            for allowed_target in allowed_targets.one_of() {
                if right_entity_type
                    .schemas
                    .keys()
                    .any(|right_type| right_type.base_url == allowed_target.url().base_url)
                {
                    found_match = true;
                    break;
                }
            }

            if !found_match {
                extend_report!(
                    status,
                    EntityValidationError::InvalidLinkTargetId {
                        target_types: right_entity_type.schemas.keys().cloned().collect(),
                    }
                );
            }
        }

        if !found_link_target {
            extend_report!(
                status,
                EntityValidationError::InvalidLinkTypeId {
                    link_types: self.schemas.keys().cloned().collect(),
                }
            );
        }

        status
    }
}

#[cfg(test)]
mod tests {
    use crate::{tests::validate_entity, ValidationProfile};

    #[tokio::test]
    async fn address() {
        let entities = [];
        let entity_types = [];
        let property_types = [
            graph_test_data::property_type::ADDRESS_LINE_1_V1,
            graph_test_data::property_type::POSTCODE_NUMBER_V1,
            graph_test_data::property_type::CITY_V1,
        ];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_entity(
            graph_test_data::entity::ADDRESS_V1,
            graph_test_data::entity_type::UK_ADDRESS_V1,
            entities,
            entity_types,
            property_types,
            data_types,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn block() {
        let entities = [];
        let entity_types = [];
        let property_types = [graph_test_data::property_type::NAME_V1];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_entity(
            graph_test_data::entity::BLOCK_V1,
            graph_test_data::entity_type::BLOCK_V1,
            entities,
            entity_types,
            property_types,
            data_types,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn book() {
        let entities = [];
        let entity_types = [];
        let property_types = [
            graph_test_data::property_type::NAME_V1,
            graph_test_data::property_type::BLURB_V1,
            graph_test_data::property_type::PUBLISHED_ON_V1,
        ];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_entity(
            graph_test_data::entity::BOOK_V1,
            graph_test_data::entity_type::BOOK_V1,
            entities,
            entity_types,
            property_types,
            data_types,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn building() {
        let entities = [];
        let entity_types = [];
        let property_types = [];
        let data_types = [];

        validate_entity(
            graph_test_data::entity::BUILDING_V1,
            graph_test_data::entity_type::BUILDING_V1,
            entities,
            entity_types,
            property_types,
            data_types,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn organization() {
        let entities = [];
        let entity_types = [];
        let property_types = [graph_test_data::property_type::NAME_V1];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_entity(
            graph_test_data::entity::ORGANIZATION_V1,
            graph_test_data::entity_type::ORGANIZATION_V1,
            entities,
            entity_types,
            property_types,
            data_types,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn page() {
        let entities = [];
        let entity_types = [];
        let property_types = [graph_test_data::property_type::TEXT_V1];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_entity(
            graph_test_data::entity::PAGE_V1,
            graph_test_data::entity_type::PAGE_V1,
            entities.to_vec(),
            entity_types,
            property_types,
            data_types,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");

        validate_entity(
            graph_test_data::entity::PAGE_V2,
            graph_test_data::entity_type::PAGE_V2,
            entities,
            entity_types,
            property_types,
            data_types,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn person() {
        let entities = [];
        let entity_types = [];
        let property_types = [
            graph_test_data::property_type::NAME_V1,
            graph_test_data::property_type::AGE_V1,
        ];
        let data_types = [
            graph_test_data::data_type::TEXT_V1,
            graph_test_data::data_type::NUMBER_V1,
        ];

        validate_entity(
            graph_test_data::entity::PERSON_ALICE_V1,
            graph_test_data::entity_type::PERSON_V1,
            entities.to_vec(),
            entity_types,
            property_types,
            data_types,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");

        validate_entity(
            graph_test_data::entity::PERSON_BOB_V1,
            graph_test_data::entity_type::PERSON_V1,
            entities.to_vec(),
            entity_types,
            property_types,
            data_types,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");

        validate_entity(
            graph_test_data::entity::PERSON_CHARLES_V1,
            graph_test_data::entity_type::PERSON_V1,
            entities,
            entity_types,
            property_types,
            data_types,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn playlist() {
        let entities = [];
        let entity_types = [];
        let property_types = [graph_test_data::property_type::NAME_V1];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_entity(
            graph_test_data::entity::PLAYLIST_V1,
            graph_test_data::entity_type::PLAYLIST_V1,
            entities,
            entity_types,
            property_types,
            data_types,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn song() {
        let entities = [];
        let entity_types = [];
        let property_types = [graph_test_data::property_type::NAME_V1];
        let data_types = [graph_test_data::data_type::TEXT_V1];

        validate_entity(
            graph_test_data::entity::SONG_V1,
            graph_test_data::entity_type::SONG_V1,
            entities,
            entity_types,
            property_types,
            data_types,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");
    }
}
