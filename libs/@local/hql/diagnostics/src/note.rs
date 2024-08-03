use ariadne::Color;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", cfg_eval, serde_with::serde_as)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Note {
    message: Box<str>,
    #[cfg_attr(feature = "serde", serde_as(as = "Option<crate::encoding::Color>"))]
    color: Option<Color>,
}

impl Note {
    pub fn new(message: impl Into<Box<str>>) -> Self {
        Self {
            message: message.into(),
            color: None,
        }
    }

    #[must_use]
    pub const fn with_color(mut self, color: Color) -> Self {
        self.color = Some(color);
        self
    }

    pub fn set_color(&mut self, color: Color) -> &mut Self {
        self.color = Some(color);
        self
    }
}
