use error_stack::{Report, ReportSink, ResultExt as _};
use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
use hash_graph_temporal_versioning::TemporalBound;
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
    subgraph::temporal_axes::{
        PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableTemporalAxisUnresolved,
    },
};

/// Errors that can occur during user deletion.
///
/// Fatal variants (`UserLookup`, `MissingKratosIdentityId`, `EntityDeletion`) prevent the
/// operation from completing and cause an `Err` return from [`delete_user`].
///
/// Non-fatal variants (`KratosDeletion`, `HydraLoginRevocation`, `HydraConsentRevocation`,
/// `EmailSubscription`) are collected into [`UserDeletionOutcome::errors`] but do not prevent
/// the entity deletion from succeeding.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum UserDeletionError {
    // Fatal
    #[display("failed to look up user data")]
    UserLookup,
    #[display("user entity is missing a Kratos identity ID")]
    MissingKratosIdentityId,
    #[display("failed to delete user entities")]
    EntityDeletion,
    // Non-fatal (collected via ReportSink)
    #[display("failed to delete Kratos identity")]
    KratosDeletion,
    #[display("failed to revoke Hydra login sessions")]
    HydraLoginRevocation,
    #[display("failed to revoke Hydra consent sessions")]
    HydraConsentRevocation,
    #[display("failed to delete email subscription")]
    EmailSubscription,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserDeletionReport {
    pub entities_deleted: usize,
    pub drafts_deleted: usize,
    pub kratos_identity_deleted: bool,
    pub hydra_login_sessions_revoked: bool,
    pub hydra_consent_sessions_revoked: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email_subscriptions_deleted: Option<bool>,
}

/// Result of a user deletion operation.
///
/// The `report` is always present and describes what happened. The `errors` field contains
/// collected errors from non-fatal steps (Kratos, Hydra, Mailchimp). When `errors` is `Err`,
/// the entity deletion still succeeded but external service cleanup was incomplete.
pub struct UserDeletionOutcome {
    pub report: UserDeletionReport,
    pub errors: Result<(), Report<[UserDeletionError]>>,
}

/// Deletes a user's data from the system while preserving structural references.
///
/// Principals (user, web, roles, system machine) and policies are intentionally kept intact because
/// entity types created under the user's web may be referenced by other webs. Removing the web
/// principal would break those references.
///
/// Orchestrates the following operations in order:
/// 1. Look up the user's Kratos identity ID and email addresses
/// 2. Purge all entities owned by the user's personal web
/// 3. Delete the Kratos identity (removes PII such as email)
/// 4. Revoke Hydra login and consent sessions
/// 5. Delete email subscription entries
///
/// Steps 1–2 are fatal: failure causes an `Err` return and no entities are deleted.
/// Steps 3–5 are non-fatal: failures are collected into [`UserDeletionOutcome::errors`]
/// with full error-stack context, but entity deletion is not rolled back.
///
/// # Errors
///
/// Returns [`UserDeletionError`] if steps 1 or 2 fail. Non-fatal errors from steps 3–5 are
/// returned in [`UserDeletionOutcome::errors`].
#[expect(
    clippy::too_many_lines,
    reason = "linear orchestration flow, splitting would reduce readability"
)]
#[tracing::instrument(
    level = "info",
    skip(store, identity_provider, oauth_provider, email_subscription_provider)
)]
pub async fn delete_user<S, I, O, E>(
    store: &mut S,
    identity_provider: &I,
    oauth_provider: &O,
    email_subscription_provider: Option<&E>,
    actor: AuthenticatedActor,
    user_id: UserId,
) -> Result<UserDeletionOutcome, Report<UserDeletionError>>
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
        .change_context(UserDeletionError::UserLookup)?
        .ok_or(UserDeletionError::MissingKratosIdentityId)?;
    tracing::info!(%user_id, %kratos_identity_id, "resolved Kratos identity");

    let emails = store
        .get_user_emails(user_id)
        .await
        .change_context(UserDeletionError::UserLookup)?;
    tracing::info!(%user_id, email_count = emails.len(), "resolved user emails");

    // Step 2: Purge all entities owned by the user's personal web
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
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(
                        Some(TemporalBound::Unbounded),
                        None,
                    ),
                },
                include_drafts: true,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Archive,
                },
                decision_time: None,
            },
        )
        .await
        .change_context(UserDeletionError::EntityDeletion)?;
    tracing::info!(
        full = deletion_summary.full_entities,
        drafts = deletion_summary.draft_deletions,
        "purged entities from user web"
    );

    // Steps 3–5: Non-fatal, errors collected via ReportSink
    let mut sink = ReportSink::<UserDeletionError>::new();

    // Step 3: Delete Kratos identity (removes PII: email, name, recovery addresses)
    let kratos_deleted = sink
        .attempt(
            identity_provider
                .delete_identity(&kratos_identity_id)
                .await
                .change_context(UserDeletionError::KratosDeletion),
        )
        .is_some();
    if kratos_deleted {
        tracing::info!(%kratos_identity_id, "deleted Kratos identity");
    }

    // Step 4: Revoke all Hydra sessions
    let login_revoked = sink
        .attempt(
            oauth_provider
                .revoke_login_sessions(&kratos_identity_id)
                .await
                .change_context(UserDeletionError::HydraLoginRevocation),
        )
        .is_some();
    if login_revoked {
        tracing::info!(%kratos_identity_id, "revoked Hydra login sessions");
    }

    let consent_revoked = sink
        .attempt(
            oauth_provider
                .revoke_consent_sessions(&kratos_identity_id)
                .await
                .change_context(UserDeletionError::HydraConsentRevocation),
        )
        .is_some();
    if consent_revoked {
        tracing::info!(%kratos_identity_id, "revoked Hydra consent sessions");
    }

    // Step 5: Delete email subscriptions
    let subscriptions_deleted = if let Some(provider) = email_subscription_provider {
        let mut all_ok = true;
        for email in &emails {
            if sink
                .attempt(
                    provider
                        .delete_subscriber(email)
                        .await
                        .change_context(UserDeletionError::EmailSubscription),
                )
                .is_some()
            {
                tracing::info!(%email, "deleted email subscription");
            } else {
                all_ok = false;
            }
        }
        Some(all_ok)
    } else {
        tracing::info!("no email subscription provider configured, skipping");
        None
    };

    let errors = sink.finish();
    if let Err(report) = &errors {
        tracing::error!(?report, "user deletion completed with errors");
    }

    Ok(UserDeletionOutcome {
        report: UserDeletionReport {
            entities_deleted: deletion_summary.full_entities,
            drafts_deleted: deletion_summary.draft_deletions,
            kratos_identity_deleted: kratos_deleted,
            hydra_login_sessions_revoked: login_revoked,
            hydra_consent_sessions_revoked: consent_revoked,
            email_subscriptions_deleted: subscriptions_deleted,
        },
        errors,
    })
}
