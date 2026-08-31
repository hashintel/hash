use error_stack::{Report, ReportSink, ResultExt as _};
use serde::Serialize;
use type_system::principal::{
    actor::{ActorId, UserId},
    actor_group::WebId,
};

use crate::{
    account::AccountStore,
    email_subscription::EmailSubscriptionProvider,
    entity::{
        DeleteEntitiesParams, DeletionScope, EntityQueryPath, EntityStore, LinkDeletionBehavior,
    },
    filter::{Filter, FilterExpression, Parameter},
    identity_provider::{IdentityDeletion, IdentityProvider},
    oauth_provider::OAuthProvider,
    subgraph::temporal_axes::QueryTemporalAxesUnresolved,
};

/// Errors that can occur during user deletion.
///
/// Fatal variants (`UserLookup`, `MissingKratosIdentityId`, `EntityDeletion`) prevent the
/// operation from completing and cause an `Err` return from [`delete_user`].
///
/// Every other variant is non-fatal: collected into [`UserDeletionOutcome::errors`] without
/// preventing the entity deletion from succeeding.
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
    #[display(
        "the identity was absent for both the read and the delete, so the deletion is unconfirmed"
    )]
    UnknownIdentity,
    #[display("failed to revoke Hydra login sessions")]
    HydraLoginRevocation,
    #[display("failed to revoke Hydra consent sessions")]
    HydraConsentRevocation,
    #[display("failed to delete email subscription")]
    EmailSubscription,
    #[display(
        "the provider no longer holds the identity, so its addresses are unknown and \
         subscriptions were left in place"
    )]
    UnknownEmailAddresses,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserDeletionReport {
    pub kratos_identity_id: String,
    /// The addresses the identity held, or [`None`] where they could not be learned.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub emails: Option<Vec<String>>,
    pub entities_deleted: usize,
    pub drafts_deleted: usize,
    pub links_archived: u64,
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
/// 1. Look up the user's Kratos identity ID, then its email addresses through the identity provider
///    (a missing identity leaves the addresses unknown rather than failing)
/// 2. Purge all entities owned by the user's personal web
/// 3. Delete the Kratos identity (removes PII such as email)
/// 4. Revoke Hydra login and consent sessions
/// 5. Delete email subscription entries
///
/// `kratos_identity_id`, when given, replaces the graph read in step 1. This keeps a partially
/// deleted user deletable: the graph entity carrying the identity ID may already be purged while
/// the identity still exists.
///
/// Steps 1–2 are fatal: failure causes an `Err` return and no entities are deleted.
/// Steps 3–5 are non-fatal: failures are collected into [`UserDeletionOutcome::errors`]
/// with full error-stack context, but entity deletion is not rolled back.
///
/// # Errors
///
/// Returns [`UserDeletionError`] if steps 1 or 2 fail. Non-fatal errors from steps 3–5 are
/// returned in [`UserDeletionOutcome::errors`].
#[expect(clippy::too_many_lines, reason = "linear orchestration flow")]
#[tracing::instrument(
    level = "info",
    skip(store, identity_provider, oauth_provider, email_subscription_provider)
)]
pub async fn delete_user<S, I, O, E>(
    store: &mut S,
    identity_provider: &I,
    oauth_provider: &O,
    email_subscription_provider: Option<&E>,
    actor: ActorId,
    user_id: UserId,
    kratos_identity_id: Option<String>,
) -> Result<UserDeletionOutcome, Report<UserDeletionError>>
where
    S: AccountStore + EntityStore,
    I: IdentityProvider,
    O: OAuthProvider,
    E: EmailSubscriptionProvider,
{
    // Step 1: Gather data before we delete anything
    let kratos_identity_id = match kratos_identity_id {
        Some(kratos_identity_id) => kratos_identity_id,
        None => store
            .get_user_kratos_identity_id(user_id)
            .await
            .change_context(UserDeletionError::UserLookup)?
            .ok_or(UserDeletionError::MissingKratosIdentityId)?,
    };
    tracing::info!(%user_id, %kratos_identity_id, "resolved Kratos identity");

    // The addresses are only obtainable while the identity exists, so an unreadable provider
    // aborts here — before the irreversible purge — rather than after it.
    let emails = identity_provider
        .get_identity_emails(&kratos_identity_id)
        .await
        .change_context(UserDeletionError::UserLookup)?;
    if let Some(emails) = &emails {
        tracing::info!(%user_id, email_count = emails.len(), "resolved user emails");
    } else {
        tracing::warn!(%user_id, "the user's addresses are unknown");
    }

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
                temporal_axes: QueryTemporalAxesUnresolved::all(),
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
    let kratos_deleted = record_identity_deletion(
        sink.attempt(
            identity_provider
                .delete_identity(&kratos_identity_id)
                .await
                .change_context(UserDeletionError::KratosDeletion),
        ),
        // `Some` means the step-1 read saw the identity, even when it held no addresses.
        emails.is_some(),
        &kratos_identity_id,
        &mut sink,
    );

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
    let subscriptions_deleted =
        delete_email_subscriptions(email_subscription_provider, emails.as_deref(), &mut sink).await;

    let errors = sink.finish();
    if let Err(report) = &errors {
        tracing::error!(?report, "user deletion completed with errors");
    }

    Ok(UserDeletionOutcome {
        report: UserDeletionReport {
            kratos_identity_id,
            emails,
            entities_deleted: deletion_summary.full_entities,
            drafts_deleted: deletion_summary.draft_deletions,
            links_archived: deletion_summary.links_archived,
            kratos_identity_deleted: kratos_deleted,
            hydra_login_sessions_revoked: login_revoked,
            hydra_consent_sessions_revoked: consent_revoked,
            email_subscriptions_deleted: subscriptions_deleted,
        },
        errors,
    })
}

/// Records the outcome of the identity deletion, reporting whether the identity is confirmed
/// gone.
///
/// An identity that is absent although the address read saw it was deleted between the two
/// calls, so it counts as gone. An identity absent for both calls confirms nothing — the ID may
/// be stale, or the URL may answer 404 for every route — so the deletion is reported as
/// unconfirmed rather than done.
fn record_identity_deletion(
    outcome: Option<IdentityDeletion>,
    identity_seen: bool,
    kratos_identity_id: &str,
    sink: &mut ReportSink<UserDeletionError>,
) -> bool {
    match outcome {
        Some(IdentityDeletion::Deleted) => {
            tracing::info!(%kratos_identity_id, "deleted Kratos identity");
            true
        }
        Some(IdentityDeletion::AlreadyAbsent) if identity_seen => {
            tracing::info!(%kratos_identity_id, "Kratos identity already deleted");
            true
        }
        Some(IdentityDeletion::AlreadyAbsent) => {
            sink.capture(
                Report::new(UserDeletionError::UnknownIdentity)
                    .attach(format!("identity: {kratos_identity_id}")),
            );
            false
        }
        None => false,
    }
}

/// Deletes the email subscriptions of the given addresses, reporting whether all of them are
/// gone.
///
/// Returns [`None`] where no provider is configured, so the report omits the claim entirely.
/// Unknown addresses report `false`: unsubscribing needs the addresses, and they are only
/// obtainable while the identity exists, so claiming success here would leave a subscriber
/// nothing can reach again.
async fn delete_email_subscriptions<E>(
    provider: Option<&E>,
    emails: Option<&[String]>,
    sink: &mut ReportSink<UserDeletionError>,
) -> Option<bool>
where
    E: EmailSubscriptionProvider,
{
    match (provider, emails) {
        (None, _) => {
            tracing::info!("no email subscription provider configured, skipping");
            None
        }
        (Some(_), None) => {
            sink.capture(UserDeletionError::UnknownEmailAddresses);
            Some(false)
        }
        (Some(provider), Some(emails)) => {
            let mut all_ok = true;
            for email in emails {
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
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use error_stack::{Report, ReportSink};

    use super::{UserDeletionError, delete_email_subscriptions, record_identity_deletion};
    use crate::{
        email_subscription::{EmailSubscriptionError, EmailSubscriptionProvider},
        identity_provider::IdentityDeletion,
    };

    /// A provider that records the addresses it deleted and fails on one designated address.
    struct RecordingProvider {
        deleted: Mutex<Vec<String>>,
        fail_on: Option<&'static str>,
    }

    impl RecordingProvider {
        fn new(fail_on: Option<&'static str>) -> Self {
            Self {
                deleted: Mutex::new(Vec::new()),
                fail_on,
            }
        }

        fn deleted(&self) -> Vec<String> {
            self.deleted
                .lock()
                .expect("the recording mutex should not be poisoned")
                .clone()
        }
    }

    impl EmailSubscriptionProvider for RecordingProvider {
        fn delete_subscriber(
            &self,
            email: &str,
        ) -> impl Future<Output = Result<(), Report<EmailSubscriptionError>>> + Send {
            let outcome = if self.fail_on == Some(email) {
                Err(Report::new(EmailSubscriptionError::DeletionFailed {
                    email: email.to_owned(),
                }))
            } else {
                self.deleted
                    .lock()
                    .expect("the recording mutex should not be poisoned")
                    .push(email.to_owned());
                Ok(())
            };
            core::future::ready(outcome)
        }
    }

    #[test]
    fn confirmed_deletion_reports_the_identity_as_deleted() {
        let mut sink = ReportSink::new();

        let deleted = record_identity_deletion(
            Some(IdentityDeletion::Deleted),
            false,
            "some-identity",
            &mut sink,
        );

        assert!(
            deleted,
            "a confirmed deletion should report the identity as deleted"
        );
        assert!(
            sink.finish().is_ok(),
            "a confirmed deletion should not be an error"
        );
    }

    /// The address read saw the identity, so its absence for the delete means it was deleted
    /// between the two calls.
    #[test]
    fn identity_deleted_between_the_calls_counts_as_deleted() {
        let mut sink = ReportSink::new();

        let deleted = record_identity_deletion(
            Some(IdentityDeletion::AlreadyAbsent),
            true,
            "some-identity",
            &mut sink,
        );

        assert!(
            deleted,
            "an identity gone since the address read should count as deleted"
        );
        assert!(
            sink.finish().is_ok(),
            "an identity gone since the address read should not be an error"
        );
    }

    /// An identity absent for both the read and the delete confirms nothing — the ID may be
    /// stale, or the URL may answer 404 for every route.
    #[test]
    fn identity_absent_for_every_call_reports_the_deletion_as_unconfirmed() {
        let mut sink = ReportSink::new();

        let deleted = record_identity_deletion(
            Some(IdentityDeletion::AlreadyAbsent),
            false,
            "some-identity",
            &mut sink,
        );

        assert!(
            !deleted,
            "an identity absent for every call should not report the deletion as done"
        );
        let report = sink
            .finish()
            .expect_err("the unconfirmed deletion should surface as an error");
        assert!(
            report
                .current_contexts()
                .any(|context| matches!(context, UserDeletionError::UnknownIdentity)),
            "the unconfirmed deletion should surface as an unknown identity"
        );
    }

    #[test]
    fn failed_deletion_reports_the_identity_as_kept() {
        let mut sink = ReportSink::new();

        let deleted = record_identity_deletion(None, true, "some-identity", &mut sink);

        assert!(
            !deleted,
            "a failed deletion should not report the identity as deleted"
        );
        // The call site's `sink.attempt` already captured the failure.
        assert!(
            sink.finish().is_ok(),
            "the recording should not report the failure a second time"
        );
    }

    #[tokio::test]
    async fn unknown_addresses_report_the_cleanup_as_incomplete() {
        let provider = RecordingProvider::new(None);
        let mut sink = ReportSink::new();

        let deleted = delete_email_subscriptions(Some(&provider), None, &mut sink).await;

        assert_eq!(
            deleted,
            Some(false),
            "unknown addresses should report the cleanup as incomplete rather than done"
        );
        let report = sink
            .finish()
            .expect_err("the unknown addresses should surface as an error");
        assert!(
            report
                .current_contexts()
                .any(|context| matches!(context, UserDeletionError::UnknownEmailAddresses)),
            "the unknown addresses should surface as unknown addresses"
        );
        assert!(
            provider.deleted().is_empty(),
            "no deletion should be attempted without addresses"
        );
    }

    #[tokio::test]
    async fn identity_without_addresses_reports_the_cleanup_as_complete() {
        let provider = RecordingProvider::new(None);
        let mut sink = ReportSink::new();

        let deleted = delete_email_subscriptions(Some(&provider), Some(&[]), &mut sink).await;

        assert_eq!(
            deleted,
            Some(true),
            "an identity without addresses should leave nothing to clean up"
        );
        assert!(sink.finish().is_ok(), "no addresses should mean no errors");
    }

    #[tokio::test]
    async fn absent_provider_leaves_the_cleanup_unreported() {
        let mut sink = ReportSink::new();

        let deleted =
            delete_email_subscriptions(Option::<&RecordingProvider>::None, None, &mut sink).await;

        assert_eq!(
            deleted, None,
            "an absent provider should leave the claim out of the report entirely"
        );
        assert!(
            sink.finish().is_ok(),
            "an absent provider should not be an error"
        );
    }

    #[tokio::test]
    async fn a_failed_unsubscribe_still_attempts_the_remaining_addresses() {
        let provider = RecordingProvider::new(Some("first@example.com"));
        let mut sink = ReportSink::new();
        let emails = [
            "first@example.com".to_owned(),
            "second@example.com".to_owned(),
        ];

        let deleted = delete_email_subscriptions(Some(&provider), Some(&emails), &mut sink).await;

        assert_eq!(
            deleted,
            Some(false),
            "a failed unsubscribe should report the cleanup as incomplete"
        );
        let report = sink
            .finish()
            .expect_err("the failed address should surface as an error");
        assert!(
            report
                .current_contexts()
                .any(|context| matches!(context, UserDeletionError::EmailSubscription)),
            "the failed address should surface as a subscription failure"
        );
        assert_eq!(
            provider.deleted(),
            ["second@example.com"],
            "the remaining address should still be attempted"
        );
    }
}
