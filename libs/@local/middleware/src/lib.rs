//! HTTP middleware for HASH's services
//!
//! The request-handling layers a service composes into its axum router, and the contracts behind
//! them:
//!
//! - [`authentication`] resolves each request's credentials once; handlers receive the actor
//!   through the [`AuthenticatedActorId`] extractor. Its [`provider`] submodule carries
//!   [`AuthenticationProvider`] and [`Caller`], the contract between the middleware and the
//!   credential verifiers a service supplies.
//! - [`rate_limit`] budgets requests by client address ahead of authentication and by resolved
//!   principal behind it — its module documentation states the ordering contract.
//! - [`telemetry`] spans every request and joins the caller's OpenTelemetry trace.
//!
//! The providers are the extension point; the credential vocabulary is not. A new failure mode
//! extends [`AuthenticationError`], a new caller type the sealed [`Caller`] — both are changes to
//! this crate.
//!
//! [`provider`]: authentication::provider
//! [`AuthenticationProvider`]: authentication::provider::AuthenticationProvider
//! [`Caller`]: authentication::provider::Caller
//! [`AuthenticatedActorId`]: authentication::AuthenticatedActorId
//! [`AuthenticationError`]: authentication::request::AuthenticationError
//!
//! # Example
//!
//! A router assembles the request middlewares as address gate, authentication, principal
//! limiter — requests traverse them in that order — with the tracing layer on the outside:
//!
//! ```
//! use core::{num::NonZeroU32, ops::ControlFlow};
//! use std::sync::Arc;
//!
//! use axum::{Router, middleware, routing::get};
//! use error_stack::Report;
//! use hash_middleware::{
//!     authentication::{
//!         AuthenticatedActorId, AuthenticationMetrics, authentication_middleware,
//!         provider::{AuthenticationProvider, Caller},
//!         request::AuthenticationError,
//!     },
//!     rate_limit::{
//!         ClientIpSource, RateLimitConfig, RateLimitMode, RateLimiters, ip_gate_middleware,
//!         principal_limit_middleware,
//!     },
//!     telemetry::HttpTracingLayer,
//! };
//! use http::HeaderMap;
//! use type_system::principal::actor::ActorId;
//!
//! /// The service's credential verifier; a real one checks sessions or tokens.
//! struct Verifier;
//!
//! impl<C: Caller> AuthenticationProvider<C> for Verifier {
//!     async fn authenticate(
//!         &self,
//!         _headers: &HeaderMap,
//!     ) -> ControlFlow<Result<C, Report<AuthenticationError>>> {
//!         ControlFlow::Continue(())
//!     }
//! }
//!
//! /// Taking [`AuthenticatedActorId`] is how the handler requires an actor.
//! async fn whoami(AuthenticatedActorId(actor): AuthenticatedActorId) -> String {
//!     actor.to_string()
//! }
//!
//! # #[tokio::main(flavor = "current_thread")]
//! # async fn main() {
//! # let meter = opentelemetry::global::meter("doc");
//! let quota = |value| NonZeroU32::new(value).expect("the quota should be non-zero");
//! let limiters = RateLimiters::start(
//!     &RateLimitConfig {
//!         rate_limit_mode: RateLimitMode::Observe,
//!         client_ip_source: ClientIpSource::ConnectInfo,
//!         rate_limit_gate_per_second: quota(10),
//!         rate_limit_gate_burst: quota(50),
//!         rate_limit_anonymous_per_hour: quota(60),
//!         rate_limit_anonymous_burst: quota(50),
//!         rate_limit_actor_per_hour: quota(6000),
//!         rate_limit_actor_burst: quota(100),
//!     },
//!     &meter,
//! );
//!
//! let provider = Arc::new(Verifier);
//! let service_secret: Arc<str> = Arc::from("service-secret");
//! let auth_secret = Arc::clone(&service_secret);
//! let auth_metrics = Arc::new(AuthenticationMetrics::new(&meter));
//! let principal_limiters = Arc::clone(&limiters);
//! let principal_secret = Arc::clone(&service_secret);
//! let gate_limiters = Arc::clone(&limiters);
//! let gate_secret = Arc::clone(&service_secret);
//!
//! let router: Router = Router::new()
//!     .route("/whoami", get(whoami))
//!     .route_layer(middleware::from_fn(move |request, next| {
//!         principal_limit_middleware(
//!             Arc::clone(&principal_limiters),
//!             Arc::clone(&principal_secret),
//!             request,
//!             next,
//!         )
//!     }))
//!     .route_layer(middleware::from_fn(move |request, next| {
//!         authentication_middleware::<_, ActorId>(
//!             Arc::clone(&provider),
//!             Arc::clone(&auth_secret),
//!             Arc::clone(&auth_metrics),
//!             |_path| false,
//!             request,
//!             next,
//!         )
//!     }))
//!     .layer(middleware::from_fn(move |request, next| {
//!         ip_gate_middleware(
//!             Arc::clone(&gate_limiters),
//!             Arc::clone(&gate_secret),
//!             request,
//!             next,
//!         )
//!     }))
//!     .layer(HttpTracingLayer::new(|path| path == "/health"));
//!
//! // Serve the router with `into_make_service_with_connect_info::<SocketAddr>()`, so the gate
//! // can read the peer address.
//! # let _ = router;
//! # }
//! ```
//!
//! # Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]
#![feature(impl_trait_in_assoc_type)]
#![cfg_attr(test, feature(variant_count))]

extern crate alloc;

pub mod authentication;
pub mod rate_limit;
mod response;
pub mod telemetry;
#[cfg(test)]
mod test_metrics;
