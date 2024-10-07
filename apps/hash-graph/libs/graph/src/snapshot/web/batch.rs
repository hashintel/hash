use authorization::{backend::ZanzibarBackend, schema::WebRelationAndSubject};
use error_stack::{Result, ResultExt};
use graph_types::owned_by_id::OwnedById;
use tokio_postgres::GenericClient;

use crate::{
    snapshot::WriteBatch,
    store::{AsClient, InsertionError, PostgresStore, postgres::query::rows::WebRow},
};

pub enum WebBatch {
    Webs(Vec<WebRow>),
    Relations(Vec<(OwnedById, WebRelationAndSubject)>),
}

impl<C, A> WriteBatch<C, A> for WebBatch
where
    C: AsClient,
    A: ZanzibarBackend + Send + Sync,
{
    async fn begin(postgres_client: &mut PostgresStore<C, A>) -> Result<(), InsertionError> {
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

    async fn write(self, postgres_client: &mut PostgresStore<C, A>) -> Result<(), InsertionError> {
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
        postgres_client: &mut PostgresStore<C, A>,
        _validation: bool,
    ) -> Result<(), InsertionError> {
        postgres_client
            .as_client()
            .client()
            .simple_query("INSERT INTO webs SELECT * FROM webs_tmp;")
            .await
            .change_context(InsertionError)?;
        Ok(())
    }
}
