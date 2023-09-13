#![feature(
    associated_type_bounds,
    async_fn_in_trait,
    impl_trait_in_assoc_type,
    lint_reasons,
    return_position_impl_trait_in_trait
)]

use error_stack::Result;
use graph_types::{account::AccountId, knowledge::entity::EntityId, provenance::OwnedById};

use crate::{
    backend::{CheckError, CheckResponse},
    zanzibar::{Consistency, Zookie},
};

pub mod backend;
pub mod zanzibar;

mod api;

pub use self::api::{AuthorizationApi, AuthorizationApiPool};

#[derive(Debug, Default)]
pub struct NoAuthorization;

impl AuthorizationApi for NoAuthorization {
    async fn can_create_entity(
        &self,
        _actor: AccountId,
        _web: OwnedById,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn can_update_entity(
        &self,
        _actor: AccountId,
        _entity: EntityId,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }

    async fn can_view_entity(
        &self,
        _actor: AccountId,
        _entity: EntityId,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, CheckError> {
        Ok(CheckResponse {
            has_permission: true,
            checked_at: Zookie::empty(),
        })
    }
}

impl AuthorizationApiPool for NoAuthorization {
    type Api<'pool> = Self;
    type Error = std::convert::Infallible;

    async fn acquire(&self) -> Result<Self::Api<'_>, Self::Error> {
        Ok(Self)
    }

    async fn acquire_owned(&self) -> Result<Self::Api<'static>, Self::Error> {
        Ok(Self)
    }
}
