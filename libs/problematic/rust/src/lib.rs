//! Problem details ([RFC 9457]) for the errors of an HTTP API, with the public and the internal
//! errors of every endpoint kept apart by the compiler.
//!
//! [RFC 9457]: https://www.rfc-editor.org/rfc/rfc9457
//!
//! A client can act on some errors of an endpoint, such as a missing user. Other errors, such as
//! a failed database query, are internal: the client receives `500 Internal Server Error` and
//! nothing more. problematic defines on three levels which errors a client receives:
//!
//! - A [`ProblemVariant`] is one kind of error a client can receive. It specifies the
//!   [`ProblemType`] of its response, and its fields become the extension members of the
//!   [`ProblemDetails`].
//! - A [`Problem`] lists the variants one endpoint answers with, and [`Variant::INTERNAL`] if an
//!   error of the endpoint stays internal.
//! - [`Expose`] maps every error of your error type to one of these variants, or keeps it internal.
//!
//! Answering with a variant whose type URI and status the [`Problem`] does not list fails to
//! compile. A handler returns <code>Result&lt;_, [Rejection]&lt;K&gt;&gt;</code>, and `?` turns
//! its error into the problem details response that `K` allows. With the `aide` feature, the
//! OpenAPI documentation of the endpoint lists these errors next to those of its middlewares, see
//! [`aide`].
//!
//! [`ProblemDetails`] serializes and deserializes problem details objects, borrowing strings from
//! the input where it can, and describes them as JSON Schema. problematic requires a nightly
//! toolchain.
//!
//! # Features
//!
//! - `axum`: a [`Rejection`] is an [axum](https://docs.rs/axum) response.
//! - `aide`: the OpenAPI document that [aide](https://docs.rs/aide) generates lists the errors of
//!   every endpoint.
//!
//! # Examples
//!
//! The errors of `PATCH /users/{user}`, from the variants to the documented route:
//!
//! ```
//! use std::{borrow::Cow, fmt};
//!
//! use aide::{
//!     axum::{ApiRouter, routing::patch},
//!     openapi::OpenApi,
//! };
//! use axum::extract::Path;
//! use http::{Response, StatusCode};
//! use problematic::{Answer, Expose, Problem, ProblemType, ProblemVariant, Rejection, Variant};
//! use serde_json::{Value, json};
//!
//! // One kind of error a client can receive. Its doc comment describes it in the OpenAPI
//! // documentation, its `Display` is the `detail` of the response, and its fields are extension
//! // members.
//! /// The user named in the request does not exist.
//! #[derive(serde::Serialize, schemars::JsonSchema)]
//! struct UserNotFound<'e> {
//!     /// The ID of the missing user.
//!     user: &'e str,
//! }
//!
//! impl fmt::Display for UserNotFound<'_> {
//!     fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
//!         write!(formatter, "The user `{}` does not exist.", self.user)
//!     }
//! }
//!
//! impl ProblemVariant for UserNotFound<'_> {
//!     const TYPE: ProblemType = ProblemType {
//!         type_uri: Cow::Borrowed("https://example.com/problems/user-not-found"),
//!         title: Cow::Borrowed("User not found"),
//!         status: StatusCode::NOT_FOUND,
//!     };
//! }
//!
//! /// The email address belongs to another user.
//! #[derive(serde::Serialize, schemars::JsonSchema)]
//! struct EmailTaken;
//!
//! impl fmt::Display for EmailTaken {
//!     fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
//!         formatter.write_str("The email address belongs to another user.")
//!     }
//! }
//!
//! impl ProblemVariant for EmailTaken {
//!     const TYPE: ProblemType = ProblemType {
//!         type_uri: Cow::Borrowed("https://example.com/problems/email-taken"),
//!         title: Cow::Borrowed("Email taken"),
//!         status: StatusCode::CONFLICT,
//!     };
//! }
//!
//! // The errors a client can receive from `PATCH /users/{user}`. A failed store stays internal,
//! // so `UpdateUserProblem` lists the internal error as well.
//! struct UpdateUserProblem;
//!
//! impl Problem for UpdateUserProblem {
//!     const VARIANTS: &'static [Variant] = &[
//!         Variant::of::<UserNotFound<'static>>(),
//!         Variant::of::<EmailTaken>(),
//!         Variant::INTERNAL,
//!     ];
//! }
//!
//! #[derive(Debug)]
//! enum UpdateUserError {
//!     NotFound { user: String },
//!     EmailTaken,
//!     Store,
//! }
//! # impl fmt::Display for UpdateUserError {
//! #     fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
//! #         formatter.write_str("could not update the user")
//! #     }
//! # }
//!
//! // A rejection keeps the error it was created from, so the error type implements `Error`.
//! impl core::error::Error for UpdateUserError {}
//!
//! // Maps every error to the variant the client receives, or keeps it internal.
//! impl Expose<UpdateUserProblem> for UpdateUserError {
//!     fn expose(&self) -> Answer<'_, UpdateUserProblem> {
//!         match self {
//!             Self::NotFound { user } => Answer::new(UserNotFound { user }),
//!             Self::EmailTaken => Answer::new(EmailTaken),
//!             Self::Store => Answer::internal(),
//!         }
//!     }
//! }
//!
//! fn update(user: &str) -> Result<(), UpdateUserError> {
//!     match user {
//!         "alice" => Ok(()),
//!         "bob" => Err(UpdateUserError::EmailTaken),
//!         "carol" => Err(UpdateUserError::Store),
//!         _ => Err(UpdateUserError::NotFound {
//!             user: user.to_owned(),
//!         }),
//!     }
//! }
//!
//! // `?` turns the error into a rejection, which becomes the problem details response.
//! async fn update_user(Path(user): Path<String>) -> Result<(), Rejection<UpdateUserProblem>> {
//!     update(&user)?;
//!     Ok(())
//! }
//!
//! // aide documents the errors of the route from the return type of its handler.
//! let mut api = OpenApi::default();
//! let _router: axum::Router = ApiRouter::new()
//!     .api_route("/users/{user}", patch(update_user))
//!     .finish_api(&mut api);
//!
//! let api = serde_json::to_value(&api)?;
//! let responses = &api["paths"]["/users/{user}"]["patch"]["responses"];
//! assert_eq!(
//!     responses["404"]["description"],
//!     "The user named in the request does not exist."
//! );
//! assert_eq!(
//!     responses["409"]["description"],
//!     "The email address belongs to another user."
//! );
//! assert_eq!(
//!     responses["500"]["description"],
//!     "An internal error prevented the request from completing."
//! );
//!
//! // The response to a missing user names the user.
//! let error = update("dave").expect_err("dave should not exist");
//! let response = Response::from(Rejection::<UpdateUserProblem>::from(error));
//! assert_eq!(
//!     serde_json::from_slice::<Value>(response.body())?,
//!     json!({
//!         "type": "https://example.com/problems/user-not-found",
//!         "title": "User not found",
//!         "status": 404,
//!         "detail": "The user `dave` does not exist.",
//!         "user": "dave"
//!     })
//! );
//!
//! // The response to a failed store is `500 Internal Server Error` alone.
//! let error = update("carol").expect_err("the store should fail for carol");
//! let response = Response::from(Rejection::<UpdateUserProblem>::from(error));
//! assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
//! # Ok::<(), serde_json::Error>(())
//! ```

#![feature(const_convert, const_destruct, const_trait_impl)]
#![cfg_attr(doc, feature(doc_cfg))]

extern crate alloc;

#[cfg(feature = "aide")]
pub mod aide;
#[cfg(feature = "axum")]
mod axum;
mod expose;
mod problem;
mod problem_details;
mod problem_type;
mod rejection;
mod serde;

pub use self::{
    expose::{Answer, Expose},
    problem::{Header, Problem, ProblemVariant, Variant},
    problem_details::ProblemDetails,
    problem_type::ProblemType,
    rejection::Rejection,
};
