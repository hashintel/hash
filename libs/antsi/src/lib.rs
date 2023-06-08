//! # Overview
//!
//! `antsi` is a no-std mini-crate that provides support for **S**elect **G**raphic **R**endition
//! codes (better known as ANSI escape sequences) and most common extensions.
//!
//! The name is a play on words and encapsulates the three goals of the crate:
//!
//! - ant: small, productive and extremely useful (🐜)
//! - ansi: implementation of ANSI escape sequences
//! - antsy: restless as in fast, with near to no overhead (🏎️💨)
//!
//! The crate tries to be as correct as possible, acting both as a library and as an up-to-date
//! reference guide regarding terminal support and related specifications (correct as of the time of
//! publication).

// Good reference to begin with: https://gist.github.com/fnky/458719343aabd01cfb17a3a4f7296797
#![no_std]
#![cfg_attr(all(doc, nightly), feature(doc_auto_cfg))]
#![cfg_attr(
    not(miri),
    doc(test(attr(deny(warnings, clippy::pedantic, clippy::nursery))))
)]
// future PR will add remaining documentation
#![allow(missing_docs)]

#[cfg(feature = "rgba")]
pub use color::RgbaColor;
pub use color::{
    BasicColor, BrightColor, CmyColor, CmykColor, Color, IndexedColor, RgbColor, TransparentColor,
};
pub use decorations::{Decorations, Frame};
#[cfg(feature = "script")]
pub use font::FontScript;
pub use font::{Blinking, Font, FontFamily, FontWeight, Underline};

mod color;
mod decorations;
mod font;

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct Foreground(Color);

impl Foreground {
    #[must_use]
    pub const fn new(color: Color) -> Self {
        Self(color)
    }

    #[must_use]
    pub const fn color(self) -> Color {
        self.0
    }
}

impl<T> From<T> for Foreground
where
    T: Into<Color>,
{
    fn from(value: T) -> Self {
        Self(value.into())
    }
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct Background(Color);

impl Background {
    #[must_use]
    pub const fn new(color: Color) -> Self {
        Self(color)
    }

    #[must_use]
    pub const fn color(self) -> Color {
        self.0
    }
}

impl<T> From<T> for Background
where
    T: Into<Color>,
{
    fn from(value: T) -> Self {
        Self(value.into())
    }
}

// kitty + vte extension
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
#[cfg(feature = "underline-color")]
pub struct UnderlineColor(Color);

#[cfg(feature = "underline-color")]
impl UnderlineColor {
    #[must_use]
    pub const fn new(color: Color) -> Self {
        Self(color)
    }

    #[must_use]
    pub const fn color(self) -> Color {
        self.0
    }
}

#[cfg(feature = "underline-color")]
impl<T> From<T> for UnderlineColor
where
    T: Into<Color>,
{
    fn from(value: T) -> Self {
        Self(value.into())
    }
}

/// Enables the use of styles on target text
///
/// Enables the use of all **S**elect **G**raphic **M**ode escaped initially defined by [`ISO 6429`]
/// as well as:
///
/// * [ISO 6429]
/// * [ISO 8613-6] ([`RgbColor`], [`CmyColor`], [`CmykColor`])
/// * [aixterm extension] ([`BrightColor`])
/// * [wezterm extension] ([`RgbaColor`])
/// * [kitty + vte extension] ([`UnderlineColor`], extra [`Underline`] styles)
/// * [mintty extension] ([`Font`] over-strike, sub-/super- script)
///
/// Due to their ambiguity, not being implemented in any terminal and collisions in some terminals,
/// the escape codes 60 - 69 from [ISO 6429] have **not** been included.
///
/// [ISO 6429]: https://www.iso.org/standard/12782.html
/// [ISO 8613-6]: https://www.iso.org/standard/22943.html
/// [aixterm extension]: https://www.ibm.com/docs/en/aix/7.2?topic=aixterm-command
/// [wezterm extension]: https://wezfurlong.org/wezterm/escape-sequences.html
/// [kitty + vte extension]: https://sw.kovidgoyal.net/kitty/underlines/
/// [mintty extension]: https://github.com/mintty/mintty/wiki/CtrlSeqs
#[derive(Debug, Copy, Clone, Eq, PartialEq, Default)]
#[non_exhaustive]
pub struct Style {
    pub font: Font,

    pub decorations: Decorations,

    pub foreground: Option<Foreground>,
    pub background: Option<Background>,

    #[cfg(feature = "underline-color")]
    pub underline_color: Option<UnderlineColor>,
}

impl Style {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            font: Font::new(),
            decorations: Decorations::new(),
            foreground: None,
            background: None,
            #[cfg(feature = "underline-color")]
            underline_color: None,
        }
    }

    #[cfg(feature = "underline-color")]
    #[must_use]
    pub const fn with_underline_color(mut self, color: UnderlineColor) -> Self {
        self.underline_color = Some(color);

        self
    }

    #[must_use]
    pub const fn with_background(mut self, color: Background) -> Self {
        self.background = Some(color);

        self
    }

    #[must_use]
    pub const fn with_foreground(mut self, color: Foreground) -> Self {
        self.foreground = Some(color);

        self
    }

    #[must_use]
    pub const fn with_font(mut self, font: Font) -> Self {
        self.font = font;

        self
    }
}
