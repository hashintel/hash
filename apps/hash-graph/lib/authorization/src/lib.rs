#![feature(
    associated_type_bounds,
    async_fn_in_trait,
    impl_trait_in_assoc_type,
    lint_reasons,
    return_position_impl_trait_in_trait
)]

use futures::Stream;
use graph_types::{account::AccountId, knowledge::entity::EntityId};

use crate::{
    backend::CheckError,
    zanzibar::{Consistency, Zookie},
};

pub mod backend;
pub mod zanzibar;

mod api;

pub use self::api::{AuthorizationApi, AuthorizationApiPool};

#[derive(Debug, Default)]
pub struct NoAuthorization;

impl AuthorizationApi for NoAuthorization {
    async fn view_entity(
        &self,
        _actor: AccountId,
        _entity: EntityId,
        _consistency: Consistency<'_>,
    ) -> Result<(bool, Zookie<'static>), CheckError> {
        Ok((true, Zookie::empty()))
    }

    async fn view_entities(
        &self,
        _actor: AccountId,
        entities: impl IntoIterator<Item = EntityId, IntoIter: Send> + Send,
        _consistency: Consistency<'_>,
    ) -> Result<
        (
            impl Stream<Item = Result<(EntityId, bool), CheckError>> + Send,
            Zookie<'static>,
        ),
        CheckError,
    > {
        Ok((
            futures::stream::iter(entities.into_iter().map(|entity| Ok((entity, true)))),
            Zookie::empty(),
        ))
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
