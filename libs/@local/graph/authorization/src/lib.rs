//! # HASH Graph Authorization
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(exhaustive_patterns, impl_trait_in_assoc_type, never_type)]
#![feature(type_alias_impl_trait)]

extern crate alloc;

pub mod backend;
pub mod policies;
pub mod schema;
pub mod zanzibar;

use std::collections::HashMap;

pub use self::api::{AuthorizationApi, AuthorizationApiPool};
use crate::schema::{
    AccountGroupRelationAndSubject, ActorIdOrPublic, DataTypePermission,
    DataTypeRelationAndSubject, EntityRelationAndSubject, EntityTypePermission,
    EntityTypeRelationAndSubject, PropertyTypePermission, PropertyTypeRelationAndSubject,
    WebRelationAndSubject,
};

mod api;

use error_stack::Report;
use type_system::{
    knowledge::entity::id::{EntityId, EntityUuid},
    ontology::{
        data_type::DataTypeUuid, entity_type::EntityTypeUuid, property_type::PropertyTypeUuid,
    },
    principal::{
        actor::ActorEntityUuid,
        actor_group::{ActorGroupEntityUuid, WebId},
    },
};

use crate::{
    backend::{
        CheckError, CheckResponse, ModifyRelationError, ModifyRelationshipOperation, ReadError,
    },
    schema::{AccountGroupPermission, EntityPermission, WebPermission},
    zanzibar::{Consistency, Zookie},
};

#[derive(Debug, Default, Copy, Clone)]
pub struct NoAuthorization;

impl AuthorizationApi for NoAuthorization {
    async fn seed(&mut self) -> Result<Zookie<'static>, Report<ModifyRelationError>> {
        Ok(Zookie::empty())
    }

    async fn check_account_group_permission(
        &self,
        _: ActorEntityUuid,
        _: AccountGroupPermission,
        _: ActorGroupEntityUuid,
        _: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn modify_account_group_relations(
        &mut self,
        _: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                ActorGroupEntityUuid,
                AccountGroupRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, Report<ModifyRelationError>> {
        Ok(Zookie::empty())
    }

    async fn check_web_permission(
        &self,
        _: ActorEntityUuid,
        _: WebPermission,
        _: WebId,
        _: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn modify_web_relations(
        &mut self,
        _: impl IntoIterator<
            Item = (ModifyRelationshipOperation, WebId, WebRelationAndSubject),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, Report<ModifyRelationError>> {
        Ok(Zookie::empty())
    }

    async fn get_account_group_relations(
        &self,
        _: ActorGroupEntityUuid,
        _: Consistency<'_>,
    ) -> Result<Vec<AccountGroupRelationAndSubject>, Report<ReadError>> {
        Ok(Vec::new())
    }

    async fn get_web_relations(
        &self,
        _: WebId,
        _: Consistency<'static>,
    ) -> Result<Vec<WebRelationAndSubject>, Report<ReadError>> {
        Ok(Vec::new())
    }

    async fn check_entity_permission(
        &self,
        _: ActorEntityUuid,
        _: EntityPermission,
        _: EntityId,
        _: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn check_entities_permission(
        &self,
        _: ActorEntityUuid,
        _: EntityPermission,
        entities: impl IntoIterator<Item = EntityId, IntoIter: Send> + Send,
        _: Consistency<'_>,
    ) -> Result<(HashMap<EntityUuid, bool>, Zookie<'static>), Report<CheckError>> {
        Ok((
            entities
                .into_iter()
                .map(|entity| (entity.entity_uuid, true))
                .collect(),
            Zookie::empty(),
        ))
    }

    async fn modify_entity_relations(
        &self,
        _: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                EntityId,
                EntityRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, Report<ModifyRelationError>> {
        Ok(Zookie::empty())
    }

    async fn get_entity_relations(
        &self,
        _: EntityId,
        _: Consistency<'static>,
    ) -> Result<Vec<EntityRelationAndSubject>, Report<ReadError>> {
        Ok(Vec::new())
    }

    async fn modify_entity_type_relations(
        &mut self,
        _: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                EntityTypeUuid,
                EntityTypeRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, Report<ModifyRelationError>> {
        Ok(Zookie::empty())
    }

    async fn check_entity_type_permission(
        &self,
        _: ActorEntityUuid,
        _: EntityTypePermission,
        _: EntityTypeUuid,
        _: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn check_entity_types_permission(
        &self,
        _: ActorEntityUuid,
        _: EntityTypePermission,
        entity_types: impl IntoIterator<Item = EntityTypeUuid, IntoIter: Send> + Send,
        _: Consistency<'_>,
    ) -> Result<(HashMap<EntityTypeUuid, bool>, Zookie<'static>), Report<CheckError>> {
        Ok((
            entity_types
                .into_iter()
                .map(|entity_type| (entity_type, true))
                .collect(),
            Zookie::empty(),
        ))
    }

    async fn get_entity_type_relations(
        &self,
        _: EntityTypeUuid,
        _: Consistency<'static>,
    ) -> Result<Vec<EntityTypeRelationAndSubject>, Report<ReadError>> {
        Ok(Vec::new())
    }

    async fn modify_property_type_relations(
        &mut self,
        _: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                PropertyTypeUuid,
                PropertyTypeRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, Report<ModifyRelationError>> {
        Ok(Zookie::empty())
    }

    async fn check_property_type_permission(
        &self,
        _: ActorEntityUuid,
        _: PropertyTypePermission,
        _: PropertyTypeUuid,
        _: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn check_property_types_permission(
        &self,
        _: ActorEntityUuid,
        _: PropertyTypePermission,
        property_types: impl IntoIterator<Item = PropertyTypeUuid, IntoIter: Send> + Send,
        _: Consistency<'_>,
    ) -> Result<(HashMap<PropertyTypeUuid, bool>, Zookie<'static>), Report<CheckError>> {
        Ok((
            property_types
                .into_iter()
                .map(|property_type| (property_type, true))
                .collect(),
            Zookie::empty(),
        ))
    }

    async fn get_property_type_relations(
        &self,
        _: PropertyTypeUuid,
        _: Consistency<'static>,
    ) -> Result<Vec<PropertyTypeRelationAndSubject>, Report<ReadError>> {
        Ok(Vec::new())
    }

    async fn modify_data_type_relations(
        &mut self,
        _: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                DataTypeUuid,
                DataTypeRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, Report<ModifyRelationError>> {
        Ok(Zookie::empty())
    }

    async fn check_data_type_permission(
        &self,
        _: ActorEntityUuid,
        _: DataTypePermission,
        _: DataTypeUuid,
        _: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn check_data_types_permission(
        &self,
        _: ActorEntityUuid,
        _: DataTypePermission,
        data_types: impl IntoIterator<Item = DataTypeUuid, IntoIter: Send> + Send,
        _: Consistency<'_>,
    ) -> Result<(HashMap<DataTypeUuid, bool>, Zookie<'static>), Report<CheckError>> {
        Ok((
            data_types
                .into_iter()
                .map(|data_type| (data_type, true))
                .collect(),
            Zookie::empty(),
        ))
    }

    async fn get_data_type_relations(
        &self,
        _: DataTypeUuid,
        _: Consistency<'static>,
    ) -> Result<Vec<DataTypeRelationAndSubject>, Report<ReadError>> {
        Ok(Vec::new())
    }

    async fn get_entities(
        &self,
        _: ActorEntityUuid,
        _: EntityPermission,
        _: Consistency<'_>,
    ) -> Result<Vec<EntityUuid>, Report<ReadError>> {
        Ok(Vec::new())
    }

    async fn get_entity_accounts(
        &self,
        _: EntityUuid,
        _: EntityPermission,
        _: Consistency<'_>,
    ) -> Result<Vec<ActorIdOrPublic>, Report<ReadError>> {
        Ok(Vec::new())
    }
}

impl<A> AuthorizationApiPool for A
where
    A: AuthorizationApi + Clone + Send + Sync,
{
    type Api<'pool> = Self;
    type Error = core::convert::Infallible;

    async fn acquire(&self) -> Result<Self::Api<'_>, Report<Self::Error>> {
        Ok(self.clone())
    }

    async fn acquire_owned(&self) -> Result<Self::Api<'static>, Report<Self::Error>> {
        Ok(self.clone())
    }
}

#[cfg(test)]
#[expect(clippy::panic_in_result_fn, reason = "Assertions in test are expected")]
mod test_utils {
    use core::{error::Error, fmt};

    use pretty_assertions::assert_eq;
    use serde::{Deserialize, Serialize};
    use serde_json::Value as JsonValue;

    #[track_caller]
    pub(crate) fn check_serialization<T>(constraint: &T, value: JsonValue)
    where
        T: fmt::Debug + PartialEq + Serialize + for<'de> Deserialize<'de>,
    {
        let serialized = serde_json::to_value(constraint).expect("should be JSON representable");
        assert_eq!(serialized, value);
        let deserialized: T =
            serde_json::from_value(value).expect("should be a valid resource constraint");
        assert_eq!(*constraint, deserialized);
    }

    #[track_caller]
    pub(crate) fn check_deserialization_error<T>(
        value: JsonValue,
        error: impl AsRef<str>,
    ) -> Result<(), Box<dyn Error>>
    where
        T: fmt::Debug + Serialize + for<'de> Deserialize<'de>,
    {
        match serde_json::from_value::<T>(value) {
            Ok(value) => panic!(
                "should not be a valid resource constraint: {:#}",
                serde_json::to_value(&value)?
            ),
            Err(actual_error) => assert_eq!(actual_error.to_string(), error.as_ref()),
        }
        Ok(())
    }
}
