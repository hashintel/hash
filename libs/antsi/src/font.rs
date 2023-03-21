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

macro_rules! impl_builder {
    (
        $(#[$meta_set:meta])*
        $set:ident($set_var:ident : $set_ty:ty);
        $(#[$meta_with:meta])*
        $with:ident($with_var:ident : $with_ty:ty);
        $(#[$meta_getter:meta])*
        $get:ident() -> $ret:ty
    ) => {
        $(#[$meta_set])*
        pub fn $set(&mut self, $set_var: $set_ty) -> &mut Self {
            self.$set_var = Some($set_var);
            self
        }

        $(#[$meta_with])*
        #[must_use]
        pub const fn $with(mut self, $with_var: $with_ty) -> Self {
            self.$with_var = Some($with_var);
            self
        }

        $(#[$meta_getter])*
        #[must_use]
        pub const fn $get(&self) -> $ret {
            self.$with_var
        }
    };
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, Default)]
pub struct Font {
    weight: Option<FontWeight>,
    family: Option<FontFamily>,
    // mintty extension
    #[cfg(feature = "script")]
    script: Option<FontScript>,

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

    underline: Option<Underline>,
    blinking: Option<Blinking>,
}

impl Font {
    impl_builder!(
        set_weight(weight: FontWeight);
        with_weight(weight: FontWeight);
        weight() -> Option<FontWeight>
    );

    impl_builder!(
        set_family(family: FontFamily);
        with_family(family: FontFamily);
        family() -> Option<FontFamily>
    );

    impl_builder!(
        set_underline(underline: Underline);
        with_underline(underline: Underline);
        underline() -> Option<Underline>
    );

    impl_builder!(
        set_blinking(blinking: Blinking);
        with_blinking(blinking: Blinking);
        blinking() -> Option<Blinking>
    );

    #[cfg(feature = "script")]
    impl_builder!(
        set_script(script: FontScript);
        with_script(script: FontScript);
        script() -> Option<FontScript>
    );

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

    pub fn set_strikethrough(&mut self) -> &mut Self {
        self.style |= 1 << 0;

        self
    }

    #[must_use]
    pub const fn with_strikethrough(mut self) -> Self {
        self.style |= 1 << 0;

        self
    }

    #[must_use]
    pub const fn is_strikethrough(&self) -> bool {
        (self.style & 0b0000_0001) > 0
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

    #[must_use]
    pub const fn is_inverse(&self) -> bool {
        (self.style & 0b0000_0010) > 0
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

    #[must_use]
    pub const fn is_hidden(&self) -> bool {
        (self.style & 0b0000_0100) > 0
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
    pub const fn is_italic(&self) -> bool {
        (self.style & 0b0000_1000) > 0
    }

    #[cfg(feature = "overstrike")]
    pub fn set_overstrike(&mut self) -> &mut Self {
        self.style |= 1 << 4;

        self
    }

    #[cfg(feature = "overstrike")]
    #[must_use]
    pub const fn with_overstrike(mut self) -> Self {
        self.style |= 1 << 4;

        self
    }

    #[cfg(feature = "overstrike")]
    #[must_use]
    pub const fn is_overstrike(&self) -> bool {
        (self.style & 0b0001_0000) > 0
    }

    pub fn set_overline(&mut self) -> &mut Self {
        self.style |= 1 << 5;

        self
    }

    #[must_use]
    pub const fn with_overline(mut self) -> Self {
        self.style |= 1 << 5;

        self
    }

    #[must_use]
    pub const fn is_overline(&self) -> bool {
        (self.style & 0b0010_0000) > 0
    }
}
