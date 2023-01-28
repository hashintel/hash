use core::sync::atomic::{AtomicU8, Ordering};

use crate::Report;

/// The available supported charsets
///
/// Can be accessed through [`crate::fmt::HookContext::charset`], and set via
/// [`Report::set_charset`].
#[derive(Debug, Copy, Clone)]
pub enum Charset {
    /// Terminal of the user supports utf-8
    ///
    /// This is the default if no charset has been explicitly set and the `detect` was not enabled.
    Utf8,

    /// Terminal of the user supports ASCII
    ///
    /// This needs to be set explicitly if the `detect` feature is not enabled, otherwise
    /// `error-stack` tries to determine the support via the [`supports_unicode`] crate.
    Ascii,
}

impl Charset {
    pub(super) fn load() -> Self {
        if let Some(charset) = CHARSET_OVERRIDE.load() {
            charset
        } else {
            // we assume that most fonts and terminals nowadays support Utf8, which is why this is
            // the default
            Charset::Utf8
        }
    }
}

/// Value layout:
/// `0x00`: `Charset::Ascii`
/// `0x01`: `Charset::Utf8`
///
/// all others: unset/none
struct AtomicOverride(AtomicU8);

impl AtomicOverride {
    const fn new() -> Self {
        Self(AtomicU8::new(0xFF))
    }

    fn store(&self, value: Option<Charset>) {
        let inner = match value {
            None => 0xFF,
            Some(Charset::Ascii) => 0x00,
            Some(Charset::Utf8) => 0x01,
        };

        self.0.store(inner, Ordering::Relaxed);
    }

    fn load(&self) -> Option<Charset> {
        let inner = self.0.load(Ordering::Relaxed);

        match inner {
            0x00 => Some(Charset::Ascii),
            0x01 => Some(Charset::Utf8),
            _ => None,
        }
    }
}

static CHARSET_OVERRIDE: AtomicOverride = AtomicOverride::new();

impl Report<()> {
    /// Set the charset preference
    ///
    /// If the value is [`None`], a previously set preference will be unset, while with [`Some`] a
    /// specific charset will be set. If `detect` is enabled, and no charset has been explicitly
    /// set, the capabilities of the terminal are queried through [`supports_unicode`] to
    /// determine if [`Charset::Utf8`] is supported.
    ///
    /// The value defaults to [`Charset::Utf8`] if the `detect` feature is **not** enabled.
    ///
    /// # Example
    ///
    /// ```
    /// # // we only test the snapshot on rust 1.65, therefore report is unused (so is render)
    /// # #![cfg_attr(not(rust_1_65), allow(dead_code, unused_variables, unused_imports))]
    /// use std::io::{Error, ErrorKind};
    ///
    /// use error_stack::{report, Report};
    /// use error_stack::fmt::{Charset};
    ///
    /// struct Suggestion(&'static str);
    ///
    /// Report::install_debug_hook::<Suggestion>(|Suggestion(value), context| {
    ///     match context.charset() {
    ///         Charset::Utf8 => context.push_body(format!("📝 {value}")),
    ///         Charset::Ascii => context.push_body(format!("suggestion: {value}"))
    ///     };
    /// });
    ///
    /// let report =
    ///     report!(Error::from(ErrorKind::InvalidInput)).attach(Suggestion("oh no, try again"));
    ///
    /// # fn render(value: String) -> String {
    /// #     let backtrace = regex::Regex::new(r"backtrace no\. (\d+)\n(?:  .*\n)*  .*").unwrap();
    /// #     let backtrace_info = regex::Regex::new(r"backtrace( with (\d+) frames)? \((\d+)\)").unwrap();
    /// #
    /// #     let value = backtrace.replace_all(&value, "backtrace no. $1\n  [redacted]");
    /// #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace ($3)");
    /// #
    /// #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
    /// # }
    /// #
    /// Report::set_charset(Some(Charset::Utf8));
    /// println!("{report:?}");
    /// # #[cfg(rust_1_65)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__charset_utf8.snap")].assert_eq(&render(format!("{report:?}")));
    ///
    /// Report::set_charset(Some(Charset::Ascii));
    /// println!("{report:?}");
    /// # #[cfg(rust_1_65)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__charset_ascii.snap")].assert_eq(&render(format!("{report:?}")));
    /// ```
    pub fn set_charset(charset: Option<Charset>) {
        CHARSET_OVERRIDE.store(charset);
    }
}
