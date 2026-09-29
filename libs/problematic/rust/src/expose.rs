use alloc::boxed::Box;
use core::marker::PhantomData;

use http::HeaderMap;
use serde_core::Serialize;

use crate::{
    Problem, ProblemDetails, ProblemVariant,
    problem::{Occurrence, contains},
};

/// Maps an error to the answer its client receives: a variant of the [`Problem`] `K`.
///
/// Implement it for your error type, once for the [`Problem`] of each endpoint that can return
/// the error. [`expose`](Self::expose) answers through [`Answer::new`] with the
/// [`ProblemVariant`] the client receives, also for an error that stays internal. As `K` is a
/// local type, it can be implemented for a foreign error type such as `error_stack::Report<C>`.
///
/// A [`Rejection<K>`](crate::Rejection) can be created from every error implementing `Expose<K>`
/// that is an [`Error`](core::error::Error) or a `Report`, and `Send`, `Sync` and `'static`.
pub trait Expose<K: Problem> {
    /// The answer the client receives for this error.
    fn expose(&self) -> Answer<'_, K>;
}

/// The answer to an error: a variant of the [`Problem`] `K`.
///
/// [`Expose::expose`] creates it with [`Answer::new`]. It may borrow from the error.
pub struct Answer<'s, K> {
    occurrence: Box<dyn Occurrence + Send + Sync + 's>,
    problem: PhantomData<fn() -> K>,
}

impl<'s, K: Problem> Answer<'s, K> {
    /// The answer with `variant`.
    ///
    /// # Panics
    ///
    /// Fails at compile time if `K::VARIANTS` lists no variant with the problem type of `V`:
    ///
    /// ```compile_fail,E0080
    /// # use std::{borrow::Cow, fmt};
    /// use http::StatusCode;
    /// use problematic::{Answer, Problem, ProblemType, ProblemVariant, Variant};
    ///
    /// #[derive(serde::Serialize, schemars::JsonSchema)]
    /// struct UserNotFound;
    /// # impl fmt::Display for UserNotFound {
    /// #     fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
    /// #         formatter.write_str("The user does not exist.")
    /// #     }
    /// # }
    ///
    /// impl ProblemVariant for UserNotFound {
    ///     const TYPE: ProblemType = ProblemType {
    ///         type_uri: Cow::Borrowed("https://example.com/problems/user-not-found"),
    ///         title: Cow::Borrowed("User not found"),
    ///         status: StatusCode::NOT_FOUND,
    ///     };
    /// }
    ///
    /// #[derive(serde::Serialize, schemars::JsonSchema)]
    /// struct EmailTaken;
    /// # impl fmt::Display for EmailTaken {
    /// #     fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
    /// #         formatter.write_str("The email address belongs to another user.")
    /// #     }
    /// # }
    ///
    /// impl ProblemVariant for EmailTaken {
    ///     const TYPE: ProblemType = ProblemType {
    ///         type_uri: Cow::Borrowed("https://example.com/problems/email-taken"),
    ///         title: Cow::Borrowed("Email taken"),
    ///         status: StatusCode::CONFLICT,
    ///     };
    /// }
    ///
    /// /// The errors a client can receive from `GET /users/{id}`.
    /// struct GetUserProblem;
    ///
    /// impl Problem for GetUserProblem {
    ///     const VARIANTS: &'static [Variant] = &[Variant::of::<UserNotFound>()];
    /// }
    ///
    /// // Fails to compile: `GetUserProblem` does not list `EmailTaken`.
    /// let answer = Answer::<GetUserProblem>::new(EmailTaken);
    /// ```
    #[must_use]
    pub fn new<V: ProblemVariant + Send + Sync + 's>(variant: V) -> Self {
        const {
            assert!(
                contains(K::VARIANTS, &V::TYPE),
                "`K::VARIANTS` should list the variant"
            );
        };

        Self {
            occurrence: Box::new(variant),
            problem: PhantomData,
        }
    }
}

impl<K> Answer<'_, K> {
    /// The [`ProblemDetails`] the client receives.
    #[must_use]
    pub fn details(&self) -> ProblemDetails<'_, impl Serialize + '_> {
        self.occurrence.details()
    }

    /// Adds the response headers of the variant, such as `Retry-After`, to `headers`.
    pub fn headers(&self, headers: &mut HeaderMap) {
        self.occurrence.headers(headers);
    }
}
