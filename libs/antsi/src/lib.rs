// Good reference to begin with: https://gist.github.com/fnky/458719343aabd01cfb17a3a4f7296797
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
///
/// ## Specification
///
/// The format for the escape sequence was standardized with the ANSI control sequences in
/// [ISO 6429](https://www.iso.org/standard/12782.html).
///
/// The escape sequences are:
///
/// | Color              | Foreground | Background |
/// |--------------------|------------|------------|
/// | [`Color::Black`]   | `ESC[30m`  | `ESC[40m`  |
/// | [`Color::Red`]     | `ESC[31m`  | `ESC[41m`  |
/// | [`Color::Green`]   | `ESC[32m`  | `ESC[42m`  |
/// | [`Color::Yellow`]  | `ESC[33m`  | `ESC[43m`  |
/// | [`Color::Blue`]    | `ESC[34m`  | `ESC[44m`  |
/// | [`Color::Magenta`] | `ESC[35m`  | `ESC[45m`  |
/// | [`Color::Cyan`]    | `ESC[36m`  | `ESC[46m`  |
/// | [`Color::White`]   | `ESC[37m`  | `ESC[47m`  |
/// | Reset              | `ESC[39m`  | `ESC[49m`  |
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
/// Support for bright colors was not part of [ISO 6429](https://www.iso.org/standard/12782.html)
/// the specification, which introduced and standardized ANSI escape sequences.
/// [aixterm specification](https://sites.ualberta.ca/dept/chemeng/AIX-43/share/man/info/C/a_doc_lib/cmds/aixcmds1/aixterm.htm)
/// introduced these additional escape sequences, terminal (-emulators) began to implement them.
/// It is pretty save to say that every terminal (-emulators) created after 1997 has support for
/// these sequences.
///
/// ## Specification
///
/// While never officially specified, `aixterm` set the quasi standard for bright colors, which have
/// the following escape sequences:
///
///
/// | Color              | Foreground | Background |
/// |--------------------|------------|------------|
/// | [`Color::Black`]   | `ESC[90m`  | `ESC[100m`  |
/// | [`Color::Red`]     | `ESC[91m`  | `ESC[101m`  |
/// | [`Color::Green`]   | `ESC[92m`  | `ESC[102m`  |
/// | [`Color::Yellow`]  | `ESC[93m`  | `ESC[103m`  |
/// | [`Color::Blue`]    | `ESC[94m`  | `ESC[104m`  |
/// | [`Color::Magenta`] | `ESC[95m`  | `ESC[105m`  |
/// | [`Color::Cyan`]    | `ESC[96m`  | `ESC[106m`  |
/// | [`Color::White`]   | `ESC[97m`  | `ESC[107m`  |
/// | Reset              | `ESC[99m`  | `ESC[109m`  |
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct BrightColor(Color);

/// Extended color support
///
/// 0 - 7 correspond to the [`Color`] variants, while 8 - 15 correspond to their [`BrightColor`]
/// counterpart.
///
/// ## Support
///
/// Nowadays every modern terminal emulator supports xterm colors, this can be easily checked by
/// executing `echo $TERM`, if the name is prefixed with `xterm-` the terminal is likely able to
/// support these colors, the dedicated crate [`supports-color`](https://lib.rs/crates/supports-color)
/// can be used to detect this (and many other) indicators for xterm color scheme support.
///
/// ## History
///
/// The name xterm color comes from the xterm terminal, the standard terminal emulator that is
/// shipped with the [X Window System]. Since 1999, support for a new color mode was added that
/// brought 256 colors, instead of the previously available 16 colors to the terminal.
///
/// ## Specification
///
/// The format for the escape sequence was first added in 1994 via [ISO 8613-6], which states in
/// chapter 40:
///
/// > If the first parameter element has the value 5, then there is a second parameter element
/// > specifying the index into the colour table given by the attribute
/// > "content colour table" applying to the object with which the content is associated.
///
/// [ISO 8613-6] and [ECMA-48] specified the separator between elements to be `03/10` (`:`), while
/// newer implementations followed the initial implementation of `xterm`, which used the separator
/// `03/11` (`;`).
///
/// The only difference to all common implementations is, that the separator used in the
/// specification is `:`, while most implementations only support `;` as a separator. An explanation
/// as to why can be seen in the source code of the initial support in `xterm`,
/// which all other terminal emulators adopted: [GitHub repo](https://github.com/ThomasDickey/xterm-snapshots/blob/8d625aa49d5fdaa055a9f26d514121f032c7b771/charproc.c#L1957-L2028)
///
/// The escape sequence for these colors is `ESC[38;5;{ID}m` for the foreground and `ESC[38;5;{ID}m`
/// for the background.
///
/// [ISO 8613-6]: https://www.iso.org/standard/22943.html
/// [ECMA-48]: https://www.ecma-international.org/publications-and-standards/standards/ecma-48/
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct IndexedColor(u8);

/// Truecolor 24bit RGB support
///
/// Allows to set the background and foreground color to any arbitrary color selected
///
/// ## Support
///
/// More modern terminals like [alacritty](https://alacritty.org/) or [kitty](https://sw.kovidgoyal.net/kitty/)
/// support RGB colors, this support is often not very well documented, but one can often use the
/// `COLORTERM` environment variable to inspect if truecolor is supported. (the value of the
/// variable will be `truecolor`). Most built-terminals, do **not** support true-color by default.
/// To programmatically check for support it is advised to use a crate similar to [`supports-color`](https://lib.rs/crates/supports-color)
///
/// ## Specification
///
/// This mode was initially specified in 1994, together with [`IndexedColor`], but most terminals do
/// not support the format outlined in [ISO 8613-6], notably, it is a lot more complete than the now
/// used format of `ESC[38;2;{r};{g};{b}m`. The specification also an optional color space id,
/// tolerance and color space associated with the color space.
///
/// Only `xterm` supports this scheme, where the color space id and tolerance parameters are
/// ignored. The specification also uses `:` as a separator instead of `;`. `xterm` was the first
/// terminal with wide-spread adoption that implemented RGB support in 2012, and all other terminals
/// copied their implementation. For a reason why there's a descrepency between the standard and
/// implementation a detailed reasoning is provided in the [xterm repo](https://github.com/ThomasDickey/xterm-snapshots/blob/8d625aa49d5fdaa055a9f26d514121f032c7b771/charproc.c#L1957-L2028)
///
/// [ISO 8613-6] also specified multiple additional modes, like transparent, CMK, and CMYK support.
///
/// [ISO 8613-6]: https://www.iso.org/standard/22943.html
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct RgbColor {
    r: u8,
    g: u8,
    b: u8,
}

// TODO: Default

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub enum Ansi {
    Color(Color),
    Bright(BrightColor),
    XTerm(IndexedColor),
    Truecolor(RgbColor),
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub enum FontWeight {
    Bold,
    Faint,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub enum FontFamily {
    Primary,
    Fraktur,
    Alternative(u8),
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
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

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct Style {
    font: Font,
}
