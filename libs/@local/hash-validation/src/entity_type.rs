use std::{borrow::Borrow, collections::HashMap};

use error_stack::{Report, ResultExt};
use graph_types::knowledge::{
    entity::{Entity, EntityId, EntityProperties},
    link::LinkData,
};
use serde_json::Value as JsonValue;
use thiserror::Error;
use type_system::{
    url::{BaseUrl, VersionedUrl},
    DataType, EntityType, Object, PropertyType,
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
    #[error("the validator was unable to read the entity type `{id}`")]
    EntityTypeRetrieval { id: VersionedUrl },
    #[error("the validator was unable to read the entity `{id}`")]
    EntityRetrieval { id: EntityId },
    #[error("The link type `{link_type}` is not allowed")]
    InvalidLinkTypeId { link_type: VersionedUrl },
    #[error("The link target `{target_type}` is not allowed")]
    InvalidLinkTargetId { target_type: VersionedUrl },
}

impl<P> Schema<HashMap<BaseUrl, JsonValue>, P> for EntityType
where
    P: OntologyTypeProvider<PropertyType> + OntologyTypeProvider<DataType> + Sync,
{
    type Error = EntityValidationError;

    async fn validate_value<'a>(
        &'a self,
        value: &'a HashMap<BaseUrl, serde_json::Value>,
        profile: ValidationProfile,
        provider: &'a P,
    ) -> Result<(), Report<EntityValidationError>> {
        // TODO: Distinguish between format validation and content validation so it's possible
        //       to directly use the correct type.
        //   see https://linear.app/hash/issue/BP-33
        Object::<_, 0>::new(self.properties().clone(), self.required().to_vec())
            .expect("`Object` was already validated")
            .validate_value(value, profile, provider)
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

    async fn validate(
        &self,
        schema: &EntityType,
        profile: ValidationProfile,
        provider: &P,
    ) -> Result<(), Report<Self::Error>> {
        schema
            .validate_value(self.properties(), profile, provider)
            .await
    }
}

impl<P> Validate<EntityType, P> for Option<&LinkData>
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
        schema: &EntityType,
        profile: ValidationProfile,
        provider: &P,
    ) -> Result<(), Report<Self::Error>> {
        let mut status: Result<(), Report<EntityValidationError>> = Ok(());

        let is_link = provider
            .is_parent_of(
                schema.id(),
                // TODO: The link type should be a const but the type system crate does not allow
                //       to make this a `const` variable.
                //   see https://linear.app/hash/issue/BP-57
                &VersionedUrl {
                    base_url: BaseUrl::new(
                        "https://blockprotocol.org/@blockprotocol/types/entity-type/link/"
                            .to_owned(),
                    )
                    .expect("Not a valid URL"),
                    version: 1,
                },
            )
            .await
            .change_context_lazy(|| EntityValidationError::EntityTypeRetrieval {
                id: schema.id().clone(),
            })
            .map_err(|error| extend_report!(status, error))
            .unwrap_or(
                // We were not able to check if the entity type is a link, so we assume it is. The
                // validation already failed anyway. This way we don't pollute the error report
                // with additional errors wich might be a false positive.
                true,
            );
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

impl<P> Validate<EntityType, P> for Entity
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
        schema: &EntityType,
        profile: ValidationProfile,
        provider: &P,
    ) -> Result<(), Report<Self::Error>> {
        let mut status: Result<(), Report<EntityValidationError>> = Ok(());

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

impl<P> Schema<LinkData, P> for EntityType
where
    P: EntityProvider + EntityTypeProvider + Sync,
{
    type Error = EntityValidationError;

    // TODO: validate link data
    //   see https://linear.app/hash/issue/H-972
    async fn validate_value<'a>(
        &'a self,
        link_data: &'a LinkData,
        _profile: ValidationProfile,
        provider: &'a P,
    ) -> Result<(), Report<EntityValidationError>> {
        let mut status: Result<(), Report<EntityValidationError>> = Ok(());

        let left_entity = provider
            .provide_entity(link_data.left_entity_id)
            .await
            .change_context_lazy(|| EntityValidationError::EntityRetrieval {
                id: link_data.left_entity_id,
            })
            .map_err(|error| extend_report!(status, error))
            .ok();

        let right_entity = provider
            .provide_entity(link_data.right_entity_id)
            .await
            .change_context_lazy(|| EntityValidationError::EntityRetrieval {
                id: link_data.right_entity_id,
            })
            .map_err(|error| extend_report!(status, error))
            .ok();

        let right_entity_type_id = right_entity
            .as_ref()
            .map(|entity| entity.borrow().metadata.entity_type_id());

        if let Some(left_entity) = left_entity {
            let left_entity_type = provider
                .provide_type(left_entity.borrow().metadata.entity_type_id())
                .await
                .change_context_lazy(|| EntityValidationError::EntityTypeRetrieval {
                    id: left_entity.borrow().metadata.entity_type_id().clone(),
                })
                .map_err(|error| extend_report!(status, error))
                .ok();

            if let Some(left_entity_type) = left_entity_type {
                let mut maybe_allowed_targets = left_entity_type.borrow().links().get(self.id());
                if maybe_allowed_targets.is_none() {
                    // No exact match found, so we look up parent types
                    for (link_type, allowed_targets) in left_entity_type.borrow().links() {
                        if provider
                            .is_parent_of(self.id(), link_type)
                            .await
                            .change_context_lazy(|| EntityValidationError::EntityTypeRetrieval {
                                id: self.id().clone(),
                            })
                            .map_err(|error| extend_report!(status, error))
                            .unwrap_or(false)
                        {
                            maybe_allowed_targets = Some(allowed_targets);
                            break;
                        }
                    }
                }

                if let Some(maybe_allowed_targets) = maybe_allowed_targets {
                    if let (Some(allowed_targets), Some(right_entity_type_id)) =
                        (maybe_allowed_targets.array().items(), right_entity_type_id)
                    {
                        let mut found_match = false;
                        for allowed_target in allowed_targets.one_of() {
                            // We test exact matches first to avoid looking up parent types
                            if allowed_target.url() == right_entity_type_id {
                                found_match = true;
                                break;
                            }
                        }
                        if !found_match {
                            // No exact match found, so we look up parent types
                            for allowed_target in allowed_targets.one_of() {
                                if provider
                                    .is_parent_of(right_entity_type_id, allowed_target.url())
                                    .await
                                    .change_context_lazy(|| {
                                        EntityValidationError::EntityTypeRetrieval {
                                            id: right_entity_type_id.clone(),
                                        }
                                    })
                                    .map_err(|error| extend_report!(status, error))
                                    .unwrap_or(false)
                                {
                                    found_match = true;
                                    break;
                                }
                            }
                        }

                        if !found_match {
                            extend_report!(
                                status,
                                EntityValidationError::InvalidLinkTargetId {
                                    target_type: right_entity_type_id.clone(),
                                }
                            );
                        }
                    }
                } else {
                    extend_report!(
                        status,
                        EntityValidationError::InvalidLinkTypeId {
                            link_type: self.id().clone(),
                        }
                    );
                }
            }
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
        let property_types = [graph_test_data::property_type::NAME_V1];
        let data_types = [graph_test_data::data_type::TEXT_V1];

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
