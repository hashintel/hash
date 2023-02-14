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
#![cfg_attr(nightly, feature(const_trait_impl))]
#![cfg_attr(
    not(miri),
    doc(test(attr(deny(warnings, clippy::pedantic, clippy::nursery))))
)]
// future PR will add remaining documentation
#![allow(missing_docs)]

pub use color::{BasicColor, BrightColor, Color, IndexedColor, RgbColor};
pub use font::{Blinking, Font, FontFamily, FontWeight, Underline};

mod color;
mod font;
mod macros;

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct Foreground(Color);

impl Foreground {
    #[must_use]
    pub const fn new(color: Color) -> Self {
        Self(color)
    }
}

#[cfg(nightly)]
impl<T> const From<T> for Foreground
where
    T: ~const Into<Color>,
{
    fn from(value: T) -> Self {
        Self(value.into())
    }
}

#[cfg(not(nightly))]
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
}

#[cfg(nightly)]
impl<T> const From<T> for Background
where
    T: ~const Into<Color>,
{
    fn from(value: T) -> Self {
        Self(value.into())
    }
}

#[cfg(not(nightly))]
impl<T> From<T> for Background
where
    T: Into<Color>,
{
    fn from(value: T) -> Self {
        Self(value.into())
    }
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, Default)]
pub struct Style {
    font: Font,

    foreground: Option<Foreground>,
    background: Option<Background>,
}

impl Style {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            font: Font::new(),
            foreground: None,
            background: None,
        }
    }

    #[must_use]
    pub const fn with_font(mut self, font: Font) -> Self {
        self.font = font;

        self
    }

    pub fn set_font(&mut self, font: Font) -> &mut Self {
        self.font = font;

        self
    }

    #[must_use]
    #[cfg(nightly)]
    pub const fn with_foreground(mut self, color: impl ~const Into<Foreground>) -> Self {
        self.foreground = Some(color.into());

        self
    }

    #[must_use]
    #[cfg(not(nightly))]
    pub const fn with_foreground(mut self, color: Foreground) -> Self {
        self.foreground = Some(color.into());

        self
    }

    pub fn set_foreground(&mut self, color: impl Into<Foreground>) -> &mut Self {
        self.foreground = Some(color.into());

        self
    }

    #[must_use]
    #[cfg(nightly)]
    pub const fn with_background(mut self, color: impl ~const Into<Background>) -> Self {
        self.background = Some(color.into());

        self
    }

    #[must_use]
    #[cfg(not(nightly))]
    pub const fn with_background(mut self, color: Background) -> Self {
        self.background = Some(color.into());

        self
    }

    pub fn set_background(&mut self, color: impl Into<Background>) -> &mut Self {
        self.background = Some(color.into());

        self
    }

    #[must_use]
    pub const fn font(&self) -> Font {
        self.font
    }

    pub fn font_mut(&mut self) -> &mut Font {
        &mut self.font
    }

    #[must_use]
    pub const fn foreground(&self) -> Option<Color> {
        if let Some(Foreground(color)) = self.foreground {
            Some(color)
        } else {
            None
        }
    }

    #[must_use]
    pub const fn background(&self) -> Option<Color> {
        if let Some(Background(color)) = self.background {
            Some(color)
        } else {
            None
        }
    }
}
