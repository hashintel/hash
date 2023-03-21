/// Font Weight
///
/// ## Support
///
/// Terminals that implement ANSI escape sequences, usually implement [`Self::Bold`], but only some
/// have support for [`Self::Faint`]. This is often dependent on the available font-weights of the
/// currently used terminal font.
///
/// ## Specification
///
/// The format for this escape sequence was standardized with the ANSI control sequences in
/// [ISO 6429].
///
/// The escape sequences are:
///
/// | Font Weight           | Escape Code |
/// |-----------------------|-------------|
/// | [`FontWeight::Bold`]  | `ESC[1m`    |
/// | [`FontWeight::Faint`] | `ESC[2m`    |
///
/// [ISO 6429]: https://www.iso.org/standard/12782.html
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
#[non_exhaustive]
pub enum FontWeight {
    /// Bold text
    ///
    /// Sometimes known as: increased intensity
    // TODO: example
    Bold,
    /// Faint text
    ///
    /// Somtimes known as: decreased intensity, second color or light (CSS)
    // TODO: example
    Faint,
}

/// Alternative Font Family
///
/// [ISO 6429] only allows for up to 9 alternative fonts, therefore the value is clamped to `0..9`
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct AlternativeFontFamily(u8);

impl AlternativeFontFamily {
    pub fn new(variant: u8) -> Option<Self> {
        (0..9).contains(&variant).then_some(Self(variant))
    }
}

/// Font Family
///
/// ## Support
///
/// While part of the original specification [ISO 6429], a change of the font family is only
/// supported on a select few of terminal emulators. Handle with care, as for most cases a change in
/// font family won't change anything.
///
/// ## Specification
///
/// Support was part of the initial ANSI escape sequence specification [ISO 6429], the change of
/// font families is supported by a few. Support for the [`Self::Fraktur`] font is only available in
/// a select few terminal emulators, like [Terminology](https://github.com/borisfaure/terminology).
///
/// The specification supports 9 alternative fonts.
///
/// [ISO 6429]: https://www.iso.org/standard/12782.html
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
#[non_exhaustive]
pub enum FontFamily {
    /// Fraktur
    ///
    /// ## What is Fraktur?
    ///
    /// [ISO 6429] was first introduced in 1976 as [ECMA-48], a time where in
    /// Germany the usage of an alternative Latin alphabet
    /// [Fraktur](https://en.wikipedia.org/wiki/Fraktur) was more common.
    /// Nowadays Fraktur is seldom used in Germany and is no longer taught or practiced and can be
    /// considered a relic of the past.
    /// This is also why only a select few terminal emulators support this specific typeface.
    ///
    /// [ISO 6429]: https://www.iso.org/standard/12782.html
    /// [ECMA-48]: https://www.ecma-international.org/publications-and-standards/standards/ecma-48/
    Fraktur,
    /// Alternative font family
    Alternative(AlternativeFontFamily),
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
#[non_exhaustive]
pub enum Underline {
    Single,
    Double,

    // kitty + vte extension
    #[cfg(feature = "underline-variants")]
    Curly,
    // kitty + vte extension
    #[cfg(feature = "underline-variants")]
    Dotted,
    // kitty + vte extension
    #[cfg(feature = "underline-variants")]
    Dashed,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
#[non_exhaustive]
pub enum Blinking {
    Slow,
    Fast,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
#[cfg(feature = "script")]
#[non_exhaustive]
pub enum FontScript {
    Sub,
    Super,
}

#[derive(Copy, Clone)]
enum FontStyle {
    Strikethrough,
    Hidden,
    Inverse,
    Italic,
    #[cfg(feature = "overstrike")]
    Overstrike,
    Overline,
}

impl FontStyle {
    #[must_use]
    const fn mask(self) -> u8 {
        match self {
            Self::Strikethrough => 1 << 0,
            Self::Hidden => 1 << 1,
            Self::Inverse => 1 << 2,
            Self::Italic => 1 << 3,
            #[cfg(feature = "overstrike")]
            Self::Overstrike => 1 << 4,
            Self::Overline => 1 << 5,
        }
    }
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, Default)]
#[non_exhaustive]
pub struct Font {
    pub weight: Option<FontWeight>,
    pub family: Option<FontFamily>,
    // mintty extension
    #[cfg(feature = "script")]
    pub script: Option<FontScript>,

    // Value layout: `XXÖO_IRHS`
    //
    // * `S`: `strikethrough`
    // * `H`: `hidden/invisible`
    // * `R`: `inverse/reverse`
    // * `I`: `italic`
    // * `O`: `overstrike` - mintty extension
    // * `Ö`: `overline`
    // * `X`: unused
    style: u8,

    pub underline: Option<Underline>,
    pub blinking: Option<Blinking>,
}

impl Font {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            #[cfg(feature = "script")]
            script: None,
            weight: None,
            family: None,
            style: 0x00,
            underline: None,
            blinking: None,
        }
    }

    #[must_use]
    pub const fn with_weight(mut self, weight: FontWeight) -> Self {
        self.weight = Some(weight);

        self
    }

    #[must_use]
    pub const fn with_family(mut self, family: FontFamily) -> Self {
        self.family = Some(family);

        self
    }

    #[must_use]
    pub const fn with_underline(mut self, underline: Underline) -> Self {
        self.underline = Some(underline);

        self
    }

    #[must_use]
    pub const fn with_blinking(mut self, blinking: Blinking) -> Self {
        self.blinking = Some(blinking);

        self
    }

    #[cfg(feature = "script")]
    #[must_use]
    pub const fn with_script(mut self, script: FontScript) -> Self {
        self.script = Some(script);

        self
    }

    const fn with_style(mut self, style: FontStyle, enable: bool) -> Self {
        let mask = style.mask();

        self.style = if enable {
            self.style | mask
        } else {
            self.style & !mask
        };
        self
    }

    const fn is_style(self, style: FontStyle) -> bool {
        (self.style & style.mask()) > 0
    }

    pub fn set_strikethrough(&mut self, enable: bool) -> &mut Self {
        *self = self.with_style(FontStyle::Strikethrough, enable);
        self
    }

    #[must_use]
    pub const fn with_strikethrough(self) -> Self {
        self.with_style(FontStyle::Strikethrough, true)
    }

    #[must_use]
    pub const fn is_strikethrough(&self) -> bool {
        self.is_style(FontStyle::Strikethrough)
    }

    pub fn set_inverse(&mut self, enable: bool) -> &mut Self {
        *self = self.with_style(FontStyle::Inverse, enable);
        self
    }

    #[must_use]
    pub const fn with_inverse(self) -> Self {
        self.with_style(FontStyle::Inverse, true)
    }

    #[must_use]
    pub const fn is_inverse(&self) -> bool {
        self.is_style(FontStyle::Inverse)
    }

    pub fn set_hidden(&mut self, enable: bool) -> &mut Self {
        *self = self.with_style(FontStyle::Hidden, enable);
        self
    }

    #[must_use]
    pub const fn with_hidden(self) -> Self {
        self.with_style(FontStyle::Hidden, true)
    }

    #[must_use]
    pub const fn is_hidden(&self) -> bool {
        self.is_style(FontStyle::Hidden)
    }

    pub fn set_italic(&mut self, enable: bool) -> &mut Self {
        *self = self.with_style(FontStyle::Italic, enable);
        self
    }

    #[must_use]
    pub const fn with_italic(self) -> Self {
        self.with_style(FontStyle::Italic, true)
    }

    #[must_use]
    pub const fn is_italic(&self) -> bool {
        self.is_style(FontStyle::Italic)
    }

    #[cfg(feature = "overstrike")]
    pub fn set_overstrike(&mut self, enable: bool) -> &mut Self {
        *self = self.with_style(FontStyle::Overstrike, enable);
        self
    }

    #[cfg(feature = "overstrike")]
    #[must_use]
    pub const fn with_overstrike(self) -> Self {
        self.with_style(FontStyle::Overstrike, true)
    }

    #[cfg(feature = "overstrike")]
    #[must_use]
    pub const fn is_overstrike(&self) -> bool {
        self.is_style(FontStyle::Overstrike)
    }

    pub fn set_overline(&mut self, enable: bool) -> &mut Self {
        *self = self.with_style(FontStyle::Overline, enable);
        self
    }

    #[must_use]
    pub const fn with_overline(self) -> Self {
        self.with_style(FontStyle::Overline, true)
    }

    #[must_use]
    pub const fn is_overline(&self) -> bool {
        self.is_style(FontStyle::Overline)
    }
}
