#![feature(
    // Library Features
    assert_matches,
)]
#![expect(clippy::panic_in_result_fn, clippy::missing_panics_doc)]

extern crate alloc;

#[path = "../common/mod.rs"]
mod common;

mod actions;
mod ai;
mod machine;
mod policies;
mod role;
mod team;
mod user;
mod web;

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::{
    Effect,
    action::ActionName,
    principal::PrincipalConstraint,
    store::{PolicyCreationParams, PolicyStore as _, PrincipalStore as _},
};
use hash_graph_postgres_store::store::{PostgresStore, error::StoreError};
use tokio_postgres::Transaction;
use type_system::principal::actor::ActorId;

pub use crate::common::DatabaseTestWrapper;

impl DatabaseTestWrapper {
    pub(crate) async fn seed(
        &mut self,
    ) -> Result<(PostgresStore<Transaction<'_>>, ActorId), Report<StoreError>> {
        let mut transaction = self.connection.transaction().await?;

        transaction
            .seed_system_policies()
            .await
            .change_context(StoreError)?;

        let actor = ActorId::Machine(
            transaction
                .get_or_create_system_machine("h")
                .await
                .change_context(StoreError)?,
        );

        // Create a policy to allow the actor to create new policies
        transaction
            .insert_policies_into_database(&[PolicyCreationParams {
                name: None,
                effect: Effect::Permit,
                principal: Some(PrincipalConstraint::Actor { actor }),
                actions: vec![ActionName::CreatePolicy, ActionName::DeletePolicy],
                resource: None,
            }])
            .await
            .change_context(StoreError)?;

        Ok((transaction, actor))
    }
}
