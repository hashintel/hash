use crate::{
    fmt::r#override::{AtomicOverride, AtomicPreference},
    Report,
};

/// The available modes of color support
///
/// Can be accessed through [`crate::fmt::HookContext::color_mode`], and set via
/// [`Report::set_color_mode`]
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub enum ColorMode {
    /// User preference to disable all colors
    // TODO: this is only true once https://github.com/jam1garner/owo-colors/pull/90 is merged
    // If this is the variant is present, [`owo-colors`](https://docs.rs/owo-colors) color
    // support has been temporarily disabled and closures given to
    // [`OwoColorize::if_supports_color`] will not be executed.
    None,

    /// User preference to enable colors
    // TODO: this is only true once https://github.com/jam1garner/owo-colors/pull/90 is merged
    // This will also temporarily set [`owo_colors::set_override`] to enable execution of
    // [`OwoColorize::if_supports_color`].
    Color,

    /// User preference to enable styles, but discourage colors
    ///
    /// This is the same as [`ColorMode::Color`], but signals to the user that while colors are
    /// supported, the user prefers instead the use of emphasis, like bold and italic text.
    Emphasis,
}

impl ColorMode {
    pub(super) fn load() -> Self {
        COLOR_OVERRIDE.load()
    }
}

impl Default for ColorMode {
    #[cfg(feature = "color")]
    fn default() -> Self {
        Self::Emphasis
    }

    #[cfg(not(feature = "color"))]
    fn default() -> Self {
        Self::None
    }
}

/// Value layout:
/// `0x00`: `ColorMode::None`
/// `0x01`: `ColorMode::Color`
/// `0x02`: `ColorMode::Emphasis`
///
/// all others: [`Self::DEFAULT`]
impl AtomicPreference for ColorMode {
    // The default is `ColorMode::Emphasis`, because colors are hard. ANSI colors are not
    // standardized, and some colors may not show at all.
    #[cfg(feature = "color")]
    const DEFAULT: Self = Self::Emphasis;
    #[cfg(not(feature = "color"))]
    const DEFAULT: Self = Self::None;

    fn from_u8(value: u8) -> Self {
        match value {
            0x00 => Self::None,
            0x01 => Self::Color,
            0x02 => Self::Emphasis,
            _ => Self::DEFAULT,
        }
    }

    fn into_u8(self) -> u8 {
        match self {
            Self::None => 0x00,
            Self::Color => 0x01,
            Self::Emphasis => 0x02,
        }
    }
}

static COLOR_OVERRIDE: AtomicOverride<ColorMode> = AtomicOverride::new();

impl Report<()> {
    /// Set the color mode preference
    ///
    /// If the value is [`None`], a previously set preference will be unset, while with [`Some`] a
    /// specific color mode will be set, this mode will be used, otherwise if `detect` is enabled
    /// the capabilities of the terminal are queried through [`owo_colors`].
    ///
    /// The value defaults to [`ColorMode::Emphasis`] (if the terminal supports it), otherwise
    /// [`ColorMode::None`].
    ///
    /// # Example
    ///
    /// ```
    /// # // we only test the snapshot on rust 1.65, therefore report is unused (so is render)
    /// # #![cfg_attr(not(rust_1_65), allow(dead_code, unused_variables, unused_imports))]
    /// use std::io::{Error, ErrorKind};
    /// use owo_colors::OwoColorize;
    ///
    /// use error_stack::{report, Report};
    /// use error_stack::fmt::ColorMode;
    ///
    /// struct Suggestion(&'static str);
    ///
    /// Report::install_debug_hook::<Suggestion>(|Suggestion(value), context| {
    ///     let body = format!("suggestion: {value}");
    ///     match context.color_mode() {
    ///         ColorMode::Color => context.push_body(body.green().to_string()),
    ///         ColorMode::Emphasis => context.push_body(body.italic().to_string()),
    ///         ColorMode::None => context.push_body(body)
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
    /// Report::set_color_mode(ColorMode::None);
    /// println!("{report:?}");
    /// # #[cfg(rust_1_65)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__preference_none.snap")].assert_eq(&render(format!("{report:?}")));
    ///
    /// Report::set_color_mode(ColorMode::Emphasis);
    /// println!("{report:?}");
    /// # #[cfg(rust_1_65)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__preference_emphasis.snap")].assert_eq(&render(format!("{report:?}")));
    ///
    /// Report::set_color_mode(ColorMode::Color);
    /// println!("{report:?}");
    /// # #[cfg(rust_1_65)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__preference_color.snap")].assert_eq(&render(format!("{report:?}")));
    /// ```
    ///
    /// Which will result in something like:
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__preference_none.snap"))]
    /// </pre>
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__preference_emphasis.snap"))]
    /// </pre>
    ///
    /// <pre>
    #[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__preference_color.snap"))]
    /// </pre>
    pub fn set_color_mode(mode: ColorMode) {
        COLOR_OVERRIDE.store(mode);
    }
}
