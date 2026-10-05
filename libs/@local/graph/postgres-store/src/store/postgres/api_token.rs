use error_stack::{Report, ResultExt as _};
use futures::{StreamExt as _, TryStreamExt as _};
use hash_graph_store::api_token::{
    ApiTokenId, ApiTokenInsertionError, ApiTokenMetadata, ApiTokenRetrievalError,
    ApiTokenRevocationError, ApiTokenStore, CreateApiTokenParams,
};
use tokio_postgres::GenericClient as _;
use tracing::Instrument as _;
use type_system::principal::actor_group::WebId;

use super::{AsClient, PostgresStore, TransactionState};

impl<C: AsClient, S: TransactionState> ApiTokenStore for PostgresStore<C, S> {
    async fn create_api_token(
        &mut self,
        params: CreateApiTokenParams,
    ) -> Result<ApiTokenMetadata, Report<ApiTokenInsertionError>> {
        let web_id = WebId::from(params.user_id);
        let row = self
            .as_mut_client()
            .query_one(
                "
                INSERT INTO api_token (
                    token_id,
                    token_type,
                    version,
                    actor_id,
                    web_id,
                    name,
                    encryption_key_id,
                    encrypted_secret_hash,
                    expires_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + make_interval(secs => $9))
                RETURNING created_at, expires_at
                ",
                &[
                    &params.token_id,
                    &params.token_type,
                    &params.version,
                    &params.user_id,
                    &web_id,
                    &params.name,
                    &params.encryption_key_id,
                    &params.encrypted_secret_hash.as_bytes().as_slice(),
                    &params.lifetime.map(|lifetime| lifetime.as_secs_f64()),
                ],
            )
            .instrument(tracing::info_span!(
                "INSERT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(ApiTokenInsertionError)?;

        Ok(ApiTokenMetadata {
            token_id: params.token_id,
            token_type: params.token_type,
            version: params.version,
            web_id,
            name: params.name,
            created_at: row.try_get(0).change_context(ApiTokenInsertionError)?,
            expires_at: row.try_get(1).change_context(ApiTokenInsertionError)?,
            last_used_at: None,
            revoked_at: None,
        })
    }

    async fn list_api_tokens(
        &self,
        web_id: WebId,
    ) -> Result<Vec<ApiTokenMetadata>, Report<ApiTokenRetrievalError>> {
        self.as_client()
            .query_raw(
                "
                SELECT
                    token_id,
                    token_type,
                    version,
                    name,
                    created_at,
                    expires_at,
                    last_used_at,
                    revoked_at
                FROM api_token
                WHERE web_id = $1
                ORDER BY created_at DESC, token_id
                ",
                [&web_id],
            )
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(ApiTokenRetrievalError)?
            .map(|row| -> Result<_, tokio_postgres::Error> {
                let row = row?;
                Ok(ApiTokenMetadata {
                    token_id: row.try_get(0)?,
                    token_type: row.try_get(1)?,
                    version: row.try_get(2)?,
                    web_id,
                    name: row.try_get(3)?,
                    created_at: row.try_get(4)?,
                    expires_at: row.try_get(5)?,
                    last_used_at: row.try_get(6)?,
                    revoked_at: row.try_get(7)?,
                })
            })
            .try_collect()
            .await
            .change_context(ApiTokenRetrievalError)
    }

    async fn revoke_api_token(
        &mut self,
        web_id: WebId,
        token_id: ApiTokenId,
    ) -> Result<(), Report<ApiTokenRevocationError>> {
        let revoked = self
            .as_mut_client()
            .execute(
                "
                UPDATE api_token
                SET revoked_at = coalesce(revoked_at, now())
                WHERE token_id = $1 AND web_id = $2
                ",
                &[&token_id, &web_id],
            )
            .instrument(tracing::info_span!(
                "UPDATE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(ApiTokenRevocationError::Store)?;

        if revoked == 0 {
            return Err(Report::new(ApiTokenRevocationError::NotFound));
        }
        Ok(())
    }
}
