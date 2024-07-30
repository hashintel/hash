use ariadne::Color;

pub struct Note {
    message: Box<str>,
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
