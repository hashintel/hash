use crate::{macros::impl_const, Style};

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
/// [ISO 8613-6] and [ECMA-48] specified the separator between elements to be `03/10` (`:`), until
/// [ISO 8613-6] was rediscovered in the early 2010s implementations used the format initially used
/// by `xterm`, which used `;` as a separator instead of `:`. Most actively maintained open-source
/// terminal emulators like [`xterm`], [`kitty`] or [`wezterm`] support both delimiter and recommend
/// the use of `:`. Note that most built-in terminal emulators like [`Terminal.app`] do **not**
/// support `;` as a delimiter.
/// A detailed explanation as to why this discrepancy between standard and implementation
/// happened can be read in the [xterm repository](https://github.com/ThomasDickey/xterm-snapshots/blob/8d625aa49d5fdaa055a9f26d514121f032c7b771/charproc.c#L1957-L2028).
///
/// The escape sequence for these colors is `ESC[38:5:{ID}m` for the foreground and `ESC[38:5:{ID}m`
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
/// [ISO 8613-6] standardized the additional escape codes `38` (foreground) and `48` (background) in
/// 1994 for extended color support. These escape codes follow a specific format, where one can
/// specify additional parameters to influence the color used. These parameters are separated by
/// `:` and trailing optional parameters can be omitted.
///
/// The first parameter is always the color mode, which can either be:
///
/// * 0: implementation defined
/// * 1: [`TransparentColor`]
/// * 2: [`RgbColor`]
/// * 3: [`CmyColor`]
/// * 4: [`CmykColor`]
/// * 5: [`IndexedColor`]
///
/// The parameters required afterwards are dependent on the color mode specified, [`IndexedColor`]
/// only allows a single parameter (the index), for more information visit the related
/// documentation. [`TransparentColor`] does not support any additional parameters while
/// [`RgbColor`], [`CmyColor`], [`CmykColor`] support 7 (8 in the case of [`CmykColor`]) additional
/// parameters.
///
/// The format for these true-colors can be distilled into:
///
/// `{color space id}:{color components}:{tolerance value}:{color space of the tolerance value}`
///
/// Where `color space id`, `tolerance value` and `color space of tolerance value` are considered
/// optional and are left unspecified by the standard. Most terminal emulators that support these
/// either ignore any value set or do only support a legacy format.
///
/// The color components are separated by `:`, for [`RgbColor`] they are `{r}:{g}:{b}`, for
/// [`CmyColor`] they are `{c},{m},{y}`, for [`CmykColor`] they are `{c},{m},{y},{k}`, e.g.
/// `ESC[38:2::{r}:{g}:{b}m`.
///
/// ### Legacy Format
///
/// true-color support was first introduced in [xterm], which supported a reduced set using `;`
/// instead of `:` as a parameter separator, only supporting [`RgbColor`] and **not** supporting any
/// optional fields. This format is known through `antsi` as legacy format. If built-in terminals
/// (like [Terminal.app]) support [`RgbColor`], they often do through the legacy format (e.g.
/// `ESC[38;2;{r};{g};{b}m`), modern terminal emulator like [kitty], [wezterm], [mintty] support the
/// legacy format, but advice the use of the official format instead. To switch `antsi` to the
/// legacy format use [`Style::set_compliance`] and [`Style::set_delimiter`].
///
/// For a detailed explanation as to why the alternative format was introduced please refer to the
/// reasoning in the [xterm repository].
///
/// [xterm repository]: https://github.com/ThomasDickey/xterm-snapshots/blob/8d625aa49d5fdaa055a9f26d514121f032c7b771/charproc.c#L1957-L2028
/// [ISO 8613-6]: https://www.iso.org/standard/22943.html
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct RgbColor {
    red: u8,
    green: u8,
    blue: u8,
}

impl RgbColor {
    /// Create a new RGB color
    #[must_use]
    pub const fn new(red: u8, green: u8, blue: u8) -> Self {
        Self { red, green, blue }
    }
}

/// Truecolor 32-bit RGBA support
///
/// Allows to set the background and foreground color to any arbitrary color (with alpha level)
/// selected.
///
/// ## Support
///
/// This is a [wezterm terminal] extension and therefore only supported by very few terminals
/// (namely `wezterm`). Support has been added in August of 2022.
///
/// ## Specification
///
/// There is no formal specification, only the out format outlined in the [documentation]. This
/// extends the respective escape code `38` and `48` first outlined [ISO 8613-6 13.1.8] and adds a
/// new color mode: `6`, the fields are the same as the ones outlined in [`RgbColor`], except that
/// the format is: `ESC[38:6::{r}:{g}:{b}:{a}m`, this also means that the trailing optional (and
/// unused) parameters `tolerance value` and `color space of the tolerance value` are *after* the
/// `a` parameter.
///
/// [wezterm terminal]: https://wezfurlong.org/wezterm/index.html
/// [documentation]: https://wezfurlong.org/wezterm/escape-sequences.html#csi-386---foreground-color-rgba
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct RgbaColor {
    red: u8,
    green: u8,
    blue: u8,
    alpha: u8,
}

impl RgbaColor {
    #[must_use]
    pub const fn new(red: u8, green: u8, blue: u8, alpha: u8) -> Self {
        Self {
            red,
            green,
            blue,
            alpha,
        }
    }
}

/// Truecolor, 24-bit CMY colors
///
/// CMY is usually used for printers and stands for **C**yan, **M**agenta, **Y**ellow.
///
/// ## Support
///
/// While specified in [ISO 8613-6] no widely used terminal currently supports `CMY` colors.
///
/// ## History
///
/// [`CmyColor`] was standardized alongside [`RgbColor`] in [ISO 8613-6] but uses the color mode
/// `2`, it has the same parameters as [`RgbColor`], but instead of `{r}`, `{g}`, `{b}` uses `{c}`,
/// `{m}`, `{y}`, e.g.: `ESC[38:3::{c}:{m}:{y}m`.
///
/// For more information on the format please refer to the documentation in [`RgbColor`].
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct CmyColor {
    cyan: u8,
    magenta: u8,
    yellow: u8,
}

impl CmyColor {
    #[must_use]
    pub const fn new(cyan: u8, magenta: u8, yellow: u8) -> Self {
        Self {
            cyan,
            magenta,
            yellow,
        }
    }
}

/// Truecolor, 32-bit CMYK colors
///
/// CMYK is usually used for printers and stands for **C**yan, **M**agenta, **Y**ellow, **K**ey. Key
/// is a bit misleading, but is the amount of black color used.
///
/// ## Support
///
/// While specified in [ISO 8613-6] no widely used terminal currently supports `CMYK` colors.
///
/// ## History
///
/// [`CmyColor`] was standardized alongside [`RgbColor`] in [ISO 8613-6] but uses the color mode
/// `3`, it has the same parameters as [`RgbColor`], but instead of `{r}`, `{g}`, `{b}` uses `{c}`,
/// `{m}`, `{y}`, `{k}`, e.g.: `ESC[38:3::{c}:{m}:{y}:{k}m`.
///
/// For more information on the format please refer to the documentation in [`RgbColor`].
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct CmykColor {
    cyan: u8,
    magenta: u8,
    yellow: u8,
    black: u8,
}

impl CmykColor {
    #[must_use]
    pub const fn new(cyan: u8, magenta: u8, yellow: u8, black: u8) -> Self {
        Self {
            cyan,
            magenta,
            yellow,
            black,
        }
    }
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct TransparentColor;

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

    Transparent(TransparentColor),

    /// 24bit color support, more commonly known as truecolor
    ///
    /// Supported by some modern terminals since 2015+, for more information see [`RgbColor`]
    Rgb(RgbColor),

    /// 32-bit color support
    ///
    /// Supported by [wezterm] since August 2022, for more information see [`RgbaColor`]
    Rgba(RgbaColor),

    /// 24-bit CMY color support
    ///
    /// Not supported by any major terminal emulator, for more information see [`CmyColor`]
    Cmy(CmyColor),

    /// 32-bit CMYK color support
    ///
    /// Not supported by any major terminal emulator, for more information see [`CmykColor`]
    Cmyk(CmykColor),
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

impl_const! {
    impl const? From<RgbaColor> for Color {
        fn from(value: RgbaColor) -> Self {
            Self::Rgba(value)
        }
    }
}

impl_const! {
    impl const? From<CmyColor> for Color {
        fn from(value: CmyColor) -> Self {
            Self::Cmy(value)
        }
    }
}

impl_const! {
    impl const? From<CmykColor> for Color {
        fn from(value: CmykColor) -> Self {
            Self::Cmyk(value)
        }
    }
}

impl_const! {
    impl const? From<TransparentColor> for Color {
        fn from(value: TransparentColor) -> Self {
            Self::Transparent(value)
        }
    }
}
