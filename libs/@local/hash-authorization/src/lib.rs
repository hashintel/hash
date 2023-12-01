#![feature(
    associated_type_bounds,
    exhaustive_patterns,
    impl_trait_in_assoc_type,
    lint_reasons,
    never_type
)]

pub mod backend;
pub mod schema;
pub mod zanzibar;

use std::collections::HashMap;

pub use self::api::{AuthorizationApi, AuthorizationApiPool};
use crate::schema::{
    AccountGroupRelationAndSubject, DataTypeId, DataTypePermission, DataTypeRelationAndSubject,
    EntityRelationAndSubject, EntityTypeId, EntityTypePermission, EntityTypeRelationAndSubject,
    PropertyTypeId, PropertyTypePermission, PropertyTypeRelationAndSubject, WebRelationAndSubject,
};

mod api;

use error_stack::Result;
use graph_types::{
    account::{AccountGroupId, AccountId},
    knowledge::entity::{EntityId, EntityUuid},
    web::WebId,
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
    async fn check_account_group_permission(
        &self,
        _actor: AccountId,
        _permission: AccountGroupPermission,
        _account_group: AccountGroupId,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn modify_account_group_relations(
        &mut self,
        _relationships: impl IntoIterator<
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
        _actor: AccountId,
        _permission: WebPermission,
        _web: WebId,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn modify_web_relations(
        &mut self,
        _relationships: impl IntoIterator<
            Item = (ModifyRelationshipOperation, WebId, WebRelationAndSubject),
            IntoIter: Send,
        > + Send,
    ) -> Result<Zookie<'static>, ModifyRelationError> {
        Ok(Zookie::empty())
    }

    async fn get_web_relations(
        &self,
        _web: WebId,
        _consistency: Consistency<'static>,
    ) -> Result<Vec<WebRelationAndSubject>, ReadError> {
        Ok(Vec::new())
    }

    async fn check_entity_permission(
        &self,
        _actor: AccountId,
        _permission: EntityPermission,
        _entity: EntityId,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn check_entities_permission(
        &self,
        _actor: AccountId,
        _permission: EntityPermission,
        entities: impl IntoIterator<Item = EntityId, IntoIter: Send> + Send,
        _consistency: Consistency<'_>,
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
        _relationships: impl IntoIterator<
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
        _entity: EntityId,
        _consistency: Consistency<'static>,
    ) -> Result<Vec<EntityRelationAndSubject>, ReadError> {
        Ok(Vec::new())
    }

    async fn modify_entity_type_relations(
        &mut self,
        _relationships: impl IntoIterator<
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
        _actor: AccountId,
        _permission: EntityTypePermission,
        _entity_type: EntityTypeId,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn get_entity_type_relations(
        &self,
        _entity_type: EntityTypeId,
        _consistency: Consistency<'static>,
    ) -> Result<Vec<EntityTypeRelationAndSubject>, ReadError> {
        Ok(Vec::new())
    }

    async fn modify_property_type_relations(
        &mut self,
        _relationships: impl IntoIterator<
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
        _actor: AccountId,
        _permission: PropertyTypePermission,
        _property_type: PropertyTypeId,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn get_property_type_relations(
        &self,
        _property_type: PropertyTypeId,
        _consistency: Consistency<'static>,
    ) -> Result<Vec<PropertyTypeRelationAndSubject>, ReadError> {
        Ok(Vec::new())
    }

    async fn modify_data_type_relations(
        &mut self,
        _relationships: impl IntoIterator<
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
        _actor: AccountId,
        _permission: DataTypePermission,
        _data_type: DataTypeId,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn get_data_type_relations(
        &self,
        _data_type: DataTypeId,
        _consistency: Consistency<'static>,
    ) -> Result<Vec<DataTypeRelationAndSubject>, ReadError> {
        Ok(Vec::new())
    }
}

impl<A> AuthorizationApiPool for A
where
    A: AuthorizationApi + Clone + Send + Sync,
{
    type Api<'pool> = Self;
    type Error = std::convert::Infallible;

    async fn acquire(&self) -> Result<Self::Api<'_>, Self::Error> {
        Ok(self.clone())
    }

    async fn acquire_owned(&self) -> Result<Self::Api<'static>, Self::Error> {
        Ok(self.clone())
    }
}
