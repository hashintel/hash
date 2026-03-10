use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
use serde::Serialize;
use type_system::principal::{actor::UserId, actor_group::WebId};

use crate::{
    account::AccountStore,
    email_subscription::EmailSubscriptionProvider,
    entity::{
        DeleteEntitiesParams, DeletionScope, EntityQueryPath, EntityStore, LinkDeletionBehavior,
    },
    filter::{Filter, FilterExpression, Parameter},
    identity_provider::IdentityProvider,
    oauth_provider::OAuthProvider,
};

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum UserDeletionError {
    #[display("user not found")]
    UserNotFound,
    #[display("user entity is missing a Kratos identity ID")]
    MissingKratosIdentityId,
    #[display("failed to delete user entities")]
    EntityDeletion,
    #[display("failed to delete external identity")]
    IdentityDeletion,
    #[display("failed to revoke external OAuth sessions")]
    OAuthRevocation,
}

#[expect(clippy::struct_excessive_bools, reason = "status report, not config")]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserDeletionReport {
    pub entities_deleted: usize,
    pub drafts_deleted: usize,
    pub kratos_identity_deleted: bool,
    pub hydra_login_sessions_revoked: bool,
    pub hydra_consent_sessions_revoked: bool,
    pub email_subscriptions_deleted: bool,
}

/// Deletes a user's data from the system while preserving structural references.
///
/// Principals (user, web, roles, system machine) and policies are intentionally kept intact because
/// entity types created under the user's web may be referenced by other webs. Removing the web
/// principal would break those references.
///
/// Orchestrates the following operations in order:
/// 1. Look up the user's Kratos identity ID and email addresses
/// 2. Erase all entities owned by the user's personal web
/// 3. Delete the Kratos identity (removes PII such as email)
/// 4. Revoke Hydra login and consent sessions (best-effort)
/// 5. Delete email subscription entries (best-effort)
///
/// # Errors
///
/// Returns [`UserDeletionError`] if any step fails. Partial deletion may occur — the caller should
/// log which steps completed for manual recovery.
pub async fn delete_user<S, I, O, E>(
    store: &mut S,
    identity_provider: &I,
    oauth_provider: &O,
    email_subscription_provider: Option<&E>,
    actor: AuthenticatedActor,
    user_id: UserId,
) -> Result<UserDeletionReport, Report<UserDeletionError>>
where
    S: AccountStore + EntityStore,
    I: IdentityProvider,
    O: OAuthProvider,
    E: EmailSubscriptionProvider,
{
    // Step 1: Gather data before we delete anything
    let kratos_identity_id = store
        .get_user_kratos_identity_id(user_id)
        .await
        .change_context(UserDeletionError::UserNotFound)?
        .ok_or(UserDeletionError::MissingKratosIdentityId)?;
    tracing::info!(%user_id, %kratos_identity_id, "resolved Kratos identity");

    let emails = store
        .get_user_emails(user_id)
        .await
        .change_context(UserDeletionError::UserNotFound)?;
    tracing::info!(%user_id, email_count = emails.len(), "resolved user emails");

    // Step 2: Erase all entities owned by the user's personal web
    // User ID == Web ID for personal webs
    let web_id = WebId::from(user_id);
    let web_filter = Filter::Equal(
        FilterExpression::Path {
            path: EntityQueryPath::WebId,
        },
        FilterExpression::Parameter {
            parameter: Parameter::Uuid(web_id.into()),
            convert: None,
        },
    );

    let deletion_summary = store
        .delete_entities(
            actor,
            DeleteEntitiesParams {
                filter: web_filter,
                include_drafts: true,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                decision_time: None,
            },
        )
        .await
        .change_context(UserDeletionError::EntityDeletion)?;
    tracing::info!(
        full = deletion_summary.full_entities,
        drafts = deletion_summary.draft_deletions,
        "erased entities from user web"
    );

    // Step 3: Delete Kratos identity (removes PII: email, name, recovery addresses)
    identity_provider
        .delete_identity(&kratos_identity_id)
        .await
        .change_context(UserDeletionError::IdentityDeletion)?;
    tracing::info!(%kratos_identity_id, "deleted Kratos identity");

    // Step 4: Revoke all Hydra sessions (best-effort)
    let login_revoked = if let Err(report) = oauth_provider
        .revoke_login_sessions(&kratos_identity_id)
        .await
    {
        tracing::warn!(?report, "failed to revoke Hydra login sessions");
        false
    } else {
        tracing::info!(%kratos_identity_id, "revoked Hydra login sessions");
        true
    };

    let consent_revoked = if let Err(report) = oauth_provider
        .revoke_consent_sessions(&kratos_identity_id)
        .await
    {
        tracing::warn!(?report, "failed to revoke Hydra consent sessions");
        false
    } else {
        tracing::info!(%kratos_identity_id, "revoked Hydra consent sessions");
        true
    };

    // Step 5: Delete email subscriptions (best-effort)
    let subscriptions_deleted = if let Some(provider) = email_subscription_provider {
        let mut all_ok = true;
        for email in &emails {
            if let Err(report) = provider.delete_subscriber(email).await {
                tracing::warn!(?report, %email, "failed to delete email subscription");
                all_ok = false;
            } else {
                tracing::info!(%email, "deleted email subscription");
            }
        }
        all_ok
    } else {
        tracing::info!("no email subscription provider configured, skipping");
        true
    };

    Ok(UserDeletionReport {
        entities_deleted: deletion_summary.full_entities,
        drafts_deleted: deletion_summary.draft_deletions,
        kratos_identity_deleted: true,
        hydra_login_sessions_revoked: login_revoked,
        hydra_consent_sessions_revoked: consent_revoked,
        email_subscriptions_deleted: subscriptions_deleted,
    })
}
