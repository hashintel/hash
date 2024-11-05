#![feature(exhaustive_patterns, impl_trait_in_assoc_type, never_type)]
#![feature(type_alias_impl_trait)]

extern crate alloc;

pub mod backend;
pub mod schema;
pub mod zanzibar;

use std::collections::HashMap;

pub use self::api::{AuthorizationApi, AuthorizationApiPool};
use crate::schema::{
    AccountGroupRelationAndSubject, DataTypePermission, DataTypeRelationAndSubject,
    EntityRelationAndSubject, EntityTypePermission, EntityTypeRelationAndSubject,
    PropertyTypePermission, PropertyTypeRelationAndSubject, WebRelationAndSubject,
};

mod api;

use error_stack::Report;
use graph_types::{
    account::{AccountGroupId, AccountId},
    knowledge::entity::{EntityId, EntityUuid},
    owned_by_id::OwnedById,
};
use type_system::schema::{DataTypeUuid, EntityTypeUuid, PropertyTypeUuid};

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
        _: AccountId,
        _: AccountGroupPermission,
        _: AccountGroupId,
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
                AccountGroupId,
                AccountGroupRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, Report<ModifyRelationError>> {
        Ok(Zookie::empty())
    }

    async fn check_web_permission(
        &self,
        _: AccountId,
        _: WebPermission,
        _: OwnedById,
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
            Item = (
                ModifyRelationshipOperation,
                OwnedById,
                WebRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, Report<ModifyRelationError>> {
        Ok(Zookie::empty())
    }

    async fn get_web_relations(
        &self,
        _: OwnedById,
        _: Consistency<'static>,
    ) -> Result<Vec<WebRelationAndSubject>, Report<ReadError>> {
        Ok(Vec::new())
    }

    async fn check_entity_permission(
        &self,
        _: AccountId,
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
        _: AccountId,
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
        &mut self,
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
        _: AccountId,
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
        _: AccountId,
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
        _: AccountId,
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
        _: AccountId,
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
        _: AccountId,
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
        _: AccountId,
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
