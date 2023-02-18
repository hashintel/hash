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

#[derive(Debug, Copy, Clone, Eq, PartialEq, Default)]
pub struct Decorations {
    frame: Option<Frame>,
    line: Option<Line>,
}
