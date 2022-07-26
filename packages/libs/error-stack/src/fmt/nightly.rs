use crate::fmt::Line;

/// `nightly` experimental type, which is used during the formatting of [`Debug`] context via the
/// [`Provider`] api.
///
/// # Example
///
/// ```
/// use std::io::{Error, ErrorKind};
///
/// use error_stack::{fmt::DebugDiagnostic, report};
///
/// let report = report!(Error::from(ErrorKind::InvalidInput)) //
///     .attach(DebugDiagnostic::next("Hello!"));
///
/// println!("{:?}", report);
/// ```
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
/// [RFC 1210]: https://github.com/rust-lang/rfcs/pull/1210
/// [#31844]: https://github.com/rust-lang/rust/issues/31844
// TODO: remove experimental flag once specialisation is stabilized or sound or `.attach_provider()`
//  is introduced.
pub struct DebugDiagnostic {
    output: Line,
    text: Vec<String>,
}

impl DebugDiagnostic {
    /// The diagnostic is going to be emitted immediately once encountered in the frame stack.
    pub fn next<T: ToOwned<Owned = String>>(output: T) -> Self {
        Self {
            output: Line::Next(output.to_owned()),
            text: vec![],
        }
    }

    /// The diagnostic is going to be deferred until the end of the group of the current frame
    /// stack.
    pub fn defer<T: ToOwned<Owned = String>>(output: T) -> Self {
        Self {
            output: Line::Defer(output.to_owned()),
            text: vec![],
        }
    }

    /// Add additional text to the [`DebugDiagnostic`],
    /// this can be chained to create multiple texts entries.
    ///
    /// Text is only emitted at the end of extended [`Debug`] (`:#?`)
    pub fn and_text(mut self, text: String) -> Self {
        self.text.push(text);
        self
    }

    pub(crate) fn output(&self) -> &Line {
        &self.output
    }

    pub(crate) fn text(&self) -> &[String] {
        &self.text
    }
}
