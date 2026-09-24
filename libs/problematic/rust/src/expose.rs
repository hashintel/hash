use alloc::boxed::Box;
use core::marker::PhantomData;

use http::HeaderMap;
use serde_core::Serialize;

use crate::{
    Problem, ProblemDetails, ProblemVariant,
    problem::{INTERNAL, Occurrence, contains},
};

/// Maps an error to the answer its client receives: a variant of the [`Problem`] `K`, or the
/// internal error.
///
/// Implement it for your error type, once for the [`Problem`] of each endpoint that can return
/// the error. [`expose`](Self::expose) answers with a [`ProblemVariant`] through [`Answer::new`],
/// or keeps the error internal through [`Answer::internal`]. As `K` is a local type, it can be
/// implemented for a foreign error type such as `error_stack::Report<C>`.
///
/// A [`Rejection<K>`](crate::Rejection) can be created from every error implementing `Expose<K>`.
pub trait Expose<K: Problem> {
    /// The answer the client receives for this error.
    fn expose(&self) -> Answer<'_, K>;
}

/// The answer to an error: a variant of the [`Problem`] `K`, or the internal error.
///
/// [`Expose::expose`] creates it with [`Answer::new`] or [`Answer::internal`]. It may borrow from
/// the error.
pub struct Answer<'s, K> {
    answered: Answered<'s>,
    problem: PhantomData<fn() -> K>,
}

enum Answered<'s> {
    Variant(Box<dyn Occurrence + 's>),
    Internal,
}

impl<'s, K: Problem> Answer<'s, K> {
    /// The answer with `variant`.
    ///
    /// # Panics
    ///
    /// Fails at compile time if `K::VARIANTS` lists no variant with the type URI and status of
    /// `V`:
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
    pub fn new<V: ProblemVariant + 's>(variant: V) -> Self {
        const {
            assert!(
                contains(K::VARIANTS, &V::TYPE),
                "`K::VARIANTS` should list the variant"
            );
        };

        Self {
            answered: Answered::Variant(Box::new(variant)),
            problem: PhantomData,
        }
    }

    /// The answer for an error that stays internal: `500 Internal Server Error`, without detail.
    ///
    /// # Panics
    ///
    /// Fails at compile time if `K::VARIANTS` does not list
    /// [`Variant::INTERNAL`](crate::Variant::INTERNAL):
    ///
    /// ```compile_fail,E0080
    /// # use std::{borrow::Cow, fmt};
    /// # use http::StatusCode;
    /// use problematic::{Answer, Problem, Variant};
    /// # use problematic::{ProblemType, ProblemVariant};
    /// #
    /// # #[derive(serde::Serialize, schemars::JsonSchema)]
    /// # struct UserNotFound;
    /// #
    /// # impl fmt::Display for UserNotFound {
    /// #     fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
    /// #         formatter.write_str("The user does not exist.")
    /// #     }
    /// # }
    /// #
    /// # impl ProblemVariant for UserNotFound {
    /// #     const TYPE: ProblemType = ProblemType {
    /// #         type_uri: Cow::Borrowed("https://example.com/problems/user-not-found"),
    /// #         title: Cow::Borrowed("User not found"),
    /// #         status: StatusCode::NOT_FOUND,
    /// #     };
    /// # }
    ///
    /// /// The errors a client can receive from `GET /users/{id}`.
    /// struct GetUserProblem;
    ///
    /// impl Problem for GetUserProblem {
    ///     const VARIANTS: &'static [Variant] = &[Variant::of::<UserNotFound>()];
    /// }
    ///
    /// // Fails to compile: `GetUserProblem` does not list `Variant::INTERNAL`.
    /// let answer = Answer::<GetUserProblem>::internal();
    /// ```
    #[must_use]
    pub const fn internal() -> Self {
        const {
            assert!(
                contains(K::VARIANTS, &INTERNAL),
                "`K::VARIANTS` should list the internal error"
            );
        };

        Self {
            answered: Answered::Internal,
            problem: PhantomData,
        }
    }
}

impl<K> Answer<'_, K> {
    /// Whether the error stays internal, answered with [`Answer::internal`].
    #[must_use]
    pub const fn is_internal(&self) -> bool {
        matches!(self.answered, Answered::Internal)
    }

    /// The [`ProblemDetails`] the client receives.
    #[must_use]
    pub fn details(&self) -> ProblemDetails<'_, impl Serialize + '_> {
        match &self.answered {
            Answered::Variant(occurrence) => occurrence.details(),
            Answered::Internal => {
                ProblemDetails::from(INTERNAL).with_extensions(&() as &dyn erased_serde::Serialize)
            }
        }
    }

    /// Adds the response headers of the variant, such as `Retry-After`, to `headers`.
    pub fn headers(&self, headers: &mut HeaderMap) {
        if let Answered::Variant(occurrence) = &self.answered {
            occurrence.headers(headers);
        }
    }
}
