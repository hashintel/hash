//! Public problem details attached to [`Report`] values.

use alloc::boxed::Box;

use error_stack::{IntoReport, Report};
use serde_core::Serialize;

use crate::{Problem, ProblemDetails};

/// Attaches and retrieves public problems independently of a report's current context.
pub trait ReportExt: Sized {
    /// Attaches the problem to expose to the client.
    ///
    /// The attachment survives [`Report::change_context`]. Attaching another problem replaces the
    /// complete public representation returned by [`Self::problem_details`]; earlier problems
    /// remain in the report's frames.
    ///
    /// The report owns the problem. Its details can borrow from it and are serialized only when the
    /// returned [`ProblemDetails`] is serialized.
    ///
    /// # Examples
    ///
    /// ```
    /// use std::{borrow::Cow, fmt, io};
    ///
    /// use error_stack::Report;
    /// use problematic::{ProblemType, StatusCode, error_stack::ReportExt as _};
    ///
    /// const INVALID_PARAMETER: ProblemType = ProblemType {
    ///     type_uri: Cow::Borrowed("https://example.com/problems/invalid-parameter"),
    ///     title: Cow::Borrowed("Invalid parameter"),
    ///     status: StatusCode::BAD_REQUEST,
    /// };
    ///
    /// let report = Report::new(fmt::Error)
    ///     .attach_problem(INVALID_PARAMETER.detail("The limit must be positive."))
    ///     .change_context(io::Error::other("request failed"));
    /// let details = report
    ///     .problem_details()
    ///     .expect("the problem should be attached");
    ///
    /// assert_eq!(details.status, 400);
    /// assert_eq!(
    ///     details.detail.as_deref(),
    ///     Some("The limit must be positive.")
    /// );
    /// ```
    #[must_use]
    fn attach_problem<P>(self, problem: P) -> Self
    where
        P: Problem + Send + Sync + 'static,
        for<'a> P::Extensions<'a>: Serialize;

    /// Returns the attached problem's details, or [`None`] if no problem was attached.
    ///
    /// Selects the first problem in [`Report::frames`] order. For a single chain of contexts, this
    /// is the most recently attached problem. For reports combined with [`Report::append`], the
    /// frame traversal order determines which branch supplies the problem.
    ///
    /// The details borrow from the report. Extension validation runs when they are serialized and
    /// returns a serializer error for invalid extensions.
    #[must_use]
    fn problem_details(&self) -> Option<ProblemDetails<'_, impl Serialize + '_>>;
}

impl<C: ?Sized> ReportExt for Report<C> {
    #[track_caller]
    fn attach_problem<P>(self, problem: P) -> Self
    where
        P: Problem + Send + Sync + 'static,
        for<'a> P::Extensions<'a>: Serialize,
    {
        self.attach_opaque(AttachedProblem(Box::new(problem)))
    }

    fn problem_details(&self) -> Option<ProblemDetails<'_, impl Serialize + '_>> {
        self.downcast_ref::<AttachedProblem>()
            .map(|problem| problem.0.details())
    }
}

/// Attaches public problems to the error variant of a [`Result`].
pub trait ResultExt: Sized {
    /// The context type of the resulting [`Report`].
    type Context: ?Sized;

    /// The successful value carried by the result.
    type Ok;

    /// Attaches `problem` to the error, converting it to a [`Report`] if needed.
    ///
    /// Uses [`ReportExt::attach_problem`] for errors and preserves successful values.
    ///
    /// # Errors
    ///
    /// Returns the original error as a [`Report`] with the problem attached.
    #[track_caller]
    fn attach_problem<P>(self, problem: P) -> Result<Self::Ok, Report<Self::Context>>
    where
        P: Problem + Send + Sync + 'static,
        for<'a> P::Extensions<'a>: Serialize,
    {
        self.attach_problem_with(|| problem)
    }

    /// Creates and attaches a problem only when the result is [`Err`].
    ///
    /// Calls `problem` once on error, then uses [`ReportExt::attach_problem`]. On [`Ok`], the
    /// closure is dropped without being called.
    ///
    /// # Errors
    ///
    /// Returns the original error as a [`Report`] with the created problem attached.
    ///
    /// # Examples
    ///
    /// ```
    /// use std::borrow::Cow;
    ///
    /// use problematic::{
    ///     ProblemType, StatusCode,
    ///     error_stack::{ReportExt as _, ResultExt as _},
    /// };
    ///
    /// const INVALID_PARAMETER: ProblemType = ProblemType {
    ///     type_uri: Cow::Borrowed("https://example.com/problems/invalid-parameter"),
    ///     title: Cow::Borrowed("Invalid parameter"),
    ///     status: StatusCode::BAD_REQUEST,
    /// };
    ///
    /// let input = "zero";
    /// let result = input.parse::<u64>().attach_problem_with(|| {
    ///     INVALID_PARAMETER.detail(format!("The limit `{input}` is not an integer."))
    /// });
    /// let report = result.expect_err("the input should fail to parse");
    /// let details = report
    ///     .problem_details()
    ///     .expect("the problem should be attached");
    ///
    /// assert_eq!(
    ///     details.detail.as_deref(),
    ///     Some("The limit `zero` is not an integer.")
    /// );
    /// ```
    #[track_caller]
    fn attach_problem_with<P, F>(self, problem: F) -> Result<Self::Ok, Report<Self::Context>>
    where
        P: Problem + Send + Sync + 'static,
        for<'a> P::Extensions<'a>: Serialize,
        F: FnOnce() -> P;
}

impl<T, E: IntoReport> ResultExt for Result<T, E> {
    type Context = E::Context;
    type Ok = T;

    fn attach_problem_with<P, F>(self, problem: F) -> Result<T, Report<E::Context>>
    where
        P: Problem + Send + Sync + 'static,
        for<'a> P::Extensions<'a>: Serialize,
        F: FnOnce() -> P,
    {
        match self {
            Ok(value) => Ok(value),
            Err(error) => Err(error.into_report().attach_problem(problem())),
        }
    }
}

struct AttachedProblem(Box<dyn ErasedProblem + Send + Sync>);

trait ErasedProblem {
    fn details(&self) -> ProblemDetails<'_, Box<dyn erased_serde::Serialize + '_>>;
}

impl<P> ErasedProblem for P
where
    P: Problem + 'static,
    for<'a> P::Extensions<'a>: Serialize,
{
    fn details(&self) -> ProblemDetails<'_, Box<dyn erased_serde::Serialize + '_>> {
        let ProblemDetails {
            type_uri,
            title,
            status,
            detail,
            instance,
            extensions,
        } = Problem::details(self);

        ProblemDetails {
            type_uri,
            title,
            status,
            detail,
            instance,
            extensions: Box::new(extensions),
        }
    }
}
