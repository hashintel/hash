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
//! The providers are the extension point, and the credential vocabulary is not. A new failure
//! mode extends [`AuthenticationErrorKind`], a new caller type the sealed [`Caller`], and both
//! are changes to this crate.
//!
//! [`provider`]: authentication::provider
//! [`AuthenticationProvider`]: authentication::provider::AuthenticationProvider
//! [`Caller`]: authentication::provider::Caller
//! [`AuthenticatedActorId`]: authentication::AuthenticatedActorId
//! [`AuthenticationErrorKind`]: authentication::request::AuthenticationErrorKind
//!
//! # Example
//!
//! A router assembles the request middlewares as address gate, authentication, principal
//! limiter — requests traverse them in that order — with the tracing layer on the outside:
//!
//! ```
//! use core::{marker::PhantomData, num::NonZeroU32, ops::ControlFlow};
//! use std::sync::Arc;
//!
//! use axum::{Router, routing::get};
//! use error_stack::Report;
//! use hash_middleware::{
//!     authentication::{
//!         AuthenticatedActorId, AuthenticationLayer, AuthenticationMetrics,
//!         provider::{AuthenticationProvider, Caller},
//!         request::AuthenticationError,
//!     },
//!     rate_limit::{
//!         ClientIpSource, IpGateLayer, PrincipalLimitLayer, RateLimitConfig, RateLimitMode,
//!         RateLimiters,
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
//!     ) -> ControlFlow<Result<C, Arc<Report<AuthenticationError>>>> {
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
//! let service_secret: Arc<str> = Arc::from("service-secret");
//!
//! let router: Router = Router::new()
//!     .route("/whoami", get(whoami))
//!     .route_layer(PrincipalLimitLayer {
//!         limiters: Arc::clone(&limiters),
//!         service_secret: Arc::clone(&service_secret),
//!     })
//!     .route_layer(AuthenticationLayer::<_, ActorId> {
//!         provider: Arc::new(Verifier),
//!         service_secret: Arc::clone(&service_secret),
//!         metrics: Arc::new(AuthenticationMetrics::new(&meter)),
//!         bootstrap_route: |_path| false,
//!         caller: PhantomData,
//!     })
//!     .layer(IpGateLayer {
//!         limiters,
//!         service_secret,
//!     })
//!     .layer(HttpTracingLayer::new(|path| path == "/health"));
//!
//! // Serve the router with `into_make_service_with_connect_info::<SocketAddr>()`, so the gate
//! // can read the peer address.
//! # let _ = router;
//! # }
//! ```
//!
//! # Feature flags
//!
//! Both are off by default.
//!
//! - `clap`: derives `clap::ValueEnum` on [`RateLimitMode`] and [`ClientIpSource`], so a service
//!   parses them straight from its command line.
//! - `test-utils`: exposes the fixed-outcome provider `StaticAuthenticationProvider` and
//!   `expect_rejection` to dependent crates' tests.
//!
//! [`RateLimitMode`]: rate_limit::RateLimitMode
//! [`ClientIpSource`]: rate_limit::ClientIpSource
//!
//! # Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]
#![feature(impl_trait_in_assoc_type, generic_atomic)]
#![cfg_attr(test, feature(variant_count))]

extern crate alloc;

pub mod authentication;
pub mod rate_limit;
mod response;
pub mod telemetry;
#[cfg(test)]
mod test_metrics;
