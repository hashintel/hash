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
    /// The primary (default) font family
    Primary,
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
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
#[non_exhaustive]
pub enum Blinking {
    Slow,
    Fast,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, Default)]
pub struct Font {
    weight: Option<FontWeight>,
    family: Option<FontFamily>,

    // Value layout: `XXXX_IRHS`
    //
    // * `I`: `italic`
    // * `R`: `inverse/reverse`
    // * `H`: `hidden/invisible`
    // * `S`: `strikethrough`
    style: u8,

    underline: Option<Underline>,
    blinking: Option<Blinking>,
}

impl Font {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            weight: None,
            family: None,
            style: 0x00,
            underline: None,
            blinking: None,
        }
    }

    pub fn set_weight(&mut self, weight: FontWeight) -> &mut Self {
        self.weight = Some(weight);

        self
    }

    #[must_use]
    pub const fn with_weight(mut self, weight: FontWeight) -> Self {
        self.weight = Some(weight);

        self
    }

    pub fn set_family(&mut self, family: FontFamily) -> &mut Self {
        self.family = Some(family);

        self
    }

    #[must_use]
    pub const fn with_family(mut self, family: FontFamily) -> Self {
        self.family = Some(family);

        self
    }

    pub fn set_underline(&mut self, underline: Underline) -> &mut Self {
        self.underline = Some(underline);

        self
    }

    #[must_use]
    pub const fn with_underline(mut self, underline: Underline) -> Self {
        self.underline = Some(underline);

        self
    }

    pub fn set_blinking(&mut self, blinking: Blinking) -> &mut Self {
        self.blinking = Some(blinking);

        self
    }

    #[must_use]
    pub const fn with_blinking(mut self, blinking: Blinking) -> Self {
        self.blinking = Some(blinking);

        self
    }

    pub fn set_strikethrough(&mut self) -> &mut Self {
        self.style |= 1 << 0;

        self
    }

    #[must_use]
    pub const fn with_strikethrough(mut self) -> Self {
        self.style |= 1 << 0;

        self
    }

    pub fn set_inverse(&mut self) -> &mut Self {
        self.style |= 1 << 1;

        self
    }

    #[must_use]
    pub const fn with_inverse(mut self) -> Self {
        self.style |= 1 << 1;

        self
    }

    pub fn set_hidden(&mut self) -> &mut Self {
        self.style |= 1 << 2;

        self
    }

    #[must_use]
    pub const fn with_hidden(mut self) -> Self {
        self.style |= 1 << 2;

        self
    }

    pub fn set_italic(&mut self) -> &mut Self {
        self.style |= 1 << 3;

        self
    }

    #[must_use]
    pub const fn with_italic(mut self) -> Self {
        self.style |= 1 << 3;

        self
    }

    #[must_use]
    pub const fn weight(&self) -> Option<FontWeight> {
        self.weight
    }

    #[must_use]
    pub const fn family(&self) -> Option<FontFamily> {
        self.family
    }

    #[must_use]
    pub const fn style(&self) -> u8 {
        self.style
    }

    #[must_use]
    pub const fn underline(&self) -> Option<Underline> {
        self.underline
    }

    #[must_use]
    pub const fn blinking(&self) -> Option<Blinking> {
        self.blinking
    }
}
