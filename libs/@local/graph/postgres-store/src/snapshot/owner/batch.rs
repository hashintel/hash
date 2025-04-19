use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::{backend::ZanzibarBackend, schema::AccountGroupRelationAndSubject};
use hash_graph_store::error::InsertionError;
use type_system::principal::actor_group::ActorGroupEntityUuid;

use crate::{
    snapshot::WriteBatch,
    store::{AsClient, PostgresStore},
};

pub enum AccountRowBatch {
    AccountGroupAccountRelations(Vec<(ActorGroupEntityUuid, AccountGroupRelationAndSubject)>),
}

impl<C, A> WriteBatch<C, A> for AccountRowBatch
where
    C: AsClient,
    A: ZanzibarBackend + Send + Sync,
{
    async fn begin(
        _postgres_client: &mut PostgresStore<C, A>,
    ) -> Result<(), Report<InsertionError>> {
        Ok(())
    }

    async fn write(
        self,
        postgres_client: &mut PostgresStore<C, A>,
    ) -> Result<(), Report<InsertionError>> {
        match self {
            Self::AccountGroupAccountRelations(relations) => {
                postgres_client
                    .authorization_api
                    .touch_relationships(relations)
                    .await
                    .change_context(InsertionError)?;
            }
        }
        Ok(())
    }

    async fn commit(
        _postgres_client: &mut PostgresStore<C, A>,
        _ignore_validation_errors: bool,
    ) -> Result<(), Report<InsertionError>> {
        Ok(())
    }
}
