use crate::macros::impl_const;

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
/// | Color                   | Foreground | Background |
/// |-------------------------|------------|------------|
/// | [`BasicColor::Black`]   | `ESC[30m`  | `ESC[40m`  |
/// | [`BasicColor::Red`]     | `ESC[31m`  | `ESC[41m`  |
/// | [`BasicColor::Green`]   | `ESC[32m`  | `ESC[42m`  |
/// | [`BasicColor::Yellow`]  | `ESC[33m`  | `ESC[43m`  |
/// | [`BasicColor::Blue`]    | `ESC[34m`  | `ESC[44m`  |
/// | [`BasicColor::Magenta`] | `ESC[35m`  | `ESC[45m`  |
/// | [`BasicColor::Cyan`]    | `ESC[36m`  | `ESC[46m`  |
/// | [`BasicColor::White`]   | `ESC[37m`  | `ESC[47m`  |
/// | Reset                   | `ESC[39m`  | `ESC[49m`  |
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub enum BasicColor {
    /// Black foreground or background
    // TODO: example
    Black,
    /// Red foreground or background
    // TODO: example
    Red,
    /// Green foreground or background
    // TODO: example
    Green,
    /// Yellow foreground or background
    // TODO: example
    Yellow,
    /// Blue foreground or background
    // TODO: example
    Blue,
    /// Magenta foreground or background
    // TODO: example
    Magenta,
    /// Cyan foreground or background
    // TODO: example
    Cyan,
    /// White foreground or background
    // TODO: example
    White,
}

impl BasicColor {
    /// Convert the color into its bright variant
    #[must_use]
    pub const fn bright(self) -> BrightColor {
        BrightColor(self)
    }
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
/// | Color                   | Foreground | Background |
/// |-------------------------|------------|------------|
/// | [`BasicColor::Black`]   | `ESC[90m`  | `ESC[100m`  |
/// | [`BasicColor::Red`]     | `ESC[91m`  | `ESC[101m`  |
/// | [`BasicColor::Green`]   | `ESC[92m`  | `ESC[102m`  |
/// | [`BasicColor::Yellow`]  | `ESC[93m`  | `ESC[103m`  |
/// | [`BasicColor::Blue`]    | `ESC[94m`  | `ESC[104m`  |
/// | [`BasicColor::Magenta`] | `ESC[95m`  | `ESC[105m`  |
/// | [`BasicColor::Cyan`]    | `ESC[96m`  | `ESC[106m`  |
/// | [`BasicColor::White`]   | `ESC[97m`  | `ESC[107m`  |
/// | Reset                   | `ESC[99m`  | `ESC[109m`  |
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct BrightColor(BasicColor);

/// Extended color support
///
/// Usually `0` - `7` correspond to the [`BasicColor`] variants, `8` - `15` correspond to their
/// [`BrightColor`] counterpart, `232` - `255` are a grayscale from black to white while all others
/// map a color cube.
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

impl IndexedColor {
    /// Create a new color which indexes into a preset table
    #[must_use]
    pub const fn new(index: u8) -> Self {
        Self(index)
    }
}

impl From<BasicColor> for IndexedColor {
    fn from(value: BasicColor) -> Self {
        match value {
            BasicColor::Black => Self(0),
            BasicColor::Red => Self(1),
            BasicColor::Green => Self(2),
            BasicColor::Yellow => Self(3),
            BasicColor::Blue => Self(4),
            BasicColor::Magenta => Self(5),
            BasicColor::Cyan => Self(6),
            BasicColor::White => Self(7),
        }
    }
}

impl From<BrightColor> for IndexedColor {
    fn from(value: BrightColor) -> Self {
        match value {
            BrightColor(BasicColor::Black) => Self(8),
            BrightColor(BasicColor::Red) => Self(9),
            BrightColor(BasicColor::Green) => Self(10),
            BrightColor(BasicColor::Yellow) => Self(11),
            BrightColor(BasicColor::Blue) => Self(12),
            BrightColor(BasicColor::Magenta) => Self(13),
            BrightColor(BasicColor::Cyan) => Self(14),
            BrightColor(BasicColor::White) => Self(15),
        }
    }
}

/// Truecolor 24-bit RGB support
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
/// not support the format outlined in [ISO 8613-6], The standard is a lot more complete than the
/// now used format of `ESC[38;2;{r};{g};{b}m` and featured optional color space id, tolerance and
/// color space associated with the tolerance parameters.
///
/// Only `xterm` supports this scheme, where the color space id and tolerance parameters are
/// ignored. The specification also uses `:` as a separator instead of `;`. `xterm` was the first
/// terminal with wide-spread adoption that implemented RGB support in 2012, and all other terminals
/// copied their implementation. For the reason why there's a discrepancy between the standard and
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

impl RgbColor {
    /// Create a new RGB color
    #[must_use]
    pub const fn new(r: u8, g: u8, b: u8) -> Self {
        Self { r, g, b }
    }
}

/// Collection of every possible terminal color supported by `antsi`
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
#[non_exhaustive]
pub enum Color {
    /// Basic 8 color palette
    ///
    /// Supported by pretty much every terminal, for more information see [`BasicColor`]
    Basic(BasicColor),

    /// Bright variant of the basic color palette
    ///
    /// Supported by pretty much every terminal, for more information see [`BrightColor`]
    Bright(BrightColor),

    /// Indexed color, more commonly known as xterm-color
    ///
    /// Supported by pretty much every terminal since the early 2000s, for more information see
    /// [`IndexedColor`]
    Indexed(IndexedColor),

    /// 24bit color support, more commonly known as truecolor
    ///
    /// Supported by some modern terminals since 2015+, for more information see [`RgbColor`]
    Rgb(RgbColor),
}

impl_const! {
    impl const? From<BasicColor> for Color {
        fn from(value: BasicColor) -> Self {
            Self::Basic(value)
        }
    }
}

impl_const! {
    impl const? From<BrightColor> for Color {
        fn from(value: BrightColor) -> Self {
            Self::Bright(value)
        }
    }
}

impl_const! {
    impl const? From<IndexedColor> for Color {
        fn from(value: IndexedColor) -> Self {
            Self::Indexed(value)
        }
    }
}

impl_const! {
    impl const? From<RgbColor> for Color {
        fn from(value: RgbColor) -> Self {
            Self::Rgb(value)
        }
    }
}
