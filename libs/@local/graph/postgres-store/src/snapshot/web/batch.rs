use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::{backend::ZanzibarBackend, schema::WebRelationAndSubject};
use hash_graph_store::error::InsertionError;
use type_system::principal::actor_group::WebId;

use crate::{
    snapshot::WriteBatch,
    store::{AsClient, PostgresStore},
};

pub enum WebBatch {
    Relations(Vec<(WebId, WebRelationAndSubject)>),
}

impl<C, A> WriteBatch<C, A> for WebBatch
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
            Self::Relations(relations) => {
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
