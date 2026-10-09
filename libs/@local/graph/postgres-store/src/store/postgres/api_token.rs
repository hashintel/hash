use error_stack::{Report, ResultExt as _};
use futures::{StreamExt as _, TryStreamExt as _};
use hash_graph_store::api_token::{
    ApiTokenAuthenticationError, ApiTokenCredential, ApiTokenId, ApiTokenInsertionError,
    ApiTokenMetadata, ApiTokenRetrievalError, ApiTokenRevocationError, ApiTokenStore,
    ApiTokenVerificationError, CreateApiTokenParams, UserApiTokenRevocationError,
};
use postgres_types::FromSql;
use tokio_postgres::{GenericClient as _, Row};
use tracing::Instrument as _;
use type_system::principal::{actor::UserId, actor_group::WebId};

use super::{AsClient, PostgresStore, TransactionState};

/// Reads column `index` of `row`, failing with [`ApiTokenAuthenticationError::Store`].
fn column<'row, T: FromSql<'row>>(
    row: &'row Row,
    index: usize,
) -> Result<T, Report<ApiTokenAuthenticationError>> {
    row.try_get(index)
        .change_context(ApiTokenAuthenticationError::Store)
}

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
                    &params.encrypted_secret_hash,
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

    async fn revoke_user_api_tokens(
        &mut self,
        user_id: UserId,
    ) -> Result<u64, Report<UserApiTokenRevocationError>> {
        self.as_mut_client()
            .execute(
                "
                UPDATE api_token
                SET revoked_at = now()
                WHERE (actor_id = $1 OR web_id = $1) AND revoked_at IS NULL
                ",
                &[&user_id],
            )
            .instrument(tracing::info_span!(
                "UPDATE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(UserApiTokenRevocationError)
    }

    async fn authenticate_api_token<F>(
        &mut self,
        token_id: ApiTokenId,
        verify: F,
    ) -> Result<UserId, Report<ApiTokenAuthenticationError>>
    where
        F: FnOnce(&ApiTokenCredential) -> Result<(), Report<ApiTokenVerificationError>> + Send,
    {
        let row = self
            .as_client()
            .query_opt(
                "
                SELECT
                    api_token.token_type,
                    api_token.version,
                    api_token.actor_id,
                    api_token.web_id,
                    api_token.encryption_key_id,
                    api_token.encrypted_secret_hash,
                    api_token.revoked_at IS NOT NULL,
                    api_token.expires_at IS NOT NULL AND api_token.expires_at <= now(),
                    api_token.last_used_at IS NULL
                        OR api_token.last_used_at <= now() - INTERVAL '1 minute'
                FROM api_token
                JOIN user_actor ON user_actor.id = api_token.actor_id
                WHERE api_token.token_id = $1
                ",
                &[&token_id],
            )
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(ApiTokenAuthenticationError::Store)?
            .ok_or(ApiTokenAuthenticationError::NotFound)?;

        let credential = ApiTokenCredential {
            token_type: column(&row, 0)?,
            version: column(&row, 1)?,
            user_id: column(&row, 2)?,
            web_id: column(&row, 3)?,
            encryption_key_id: column(&row, 4)?,
            encrypted_secret_hash: column(&row, 5)?,
        };
        verify(&credential).map_err(|report| {
            let reason = *report.current_context();
            report.change_context(ApiTokenAuthenticationError::Verification { reason })
        })?;

        let revoked: bool = column(&row, 6)?;
        let expired: bool = column(&row, 7)?;
        let last_used_update_due: bool = column(&row, 8)?;

        if revoked {
            return Err(Report::new(ApiTokenAuthenticationError::Revoked));
        }
        if expired {
            return Err(Report::new(ApiTokenAuthenticationError::Expired));
        }

        if last_used_update_due {
            self.as_mut_client()
                .execute(
                    "
                    UPDATE api_token
                    SET last_used_at = now()
                    WHERE token_id = $1
                        AND (last_used_at IS NULL OR last_used_at <= now() - INTERVAL '1 minute')
                    ",
                    &[&token_id],
                )
                .instrument(tracing::info_span!(
                    "UPDATE",
                    otel.kind = "client",
                    db.system = "postgresql",
                    peer.service = "Postgres",
                ))
                .await
                .change_context(ApiTokenAuthenticationError::Store)?;
        }

        Ok(credential.user_id)
    }
}
