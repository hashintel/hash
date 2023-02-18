pub enum Frame {
    Framed,
    Encircled,
}

pub enum Location {
    BelowOrRight,
    AboveOrLeft,
    BelowOrLeft,
    AboveOrRight,
}

pub enum Stroke {
    Single,
    Double,
}

// TODO: renaem
pub struct RenameMe {
    location: Location,
    stroke: Stroke,
}

pub struct Decorations {
    frame: Option<Frame>,
    rendition_aspect: Option<RenameMe>,

    overline: bool,
}

// TODO: mintty 8:7m
