use core::{
    fmt,
    fmt::{Display, Formatter},
};

use crate::{
    fmt::r#override::{AtomicOverride, AtomicPreference},
    Report,
};

/// The available modes of color support
///
/// Can be accessed through [`crate::fmt::HookContext::color_mode`], and set via
/// [`Report::set_color_mode`]
#[derive(Debug, Copy, Clone, Eq, PartialEq, Hash, Default)]
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
    // The default is `ColorMode::Emphasis`, because colors are hard. ANSI colors are not
    // standardized, and some colors may not show at all.
    #[default]
    Emphasis,
}

impl ColorMode {
    pub(super) fn load() -> Self {
        COLOR_OVERRIDE.load()
    }
}

/// Value layout:
/// `0x00`: `ColorMode::None`
/// `0x01`: `ColorMode::Color`
/// `0x02`: `ColorMode::Emphasis`
///
/// all others: [`Self::default`]
impl AtomicPreference for ColorMode {
    fn from_u8(value: u8) -> Self {
        match value {
            0x00 => Self::None,
            0x01 => Self::Color,
            0x02 => Self::Emphasis,
            _ => Self::default(),
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

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Color {
    Black,
    Red,
    Green,
    Yellow,
    Blue,
    Magenta,
    Cyan,
    White,
}

impl Color {
    const fn digit(self) -> u8 {
        match self {
            Self::Black => b'0',
            Self::Red => b'1',
            Self::Green => b'2',
            Self::Yellow => b'3',
            Self::Blue => b'4',
            Self::Magenta => b'5',
            Self::Cyan => b'6',
            Self::White => b'7',
        }
    }
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub struct Foreground {
    color: Color,
    bright: bool,
}

impl Foreground {
    fn start_ansi(self, sequence: &mut ControlSequence) -> fmt::Result {
        let Self { color, bright } = self;

        let buffer = &[if bright { b'9' } else { b'3' }, color.digit()];
        // This should never fail because both are valid ASCII
        let control = core::str::from_utf8(buffer).unwrap();

        sequence.push_control(control)
    }

    fn end_ansi(sequence: &mut ControlSequence) -> fmt::Result {
        sequence.push_control("39")
    }
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub struct Background {
    color: Color,
    bright: bool,
}

impl Background {
    fn start_ansi(self, sequence: &mut ControlSequence) -> fmt::Result {
        let Self { color, bright } = self;
        let mut buffer = [0u8; 3];

        let length = if bright {
            buffer[0] = b'1';
            buffer[1] = b'0';
            buffer[2] = color.digit();

            3
        } else {
            buffer[0] = b'4';
            buffer[1] = color.digit();

            2
        };

        // This should never fail because both are valid ASCII
        let control = core::str::from_utf8(&buffer[..length]).unwrap();

        sequence.push_control(control)
    }

    fn end_ansi(sequence: &mut ControlSequence) -> fmt::Result {
        sequence.push_control("49")
    }
}

struct ControlSequence<'a, 'b> {
    fmt: &'a mut Formatter<'b>,
    empty: bool,
}

impl<'a, 'b> ControlSequence<'a, 'b> {
    fn new(fmt: &'a mut Formatter<'b>) -> Self {
        Self { fmt, empty: true }
    }

    fn finish(self) -> Result<&'a mut Formatter<'b>, fmt::Error> {
        if !self.empty {
            // we wrote a specific formatting character, therefore we need to end
            self.fmt.write_str("m")?;
        }

        Ok(self.fmt)
    }
}

impl ControlSequence<'_, '_> {
    fn push_control(&mut self, control: &str) -> fmt::Result {
        if self.empty {
            self.fmt.write_str("\u{1b}[")?;
        } else {
            self.fmt.write_str(";")?;
        }

        self.fmt.write_str(control)?;
        self.empty = false;

        Ok(())
    }
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
struct DisplayStyle {
    bold: bool,
    faint: bool,
    italic: bool,
    underline: bool,
    blink: bool,
    strikethrough: bool,
}

impl DisplayStyle {
    fn start_ansi(self, sequence: &mut ControlSequence) -> fmt::Result {
        if self.bold {
            sequence.push_control("1")?;
        }

        if self.faint {
            sequence.push_control("2")?;
        }

        if self.italic {
            sequence.push_control("3")?;
        }

        if self.underline {
            sequence.push_control("4")?;
        }

        if self.blink {
            sequence.push_control("5")?;
        }

        if self.strikethrough {
            sequence.push_control("9")?;
        }

        Ok(())
    }

    fn end_ansi(self, sequence: &mut ControlSequence) -> fmt::Result {
        if self.bold {
            sequence.push_control("21")?;
        }

        if self.faint {
            sequence.push_control("22")?;
        }

        if self.italic {
            sequence.push_control("23")?;
        }

        if self.underline {
            sequence.push_control("24")?;
        }

        if self.blink {
            sequence.push_control("25")?;
        }

        if self.strikethrough {
            sequence.push_control("29")?;
        }

        Ok(())
    }
}

struct Style {
    display: Option<DisplayStyle>,
    foreground: Option<Foreground>,
    background: Option<Background>,
}

struct StyleDisplay<'a, T: Display> {
    style: Style,
    value: &'a T,
}

impl<'a, T: Display> Display for StyleDisplay<'a, T> {
    fn fmt(&self, mut f: &mut Formatter<'_>) -> fmt::Result {
        let mut sequence = ControlSequence::new(f);

        if let Some(display) = self.style.display {
            display.start_ansi(&mut sequence)?;
        }

        if let Some(foreground) = self.style.foreground {
            foreground.start_ansi(&mut sequence)?;
        }

        if let Some(background) = self.style.background {
            background.start_ansi(&mut sequence)?;
        }

        f = sequence.finish()?;

        Display::fmt(&self.value, f)?;

        let mut sequence = ControlSequence::new(f);

        if let Some(display) = self.style.display {
            display.end_ansi(&mut sequence)?;
        }

        if self.style.foreground.is_some() {
            Foreground::end_ansi(&mut sequence)?;
        }

        if self.style.background.is_some() {
            Background::end_ansi(&mut sequence)?;
        }

        f = sequence.finish()?;

        Ok(())
    }
}
