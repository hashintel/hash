use core::fmt::Write;
#[cfg(all(feature = "std", feature = "pretty-print"))]
use core::sync::atomic::AtomicBool;
#[cfg(feature = "pretty-print")]
use core::sync::atomic::{AtomicU8, Ordering};

#[cfg(all(feature = "std", feature = "pretty-print"))]
use owo_colors::{OwoColorize, Stream};

use crate::Report;

struct VoidWriter;
impl Write for VoidWriter {
    fn write_str(&mut self, _: &str) -> core::fmt::Result {
        Ok(())
    }
}

// TODO: temporary until https://github.com/jam1garner/owo-colors/issues/87 is resolved
#[cfg(all(feature = "pretty-print", feature = "std"))]
fn has_stdout_color_support() -> ColorMode {
    let supported = AtomicBool::new(false);
    let display = "".if_supports_color(Stream::Stdout, |x| {
        supported.store(true, Ordering::Relaxed);
        x
    });
    // this will never fail, because the void writer cannot fail
    // force the if_supports_color to be executed
    core::write!(VoidWriter, "{display}").expect("should be infallible");

    if supported.load(Ordering::Relaxed) {
        ColorMode::Color
    } else {
        ColorMode::None
    }
}

#[cfg(not(all(feature = "pretty-print", feature = "std")))]
const fn has_stdout_color_support() -> ColorMode {
    ColorMode::None
}

#[cfg(feature = "pretty-print")]
pub(crate) struct ColorPreference(AtomicU8);

#[cfg(feature = "pretty-print")]
impl ColorPreference {
    pub(crate) const fn new() -> Self {
        Self(AtomicU8::new(0))
    }

    pub(crate) fn load(&self) -> Option<ColorMode> {
        match self.0.load(Ordering::Relaxed) {
            0 => None,
            1 => Some(ColorMode::None),
            2 => Some(ColorMode::Color),
            3 => Some(ColorMode::Emphasis),
            _ => unreachable!(),
        }
    }

    pub(crate) fn load_derive(&self) -> ColorMode {
        self.load()
            .map_or_else(has_stdout_color_support, |mode| mode)
    }

    pub(crate) fn store(&self, mode: Option<ColorMode>) {
        let mode = match mode {
            None => 0,
            Some(ColorMode::None) => 1,
            Some(ColorMode::Color) => 2,
            Some(ColorMode::Emphasis) => 3,
        };

        self.0.store(mode, Ordering::Relaxed);
    }
}

/// The available modes of color support
///
/// Can be accessed through [`crate::fmt::HookContext::mode`], and set via
/// [`Report::format_color_mode_preference`]
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
// This is for ease of use, if pretty-print is enabled this will be visible
#[allow(unreachable_pub)]
pub enum ColorMode {
    /// User preference to disable all colors
    ///
    /// If this is the variant is present, [`owo-colors`](https://docs.rs/owo-colors) color
    /// support has been temporarily disabled and closures given to
    /// [`OwoColorize::if_supports_color`] will not be executed.
    None,

    /// User preference to enable colors
    ///
    /// This will also temporarily set [`owo_colors::set_override`] to enable execution of
    /// [`OwoColorize::if_supports_color`].
    #[cfg(feature = "pretty-print")]
    Color,

    /// User preference to enable styles, but discourage colors
    ///
    /// This is the same as [`ColorMode::Color`], but signals to the user that while colors are
    /// supported, the user prefers instead the use of emphasis, like bold and italic text.
    #[cfg(feature = "pretty-print")]
    Emphasis,
}

impl ColorMode {
    #[cfg(feature = "pretty-print")]
    pub(super) fn load() -> Self {
        FMT_MODE.load_derive()
    }

    #[cfg(not(feature = "pretty-print"))]
    pub(super) const fn load() -> Self {
        has_stdout_color_support()
    }
}

#[cfg(feature = "pretty-print")]
static FMT_MODE: ColorPreference = ColorPreference::new();

impl Report<()> {
    /// Set the color mode preference
    ///
    /// If the value is [`None`], a previously set preference will be unset, while with [`Some`] a
    /// specific color mode will be set, this mode will be used, if the terminal supports it
    /// (checked through the [`owo-colors`](https://docs.rs/owo-colors) crate)
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
    ///     match context.mode() {
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
    /// Report::format_color_mode_preference(Some(ColorMode::None));
    /// println!("{report:?}");
    /// # #[cfg(rust_1_65)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__preference_none.snap")].assert_eq(&render(format!("{report:?}")));
    ///
    /// Report::format_color_mode_preference(Some(ColorMode::Emphasis));
    /// println!("{report:?}");
    /// # #[cfg(rust_1_65)]
    /// # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/fmt__preference_emphasis.snap")].assert_eq(&render(format!("{report:?}")));
    ///
    /// Report::format_color_mode_preference(Some(ColorMode::Color));
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
    #[cfg(feature = "pretty-print")]
    pub fn format_color_mode_preference(mode: Option<ColorMode>) {
        FMT_MODE.store(mode);
    }
}
