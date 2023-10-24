use async_trait::async_trait;
use authorization::{backend::ZanzibarBackend, schema::WebRelationAndSubject};
use error_stack::{Result, ResultExt};
use graph_types::web::WebId;

use crate::{
    snapshot::WriteBatch,
    store::{AsClient, InsertionError, PostgresStore},
};

pub enum WebBatch {
    Relations(Vec<(WebId, WebRelationAndSubject)>),
}

#[async_trait]
impl<C: AsClient> WriteBatch<C> for WebBatch {
    async fn begin(_postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        Ok(())
    }

    async fn write(
        self,
        _postgres_client: &PostgresStore<C>,
        authorization_api: &mut (impl ZanzibarBackend + Send),
    ) -> Result<(), InsertionError> {
        match self {
            Self::Relations(relations) => {
                authorization_api
                    .touch_relationships(relations)
                    .await
                    .change_context(InsertionError)?;
            }
        }
        Ok(())
    }

    async fn commit(_postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        Ok(())
    }
}
