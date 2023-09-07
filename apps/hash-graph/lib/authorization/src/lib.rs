#![feature(
    associated_type_bounds,
    async_fn_in_trait,
    impl_trait_in_assoc_type,
    lint_reasons,
    return_position_impl_trait_in_trait
)]

use std::future::Future;

use futures::Stream;
use graph_types::{account::AccountId, knowledge::entity::EntityId};

use crate::{
    backend::CheckError,
    zanzibar::{Consistency, Zookie},
};

pub mod backend;

pub mod zanzibar;

pub trait AuthorizationApi {
    async fn view_entity(
        &self,
        actor: AccountId,
        entity: EntityId,
        consistency: Consistency<'_>,
    ) -> Result<(bool, zanzibar::Zookie<'static>), CheckError>;

    fn view_entities(
        &self,
        actor: AccountId,
        entities: impl IntoIterator<Item = EntityId, IntoIter: Send> + Send,
        consistency: Consistency<'_>,
    ) -> impl Future<
        Output = Result<
            (
                impl Stream<Item = Result<(EntityId, bool), CheckError>> + Send,
                Zookie<'static>,
            ),
            CheckError,
        >,
    > + Send;
}

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
