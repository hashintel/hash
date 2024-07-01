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

use error_stack::Result;
use graph_types::{
    account::{AccountGroupId, AccountId},
    knowledge::entity::{EntityId, EntityUuid},
    ontology::{DataTypeId, EntityTypeId, PropertyTypeId},
    owned_by_id::OwnedById,
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
    async fn seed(&mut self) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn check_account_group_permission(
        &self,
        _: AccountId,
        _: AccountGroupPermission,
        _: AccountGroupId,
        _: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
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
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn check_web_permission(
        &self,
        _: AccountId,
        _: WebPermission,
        _: OwnedById,
        _: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
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
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn get_web_relations(
        &self,
        _: OwnedById,
        _: Consistency<'static>,
    ) -> Result<Vec<WebRelationAndSubject>, ReadError> {
        Ok(Vec::new())
    }

    async fn check_entity_permission(
        &self,
        _: AccountId,
        _: EntityPermission,
        _: EntityId,
        _: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
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
    ) -> Result<(HashMap<EntityUuid, bool>, Zookie<'static>), CheckError> {
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
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn get_entity_relations(
        &self,
        _: EntityId,
        _: Consistency<'static>,
    ) -> Result<Vec<EntityRelationAndSubject>, ReadError> {
        Ok(Vec::new())
    }

    async fn modify_entity_type_relations(
        &mut self,
        _: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                EntityTypeId,
                EntityTypeRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn check_entity_type_permission(
        &self,
        _: AccountId,
        _: EntityTypePermission,
        _: EntityTypeId,
        _: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn check_entity_types_permission(
        &self,
        _: AccountId,
        _: EntityTypePermission,
        entity_types: impl IntoIterator<Item = EntityTypeId, IntoIter: Send> + Send,
        _: Consistency<'_>,
    ) -> Result<(HashMap<EntityTypeId, bool>, Zookie<'static>), CheckError> {
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
        _: EntityTypeId,
        _: Consistency<'static>,
    ) -> Result<Vec<EntityTypeRelationAndSubject>, ReadError> {
        Ok(Vec::new())
    }

    async fn modify_property_type_relations(
        &mut self,
        _: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                PropertyTypeId,
                PropertyTypeRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn check_property_type_permission(
        &self,
        _: AccountId,
        _: PropertyTypePermission,
        _: PropertyTypeId,
        _: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn check_property_types_permission(
        &self,
        _: AccountId,
        _: PropertyTypePermission,
        property_types: impl IntoIterator<Item = PropertyTypeId, IntoIter: Send> + Send,
        _: Consistency<'_>,
    ) -> Result<(HashMap<PropertyTypeId, bool>, Zookie<'static>), CheckError> {
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
        _: PropertyTypeId,
        _: Consistency<'static>,
    ) -> Result<Vec<PropertyTypeRelationAndSubject>, ReadError> {
        Ok(Vec::new())
    }

    async fn modify_data_type_relations(
        &mut self,
        _: impl IntoIterator<
            Item = (
                ModifyRelationshipOperation,
                DataTypeId,
                DataTypeRelationAndSubject,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn check_data_type_permission(
        &self,
        _: AccountId,
        _: DataTypePermission,
        _: DataTypeId,
        _: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn check_data_types_permission(
        &self,
        _: AccountId,
        _: DataTypePermission,
        data_types: impl IntoIterator<Item = DataTypeId, IntoIter: Send> + Send,
        _: Consistency<'_>,
    ) -> Result<(HashMap<DataTypeId, bool>, Zookie<'static>), CheckError> {
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
        _: DataTypeId,
        _: Consistency<'static>,
    ) -> Result<Vec<DataTypeRelationAndSubject>, ReadError> {
        Ok(Vec::new())
    }
}

impl<A> AuthorizationApiPool for A
where
    A: AuthorizationApi + Clone + Send + Sync,
{
    type Api<'pool> = Self;
    type Error = core::convert::Infallible;

    async fn acquire(&self) -> Result<Self::Api<'_>, Self::Error> {
        Ok(self.clone())
    }

    async fn acquire_owned(&self) -> Result<Self::Api<'static>, Self::Error> {
        Ok(self.clone())
    }
}
