#![no_std]
#![cfg_attr(
    nightly,
    feature(provide_any, error_in_core, error_generic_member_access)
)]
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
#![allow(missing_docs)]
#![cfg_attr(
    not(miri),
    doc(test(attr(deny(warnings, clippy::pedantic, clippy::nursery))))
)]

/// Basic colors variants
///
/// ## Support
///
/// Terminals that implement ANSI escape sequences, e.g. the target for the crate, are guaranteed to
/// implement at least these colors.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
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

/// Bright color variants
///
/// ## History
///
/// Nowadays every terminal emulator supports these colors. To programmatically check for
/// support it is advised to use a crate similar to [`supports-color`](https://lib.rs/crates/supports-color)
///
/// ## Support
///
/// Support for bright colors was not part of [ISO/IEC 6429](https://www.iso.org/standard/12782.html)
/// the specification, which introduced and standardized ANSI escape sequences.
/// [aixterm specification](https://sites.ualberta.ca/dept/chemeng/AIX-43/share/man/info/C/a_doc_lib/cmds/aixcmds1/aixterm.htm)
/// introduced these additional escape sequences, terminal (-emulators) began to implement them.
/// It is pretty save to say that every terminal (-emulators) created after 1997 has support for
/// these sequences.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct Bright(Color);

/// Extended color support
///
/// 0 - 7 correspond to the [`Color`] variants, while 8 - 15 correspond to their [`Bright`]
/// counterpart.
///
/// ## Support
///
/// Nowadays every modern terminal emulator supports xterm colors, this can be easily checked by
/// executing `echo $TERM`, if the name is prefixed with `xterm-` the terminal is likely able to
/// support this color-scheme, the dedicated crate [`supports-color`](https://lib.rs/crates/supports-color)
/// can be used to detect this (and many other) indicators for xterm color scheme support.
///
/// ## History
///
/// The name xterm color comes from the xterm terminal, the standard terminal emulator that is
/// shipped with the [X Window System]. Since 1999, support for a new (unstandardized) color mode
/// was added that brought 256 colors, instead of the previously available 16 colors to the
/// terminal.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct XTerm(u8);

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct Truecolor {
    r: u8,
    g: u8,
    b: u8,
}

// TODO: Default

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub enum Ansi {
    Color(Color),
    Bright(Bright),
    XTerm(XTerm),
    Truecolor(Truecolor),
}

pub enum FontWeight {
    Bold,
    Faint,
}

pub enum FontFamily {
    Primary,
    Fraktur,
    Alternative(u8),
}

pub struct Font {
    weight: FontWeight,

    // Value layout: `XXIU_BRHS`
    //
    // * `I`: `italic`
    // * `U`: `underline`
    // * `B`: `blinking`
    // * `R`: `inverse/reverse`
    // * `H`: `hidden/invisible`
    // * `S`: `strikethrough`
    style: u8,

    family: FontFamily,
}

pub struct Style {}
