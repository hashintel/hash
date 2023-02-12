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
pub enum Underline {
    Single,
    Double,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
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
