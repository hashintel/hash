use alloc::{string::String, vec, vec::Vec};

use crate::fmt::Emit;

/// Helper for attaching information to a [`Report`].
///
/// When attached to a [`Context`], this will skip searching for attachments in the [`Context`]
/// (using [`Provider`]) and instead use the values provided from this struct instead.
/// This allows for further customization, like easy type dependent overwrites or custom formatting
/// without the reliance on hooks, but still being able to provide primitives.
///
/// # Example
///
/// ```
/// # // we only test the snapshot on nightly, therefore report is unused (so is render)
/// # #![cfg_attr(not(nightly), allow(dead_code, unused_variables, unused_imports))]
/// use std::io::{Error, ErrorKind};
///
/// use error_stack::{fmt::DebugDiagnostic, report};
/// use error_stack::fmt::Emit;
///
/// let report = report!(Error::from(ErrorKind::InvalidInput)) //
///     .attach(DebugDiagnostic::new(vec![Emit::next("Hello!")]));
///
/// # owo_colors::set_override(true);
/// # fn render(value: String) -> String {
/// #     let backtrace = regex::Regex::new(r"Backtrace No\. (\d+)\n(?:  .*\n)*  .*").unwrap();
/// #     let backtrace_info = regex::Regex::new(r"backtrace with (\d+) frames \((\d+)\)").unwrap();
/// #
/// #     let value = backtrace.replace_all(&value, "Backtrace No. $1\n  [redacted]");
/// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace with [n] frames ($2)");
/// #
/// #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
/// # }
/// # #[cfg(nightly)]
/// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__debugdiagnostic.snap")].assert_eq(&render(format!("{report:?}")));
/// #
/// println!("{report:?}");
/// ```
///
/// Which will result in something like:
///
/// <pre>
#[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__debugdiagnostic.snap"))]
/// </pre>
///
/// ```
/// #![cfg(nightly)]
/// #![feature(provide_any, error_generic_member_access)]
///
/// use std::{
///     any::Demand,
///     error::Error,
///     fmt::{Display, Formatter},
/// };
///
/// use error_stack::{
///     fmt::{DebugDiagnostic, Emit},
///     report, Report,
/// };
///
/// #[derive(Debug)]
/// struct UserError {
///     code: usize,
///     reason: String,
/// }
///
/// impl Display for UserError {
///     fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
///         f.write_str("Invalid user input")
///     }
/// }
///
/// impl Error for UserError {
///     fn provide<'a>(&'a self, req: &mut Demand<'a>) {
///         req.provide_ref(&self.code);
///         req.provide_ref(&self.reason);
///         req.provide_value(|| {
///             DebugDiagnostic::next(format!("Error Code: {}", self.code))
///                 .attach_emit(Emit::next(format!("Reason: {}", self.reason)))
///         });
///     }
/// }
///
/// // These will never be called, because `UserError` provides `DebugDiagnostic`, therefore we
/// // do not look for any additional hooks that might be present due to `provide_ref`.
/// // This also means that fallback won't be invoked.
/// Report::install_debug_hook::<usize>(|_, _| Emit::next("usize value"));
/// Report::install_debug_hook::<String>(|_, _| Emit::next("String value"));
///
/// let report = report!(UserError {
///     code: 420,
///     reason: "You pressed `Enter` too many times".to_owned()
/// });
///
/// # owo_colors::set_override(true);
/// # fn render(value: String) -> String {
/// #     let backtrace = regex::Regex::new(r"Backtrace No\. (\d+)\n(?:  .*\n)*  .*").unwrap();
/// #     let backtrace_info = regex::Regex::new(r"backtrace with (\d+) frames \((\d+)\)").unwrap();
/// #
/// #     let value = backtrace.replace_all(&value, "Backtrace No. $1\n  [redacted]");
/// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace with [n] frames ($2)");
/// #
/// #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
/// # }
/// # #[cfg(nightly)]
/// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__debugdiagnostic_context.snap")].assert_eq(&render(format!("{report:?}")));
/// #
/// println!("{report:?}");
/// ```
///
/// Which will result in something like:
///
/// <pre>
#[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__debugdiagnostic_context.snap"))]
/// </pre>
///
/// [`Provider`]: core::any::Provider
/// [`.provide()`]: core::any::Provider::provide
/// [`.attach()`]: crate::Report::attach
/// [`Demand`]: core::any::Demand
/// [`Debug`]: core::fmt::Debug
/// [`Report`]: crate::Report
/// [`Context`]: crate::Context
// TODO: remove experimental flag once specialisation is stabilized or sound
#[cfg(feature = "unstable")]
pub struct DebugDiagnostic {
    output: Vec<Emit>,
    snippets: Vec<String>,
}

#[cfg(feature = "unstable")]
impl DebugDiagnostic {
    /// Create a new [`DebugDiagnostic`]
    #[must_use]
    #[cfg_attr(not(feature = "std"), allow(dead_code))]
    pub fn new(diagnostic: Vec<Emit>) -> Self {
        Self {
            output: diagnostic,
            snippets: vec![],
        }
    }

    /// Attach an additional emit statement to the diagnostic
    #[must_use]
    pub fn attach_emit(mut self, output: Emit) -> Self {
        self.emit.push(output);
        self
    }

    /// Add additional text to the [`DebugDiagnostic`],
    /// this can be chained to create multiple texts entries.
    #[must_use]
    #[cfg_attr(not(feature = "std"), allow(dead_code))]
    pub fn attach_snippet(mut self, snippet: impl Into<String>) -> Self {
        self.snippets.push(snippet.into());
        self
    }

    pub(crate) fn output(&self) -> &[Emit] {
        &self.output
    }

    pub(crate) fn snippets(&self) -> &[String] {
        &self.snippets
    }

    // False-positive
    #[allow(clippy::missing_const_for_fn)]
    pub(crate) fn into_parts(self) -> (Vec<Emit>, Vec<String>) {
        (self.emit, self.snippets)
    }
}
