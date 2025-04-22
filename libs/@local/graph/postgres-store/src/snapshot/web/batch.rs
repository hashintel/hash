use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::{backend::ZanzibarBackend, schema::WebRelationAndSubject};
use hash_graph_store::error::InsertionError;
use tokio_postgres::GenericClient as _;
use type_system::principal::actor_group::WebId;

use crate::{
    snapshot::WriteBatch,
    store::{AsClient, PostgresStore, postgres::query::rows::WebRow},
};

pub enum WebBatch {
    Webs(Vec<WebRow>),
    Relations(Vec<(WebId, WebRelationAndSubject)>),
}

impl<C, A> WriteBatch<C, A> for WebBatch
where
    C: AsClient,
    A: ZanzibarBackend + Send + Sync,
{
    async fn begin(
        postgres_client: &mut PostgresStore<C, A>,
    ) -> Result<(), Report<InsertionError>> {
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
        postgres_client: &mut PostgresStore<C, A>,
    ) -> Result<(), Report<InsertionError>> {
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
        _ignore_validation_errors: bool,
    ) -> Result<(), Report<InsertionError>> {
        postgres_client
            .as_client()
            .client()
            .simple_query("INSERT INTO webs SELECT * FROM webs_tmp;")
            .await
            .change_context(InsertionError)?;
        Ok(())
    }
}
