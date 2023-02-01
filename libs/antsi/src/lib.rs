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
/// These colors are the only ones that are required for terminals that support [ISO/IEC 6429](https://www.iso.org/standard/12782.html)
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
/// These are only supported on terminals that implement the [aixterm specification](https://sites.ualberta.ca/dept/chemeng/AIX-43/share/man/info/C/a_doc_lib/cmds/aixcmds1/aixterm.htm).
///
/// Pretty much every terminal nowadays supports this specification.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct Bright(Color);

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
