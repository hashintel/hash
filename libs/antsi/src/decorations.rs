// todo: note that on mintty this is the emoji selector
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub enum Frame {
    Framed,
    Encircled,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub enum Location {
    BelowOrRight,
    AboveOrLeft,
    BelowOrLeft,
    AboveOrRight,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub enum Stroke {
    Single,
    Double,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct Line {
    location: Location,
    stroke: Stroke,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub enum Marking {
    Line(Line),
    Stress,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, Default)]
pub struct Decorations {
    frame: Option<Frame>,
    marking: Option<Marking>,
}

impl Decorations {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            frame: None,
            marking: None,
        }
    }
}
