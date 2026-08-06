//! One request's visibility, resolved from its admitted authority token.
//!
//! A [`VisibilityProof`] masks every corpus-bearing response, and [`Visibility`] is that proof for
//! one request. Extraction admits the presented token through [`authorization::admit`], then
//! resolves the scope the token seals (actor and filter digest, the visibility key's own fields)
//! through the store, held in the visibility cache for its reuse window. A data route that resolves
//! visibility without an admitted token is unrepresentable, because the key's identity comes out of
//! the sealed scope.
//!
//! The `X-Authenticated-User-Actor-Id` header names the actor, and that header is the trust
//! boundary the graph's REST API stands on. The gateway authenticates the session and states the
//! actor, and this process takes the header as that statement. A request carrying no such header is
//! a malformed request and answers 400. A request whose token refuses answers 401. A request whose
//! own filter document does not compile answers 400, and a request the store cannot resolve for any
//! other reason answers 503. [`proof_problem`] is that split. Every refusal happens before any
//! assembly reads the request.

use alloc::sync::Arc;
use core::{
    future::{self, Future},
    str::FromStr as _,
};
use std::time::Instant;

use aide::{OperationInput, generate::GenContext, openapi};
use axum::{
    extract::FromRequestParts,
    http::{StatusCode, request::Parts},
};
use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
use hash_graph_postgres_store::store::{PostgresStorePool, error::StoreError};
use hash_graph_store::{filter::Filter, pool::StorePool as _};
use type_system::{knowledge::Entity, principal::actor::ActorEntityUuid};
use uuid::Uuid;

use super::{
    AppState, authorization, headers,
    problem::{Problem, ProblemType, missing_actor, unauthorized, visibility_unavailable},
};
use crate::serve::{
    Atlas, CutOffset, View, ViewError, VisibilityLimits, VisibilityProof,
    cache::{CacheEntry, CacheKey, FilterDigest, PendingCacheEntry, VisibilityCache},
    hydrate::compile::{ProofError, visibility_proof},
};

/// The header naming the authenticated actor.
///
/// Parity with the graph's REST API, which accepts this name, fixes the spelling. Headers this
/// crate introduces carry no prefix.
const ACTOR_HEADER: &str = "X-Authenticated-User-Actor-Id";

/// The resolution state behind every [`Visibility`].
///
/// A request's visibility comes from the store, through the cache.
///
/// One cache and one store handle serve the whole router, so concurrent requests for one scope
/// resolve once and the held entry answers a returning caller.
#[derive(Clone)]
pub(super) struct Authority {
    /// The store permission resolution reads through.
    pool: Arc<PostgresStorePool>,
    /// Resolved scopes, held for their reuse window.
    cache: Arc<VisibilityCache>,
}

impl Authority {
    /// Builds the resolution state over `pool`, holding resolved scopes under `limits`.
    pub(super) fn new(pool: Arc<PostgresStorePool>, limits: VisibilityLimits) -> Self {
        Self {
            pool,
            cache: Arc::new(VisibilityCache::new(limits)),
        }
    }
}

impl core::fmt::Debug for Authority {
    /// Names the cache without the store handle, which carries no [`Debug`].
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        fmt.debug_struct("Authority")
            .field("cache", &self.cache)
            .finish_non_exhaustive()
    }
}

/// One resolved scope's delivery inputs.
///
/// These are the values a scope holds per resolution rather than per request. The manifest consumes
/// this value directly. The data routes receive it through [`Visibility`], which adds the request's
/// token-bound cut offset.
#[derive(Debug, Clone)]
pub(super) struct Resolved {
    /// The held entry the scope resolved to.
    entry: Arc<CacheEntry>,
}

impl Resolved {
    /// Returns the rows the scope may see.
    pub(super) fn proof(&self) -> &VisibilityProof {
        self.entry.proof()
    }
}

/// The resolved scope for one request, plus the token-bound delivery-cut offset.
#[expect(
    clippy::min_ident_chars,
    reason = "`k` is the delivery-cut offset's name throughout the density contract"
)]
#[derive(Debug, Clone)]
pub(super) struct Visibility {
    /// The held entry the request's scope resolved to.
    ///
    /// It hands a request the proof, the census resolved with it, and the view's delivery
    /// schedule. One resolution per scope answers every request under that scope, so the root
    /// tile's global metadata costs no walk on the request that reads it.
    entry: Arc<CacheEntry>,
    /// The delivery-cut offset the presented token seals.
    ///
    /// Sealed at the manifest by the density policy and read back at admission, so the served cut
    /// and the declared cut are the same value by construction.
    pub k: CutOffset,
}

impl Visibility {
    /// Returns the rows the request may see.
    pub(super) fn proof(&self) -> &VisibilityProof {
        self.entry.proof()
    }

    /// Binds the request's delivery view, the held resolution read at the token's cut offset.
    ///
    /// Every data route calls this once and hands the result to assembly, so the request boundary
    /// checks the pairing of proof, census and schedule rather than each endpoint restating it.
    ///
    /// # Errors
    ///
    /// The uniform `401` problem when the presented token seals an offset the resolved view cannot
    /// serve, whose remedy is the fresh manifest request that answer already asks for. Every other
    /// binding failure answers the internal problem, because this process produced the inputs.
    pub(super) fn view(&self, atlas: &Atlas) -> Result<View<'_>, Problem<'static>> {
        View::of(atlas, &self.entry, self.k).map_err(view_problem)
    }
}

impl FromRequestParts<AppState> for Visibility {
    type Rejection = Problem<'static>;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let scope = authorization::admit(parts, state)?;
        let resolved = resolve(state, *scope.actor, scope.filter.digest(), None).await?;

        Ok(Self {
            entry: resolved.entry,
            k: scope.k,
        })
    }
}

impl OperationInput for Visibility {
    /// Documents the presented token as a required request header.
    ///
    /// Extraction admits the request before resolving anything, so a route taking this extractor
    /// answers nothing without a token.
    fn operation_input(_ctx: &mut GenContext, operation: &mut openapi::Operation) {
        operation
            .parameters
            .push(openapi::ReferenceOr::Item(headers::presented_authority(
                headers::Required::Yes,
            )));
    }
}

/// Resolves one scope's visibility through the store, held in the cache for its reuse window.
///
/// The manifest resolves in its handler body, after its generation and continuity judgments. The
/// data routes resolve through [`Visibility`]'s extraction. Both paths call this function, so one
/// scope holds one entry wherever a caller asks for its resolution.
///
/// A filtered resolution compiles `document`, the filter's bytes as presented, into the proof. A
/// caller holding only the digest - a data route, whose scope travels sealed - reads the held
/// entry's copy, which is what lets the soft window revalidate a filtered scope without a client
/// round trip.
///
/// # Errors
///
/// The uniform `401` problem for a filtered scope with no document held anywhere - the client
/// re-presents the document at the manifest - and, for a resolution that fails, whichever problem
/// [`proof_problem`] gives the failing stage: `400` for the caller's own filter, the internal
/// problem for this deployment's, and the `503` visibility problem for every condition of the
/// store's.
pub(super) async fn resolve(
    state: &AppState,
    actor: ActorEntityUuid,
    filter: Option<FilterDigest>,
    document: Option<Arc<[u8]>>,
) -> Result<Resolved, Problem<'static>> {
    let key = CacheKey {
        generation: state.atlas.generation(),
        actor,
        filter,
    };

    let document = match (filter, document) {
        (Some(_), None) => Some(
            state
                .authority
                .cache
                .get(&key)
                .await
                .and_then(|entry| entry.filter_document())
                .ok_or_else(unauthorized)?,
        ),
        (_, document) => document,
    };

    let pool = Arc::clone(&state.authority.pool);
    let atlas = Arc::clone(&state.atlas);
    let actor = AuthenticatedActor::Uuid(actor);

    let entry = state
        .authority
        .cache
        .resolve(key, Instant::now(), async move || {
            // The resolution acquires a connection for itself alone, and only a miss reaches here:
            // a held scope answers without touching the pool.
            let store = pool
                .acquire(None)
                .await
                .map_err(|report| ProofError::Connect(report.change_context(StoreError)))?;

            // Filter protection is the deployment's own setting, read from the store the
            // resolution runs against, so a filtered resolution carries the protection that
            // store's own reads carry.
            let protection = Arc::clone(&store.settings);

            let filter = document
                .as_deref()
                .map(serde_json::from_slice::<Filter<'_, Entity>>)
                .transpose()
                .map_err(ProofError::Document)?;

            // The census rides the resolution, not the request: one pass over the base column
            // per scope, shared by every root tile it answers.
            let proof = visibility_proof(
                actor,
                filter.as_ref(),
                &protection.filter_protection,
                &store,
                &atlas,
            )
            .await?;

            Ok::<_, ProofError>(PendingCacheEntry::of(&atlas, proof, document))
        })
        .await
        .map_err(|error| proof_problem(&error))?;

    Ok(Resolved { entry })
}

/// Answers one failed resolution with the problem its failing stage earns.
///
/// Three readings, because a caller cannot repair all three the same way. [`ProofError::Filter`] is
/// the caller's own filter document failing to compile against the entity query surface, which no
/// retry repairs. It answers `400` `invalid-body`, the problem an unparsable document already earns
/// at the manifest. [`ProofError::Convert`] joins that reading, since a filter parameter that
/// does not match its path's type is the caller's document to fix.
/// [`ProofError::PolicyFilter`] is this deployment's policy set failing to compile, so it answers
/// the internal problem with the compiler's message in the log rather than the response. Every
/// remaining stage answers the `503`, because the process cannot say what the caller may see and a
/// later attempt may succeed.
///
/// [`ProofError::Query`] stays a `503` even though a caller's document can provoke it (a parameter
/// whose type the compiler accepts and Postgres rejects) because that one variant also carries real
/// store faults. Reading every filtered query failure as the caller's would answer an outage with a
/// `400`. The match lists every variant rather than defaulting, so a new failing stage has to
/// choose its status instead of inheriting one.
fn proof_problem(error: &ProofError) -> Problem<'static> {
    match error {
        ProofError::Filter(report) => Problem::new(
            StatusCode::BAD_REQUEST,
            ProblemType::InvalidBody,
            format!(
                "the filter document does not compile: {}",
                report.current_context()
            ),
        ),
        ProofError::Convert(report) => Problem::new(
            StatusCode::BAD_REQUEST,
            ProblemType::InvalidBody,
            format!(
                "a filter parameter does not match its path's type: {}",
                report.current_context()
            ),
        ),
        ProofError::PolicyFilter(report) => Problem::internal(
            report.current_context(),
            "compiling the policy filter failed",
        ),
        ProofError::Connect(_)
        | ProofError::Policies(_)
        | ProofError::Document(_)
        | ProofError::Query(_)
        | ProofError::Rows(_) => visibility_unavailable(error),
    }
}

/// The problem one refused binding answers.
///
/// A sealed offset the view cannot serve is stale authority rather than a request defect. An
/// operator view takes no offset, so the mint that issued a token carrying one ran under a
/// contract this process no longer serves. That answers the uniform `401`, whose stated remedy is
/// a fresh manifest request, and the mint that request runs seals the offset the view does serve.
/// The combination stays a server defect in the log, because no current mint can produce it.
///
/// Every other binding failure names an input this process produced and answers the internal
/// problem.
fn view_problem(error: ViewError) -> Problem<'static> {
    match error {
        ViewError::Offset(_) => {
            tracing::error!(
                ?error,
                "a presented token sealed an offset its view cannot serve"
            );

            unauthorized()
        }
        ViewError::Contract | ViewError::Schedule(_) => {
            Problem::internal(error, "delivery refused its schedule")
        }
    }
}

/// The authenticated actor one request names, without resolving its scope.
///
/// The manifest's mint and continuity reading need the actor identity alone. [`Visibility`]
/// resolves the full scope where a handler assembles a response.
#[derive(Debug, Clone, Copy)]
pub(super) struct Actor(pub AuthenticatedActor);

impl FromRequestParts<AppState> for Actor {
    type Rejection = Problem<'static>;

    fn from_request_parts(
        parts: &mut Parts,
        _state: &AppState,
    ) -> impl Future<Output = Result<Self, Self::Rejection>> + Send {
        future::ready(actor(parts).map(Self))
    }
}

impl OperationInput for Actor {}

/// Reads the actor the gateway authenticated.
///
/// Absent, non-ASCII and unparsable headers answer one problem. Each is a malformed request, and
/// the detail names which of the three it was.
pub(super) fn actor(parts: &Parts) -> Result<AuthenticatedActor, Problem<'static>> {
    let header = parts
        .headers
        .get(ACTOR_HEADER)
        .ok_or_else(|| missing_actor(format!("`{ACTOR_HEADER}` is absent")))?;

    let value = header.to_str().map_err(|_error| {
        missing_actor(format!("`{ACTOR_HEADER}` is not a visible ASCII string"))
    })?;

    let uuid = Uuid::from_str(value)
        .map_err(|error| missing_actor(format!("`{ACTOR_HEADER}` is not a uuid: {error}")))?;

    Ok(AuthenticatedActor::Uuid(ActorEntityUuid::new(uuid)))
}

#[cfg(test)]
mod tests {
    use error_stack::Report;
    use hash_graph_postgres_store::store::postgres::query::SelectCompilerError;

    use super::{proof_problem, view_problem};
    use crate::serve::{
        CutOffset, ViewError, hydrate::compile::ProofError, schedule::ScheduleWidthError,
    };

    /// One real compiler error, reused so the mapping is visibly a statement about the failing
    /// stage rather than about the error inside it.
    ///
    /// `MultipleEmbeddings` is a failure a caller's own filter can produce, which is why it is the
    /// one used for both stages here: the same value answers `400` under [`ProofError::Filter`] and
    /// `500` under [`ProofError::PolicyFilter`].
    fn compiler_error() -> Report<SelectCompilerError> {
        Report::new(SelectCompilerError::MultipleEmbeddings)
    }

    /// Renders one problem as the document a client reads.
    fn document(error: &ProofError) -> serde_json::Value {
        serde_json::to_value(proof_problem(error)).expect("problem documents serialize")
    }

    /// The caller's own filter failing to compile is the caller's to repair: `400 invalid-body`.
    #[test]
    fn caller_filter_that_does_not_compile_answers_invalid_body() {
        let document = document(&ProofError::Filter(compiler_error()));

        assert_eq!(document["status"], 400);
        assert_eq!(document["type"], "/problems/atlas/invalid-body");
        assert!(
            document["detail"]
                .as_str()
                .expect("the problem carries a detail")
                .contains("embedding"),
            "the caller is not told what about its document failed: {document:#}"
        );
    }

    /// This deployment's policy filter failing to compile answers the internal problem, and the
    /// compiler's message stays in the log.
    #[test]
    fn policy_filter_answers_the_internal_problem_without_its_message() {
        let document = document(&ProofError::PolicyFilter(compiler_error()));

        assert_eq!(document["status"], 500);
        assert_eq!(document["type"], "/problems/atlas/internal");
        assert!(
            !document["detail"]
                .as_str()
                .expect("the problem carries a detail")
                .contains("embedding"),
            "the internal problem leaks the compiler's message: {document:#}"
        );
    }

    /// Every other stage is a condition of the store's, and answers the `503`.
    ///
    /// [`ProofError::Document`] stands for the bucket: it is the one store-stage variant a test can
    /// construct, since `tokio_postgres::Error` has no public constructor. What keeps the rest of
    /// the bucket honest is not this test but the mapping's exhaustive match - a new failing stage
    /// does not compile until it has chosen a status.
    #[test]
    fn store_stage_answers_the_visibility_problem() {
        let parse = serde_json::from_str::<u32>("not a number").expect_err("the parse fails");
        let document = document(&ProofError::Document(parse));

        assert_eq!(document["status"], 503);
        assert_eq!(document["type"], "/problems/atlas/visibility-unavailable");
    }

    /// A sealed offset the view cannot serve answers the uniform refusal, not the internal problem.
    ///
    /// The client action for a stale authority is a fresh manifest request, and that mint reseals
    /// the offset the view does serve. Every other binding failure runs beside it here, so the case
    /// states which refusals are the caller's to act on and which are this process reporting
    /// itself.
    #[test]
    fn refused_offset_answers_the_uniform_refusal() {
        let refused = serde_json::to_value(view_problem(ViewError::Offset(CutOffset::new(1))))
            .expect("problem documents serialize");

        assert_eq!(refused["status"], 401);
        assert_eq!(refused["type"], "/problems/atlas/unauthorized");

        let width = ScheduleWidthError {
            max_tile_depth: 3,
            span: 1,
            k: CutOffset::new(31),
        };
        for defect in [ViewError::Contract, ViewError::Schedule(width)] {
            let document =
                serde_json::to_value(view_problem(defect)).expect("problem documents serialize");

            assert_eq!(document["status"], 500, "{defect:?} is a server defect");
            assert_eq!(document["type"], "/problems/atlas/internal");
        }
    }
}
