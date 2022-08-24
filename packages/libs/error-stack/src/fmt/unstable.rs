use alloc::{string::String, vec, vec::Vec};

use crate::fmt::Emit;

/// Helper for attaching information to a [`Report`].
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
/// # Implementation Notes
///
/// This is currently very limited as items attached via [`.attach()`]
/// only provide themselves as [`Demand`], but do not propagate [`.provide()`] to the attachment
/// itself.
/// This is due to limitations of Rust, as specialization is currently very unstable and partially
/// unsound.
///
/// > For the current status regarding specialization refer to the tracking issue for [RFC 1210]
/// > [#31844]
///
/// [`Provider`]: core::any::Provider
/// [`.provide()`]: core::any::Provider::provide
/// [`.attach()`]: crate::Report::attach
/// [`Demand`]: core::any::Demand
/// [`Debug`]: core::fmt::Debug
/// [`Report`]: crate::Report
/// [RFC 1210]: https://github.com/rust-lang/rfcs/pull/1210
/// [#31844]: https://github.com/rust-lang/rust/issues/31844
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
}
