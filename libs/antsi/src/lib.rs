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
#![warn(
    missing_docs,
    unreachable_pub,
    clippy::pedantic,
    clippy::nursery,
    clippy::undocumented_unsafe_blocks,
    clippy::dbg_macro,
    clippy::print_stdout,
    clippy::print_stderr,
    clippy::alloc_instead_of_core,
    clippy::std_instead_of_alloc,
    clippy::std_instead_of_core,
    clippy::if_then_some_else_none
)]
#![allow(clippy::redundant_pub_crate)] // This would otherwise clash with `unreachable_pub`
#![allow(clippy::module_name_repetitions)]
#![cfg_attr(
    not(miri),
    doc(test(attr(deny(warnings, clippy::pedantic, clippy::nursery))))
)]

pub use color::{BasicColor, BrightColor, Color, IndexedColor, RgbColor};
pub use font::{Blinking, Font, FontFamily, FontWeight, Underline};

mod color;
mod font;

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) struct Foreground(Color);

impl Foreground {
    #[must_use]
    const fn new(color: Color) -> Self {
        Self(color)
    }
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) struct Background(Color);

impl Background {
    const fn new(color: Color) -> Self {
        Self(color)
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
    pub const fn with_foreground(mut self, color: Color) -> Self {
        self.foreground = Some(Foreground::new(color));

        self
    }

    pub fn set_foreground(&mut self, color: Color) -> &mut Self {
        self.foreground = Some(Foreground::new(color));

        self
    }

    #[must_use]
    pub const fn with_background(mut self, color: Color) -> Self {
        self.background = Some(Background::new(color));

        self
    }

    pub fn set_background(&mut self, color: Color) -> &mut Self {
        self.background = Some(Background::new(color));

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
