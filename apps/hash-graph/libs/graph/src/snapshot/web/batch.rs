use async_trait::async_trait;
use authorization::{backend::ZanzibarBackend, schema::WebRelationAndSubject};
use error_stack::{Result, ResultExt};
use graph_types::provenance::OwnedById;
use tokio_postgres::GenericClient;

use crate::{
    snapshot::{web::WebRow, WriteBatch},
    store::{AsClient, InsertionError, PostgresStore},
};

pub enum WebBatch {
    Webs(Vec<WebRow>),
    Relations(Vec<(OwnedById, WebRelationAndSubject)>),
}

#[async_trait]
impl<C: AsClient> WriteBatch<C> for WebBatch {
    async fn begin(postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
                    CREATE TEMPORARY TABLE webs_tmp
                        (LIKE webs INCLUDING ALL)
                        ON COMMIT DROP;
                ",
            )
            .await
            .change_context(InsertionError)?;

        Ok(())
    }

    async fn write(
        self,
        postgres_client: &PostgresStore<C>,
        authorization_api: &mut (impl ZanzibarBackend + Send),
    ) -> Result<(), InsertionError> {
        let client = postgres_client.as_client().client();
        match self {
            Self::Webs(webs) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO webs_tmp
                            SELECT DISTINCT * FROM UNNEST($1::webs[])
                            ON CONFLICT DO NOTHING
                            RETURNING 1;
                        ",
                        &[&webs],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} webs", rows.len());
                }
            }
            Self::Relations(relations) => {
                authorization_api
                    .touch_relationships(relations)
                    .await
                    .change_context(InsertionError)?;
            }
        }
        Ok(())
    }

    async fn commit(postgres_client: &PostgresStore<C>) -> Result<(), InsertionError> {
        postgres_client
            .as_client()
            .client()
            .simple_query("INSERT INTO webs SELECT * FROM webs_tmp;")
            .await
            .change_context(InsertionError)?;
        Ok(())
    }
}
