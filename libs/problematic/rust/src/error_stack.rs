//! Public problem details from [`Report`] contexts and attachments.

use alloc::boxed::Box;
use core::error::Request;

use error_stack::{AttachmentKind, FrameKind, IntoReport, Report};
use serde_core::Serialize;

use crate::{Problem, ProblemDetails};

/// Provides a problem by reference from an [`Error::provide`] implementation.
///
/// The report borrows the problem from the error when [`ReportExt::problem_details`] is iterated.
/// Its extensions are serialized when the returned [`ProblemDetails`] is serialized.
///
/// # Examples
///
/// ```
/// #![feature(error_generic_member_access)]
/// use core::{
///     error::{Error, Request},
///     fmt,
/// };
/// use std::borrow::Cow;
///
/// use error_stack::Report;
/// use problematic::{
///     NoExtensions, Problem, ProblemDetails, ProblemType, StatusCode,
///     error_stack::{ReportExt as _, provide_problem},
/// };
///
/// const INVALID_LIMIT: ProblemType = ProblemType {
///     type_uri: Cow::Borrowed("https://example.com/problems/invalid-limit"),
///     title: Cow::Borrowed("Invalid limit"),
///     status: StatusCode::BAD_REQUEST,
/// };
///
/// #[derive(Debug)]
/// struct InvalidLimit;
///
/// impl fmt::Display for InvalidLimit {
///     fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
///         formatter.write_str("the limit must be positive")
///     }
/// }
///
/// impl Problem for InvalidLimit {
///     type Extensions<'a> = NoExtensions;
///
///     fn details(&self) -> ProblemDetails<'_> {
///         INVALID_LIMIT.detail("The limit must be positive.")
///     }
/// }
///
/// impl Error for InvalidLimit {
///     fn provide<'a>(&'a self, request: &mut Request<'a>) {
///         provide_problem(self, request);
///     }
/// }
///
/// let report = Report::new(InvalidLimit).change_context(std::io::Error::other("request failed"));
/// let details = report
///     .problem_details()
///     .next()
///     .expect("the error should provide a problem");
/// assert_eq!(details.status, 400);
/// ```
///
/// [`Error::provide`]: core::error::Error::provide
pub fn provide_problem<'p, P>(problem: &'p P, request: &mut Request<'p>)
where
    P: Problem + Send + Sync + 'static,
    for<'ext> P::Extensions<'ext>: Serialize,
{
    request.provide_ref::<dyn ErasedProblem + Send + Sync>(problem);
}

/// Attaches and retrieves public problems independently of a report's current context.
pub trait ReportExt: Sized {
    /// Attaches the problem to expose to the client.
    ///
    /// The attachment survives [`Report::change_context`]. [`Self::problem_details`] yields it in
    /// frame order alongside problems provided by contexts and other attachments.
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
    ///     .next()
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
        for<'ext> P::Extensions<'ext>: Serialize;

    /// Iterates over public problems in [`Report::frames`] order.
    ///
    /// Includes problems attached with [`Self::attach_problem`] and offered by contexts through
    /// [`provide_problem`]. A single chain yields the newest problem first. Combined reports
    /// follow the frame traversal order across their branches.
    ///
    /// Each problem's details are created as the iterator advances and can borrow from the report.
    /// Extension validation runs during serialization and returns a serializer error for invalid
    /// extensions.
    fn problem_details(&self)
    -> impl Iterator<Item = ProblemDetails<'_, impl Serialize + '_>> + '_;
}

impl<C: ?Sized> ReportExt for Report<C> {
    #[track_caller]
    fn attach_problem<P>(self, problem: P) -> Self
    where
        P: Problem + Send + Sync + 'static,
        for<'ext> P::Extensions<'ext>: Serialize,
    {
        self.attach_opaque(AttachedProblem(Box::new(problem)))
    }

    fn problem_details(
        &self,
    ) -> impl Iterator<Item = ProblemDetails<'_, impl Serialize + '_>> + '_ {
        self.frames().filter_map(|frame| match frame.kind() {
            FrameKind::Context(_) => Some(
                frame
                    .request_ref::<dyn ErasedProblem + Send + Sync>()?
                    .details(),
            ),
            FrameKind::Attachment(AttachmentKind::Opaque(_)) => Some(
                frame
                    .downcast_ref::<AttachedProblem>()?
                    .0
                    .as_ref()
                    .details(),
            ),
            FrameKind::Attachment(_) => None,
        })
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
        for<'ext> P::Extensions<'ext>: Serialize,
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
    ///     .next()
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
        for<'ext> P::Extensions<'ext>: Serialize,
        F: FnOnce() -> P;
}

impl<T, E: IntoReport> ResultExt for Result<T, E> {
    type Context = E::Context;
    type Ok = T;

    fn attach_problem_with<P, F>(self, problem: F) -> Result<T, Report<E::Context>>
    where
        P: Problem + Send + Sync + 'static,
        for<'ext> P::Extensions<'ext>: Serialize,
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
    for<'ext> P::Extensions<'ext>: Serialize,
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
