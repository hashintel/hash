use crate::{
    fmt::r#override::{AtomicOverride, AtomicPreference},
    Report,
};

/// The available supported charsets
///
/// Can be accessed through [`crate::fmt::HookContext::charset`], and set via
/// [`Report::set_charset`].
#[derive(Debug, Copy, Clone, Eq, PartialEq, Hash, Default)]
pub enum Charset {
    /// Terminal of the user supports utf-8
    ///
    /// This is the default if no charset has been explicitly set.
    // we assume that most fonts and terminals nowadays support Utf8, which is why this is
    // the default
    #[default]
    Utf8,

    /// Terminal of the user supports ASCII
    Ascii,
}

impl Charset {
    pub(super) fn load() -> Self {
        CHARSET_OVERRIDE.load()
    }
}

/// Value layout:
/// `0x00`: `Charset::Ascii`
/// `0x01`: `Charset::Utf8`
///
/// all others: default to [`Self::default`]
impl AtomicPreference for Charset {
    fn from_u8(value: u8) -> Self {
        match value {
            0x00 => Self::Ascii,
            0x01 => Self::Utf8,
            _ => Self::default(),
        }
    }

    fn into_u8(self) -> u8 {
        match self {
            Self::Ascii => 0x00,
            Self::Utf8 => 0x01,
        }
    }
}

static CHARSET_OVERRIDE: AtomicOverride<Charset> = AtomicOverride::new();

impl Report<()> {
    /// Set the charset preference
    ///
    /// The value defaults to [`Charset::Utf8`].
    ///
    /// # Example
    ///
    /// ```
    /// # // we only test the snapshot on nightly, therefore report is unused (so is render)
    /// # #![cfg_attr(not(nightly), allow(dead_code, unused_variables, unused_imports))]
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
    /// Report::set_charset(Charset::Utf8);
    /// println!("{report:?}");
    /// # #[cfg(nightly)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__charset_utf8.snap")].assert_eq(&render(format!("{report:?}")));
    ///
    /// Report::set_charset(Charset::Ascii);
    /// println!("{report:?}");
    /// # #[cfg(nightly)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__charset_ascii.snap")].assert_eq(&render(format!("{report:?}")));
    /// ```
    ///
    /// Which will result in something like:
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__charset_utf8.snap"))]
    /// </pre>
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__charset_ascii.snap"))]
    /// </pre>
    pub fn set_charset(charset: Charset) {
        CHARSET_OVERRIDE.store(charset);
    }
}
