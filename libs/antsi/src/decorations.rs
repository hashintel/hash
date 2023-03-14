/// Frame around text
///
/// Not well supported by any major terminal, frames are either rectangular or an oval. [ISO 6429]
/// does not specify how these should look.
///
/// [ISO 6429]: https://www.iso.org/standard/12782.html
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub enum Frame {
    Framed,
    Encircled,
}

/// Text Decorations
///
/// ## Support
///
/// These options are not well supported and only some terminals support a subset of them.
///
/// ## Specification
///
/// These decorations have been introduced as part of the ANSI control sequences in [ISO 6429]. The
/// options 60 - 69 have **not** been included due to their ambiguity and missing use by any major
/// terminal.
///
/// These include:
///
/// * single line below character with horizontal line orientation or single line on the right side
///   of character with vertical line orientation
/// * double line below character with horizontal line orientation or double line on the right side
///   of character with vertical line orientation
/// * single line above character with horizontal line orientation or single line on the left side
///   of character with vertical line orientation
/// * double line above character with horizontal line orientation or double line on the left side
///   of character with vertical line orientation
/// * ideogram stress marking
/// * single line below character with horizontal line orientation or single line on the left side
///   of character with vertical line orientation
/// * double line below character with horizontal line orientation or double line on the left side
///   of character with vertical line orientation
/// * single line above character with horizontal line orientation or single line on the right side
///   of character with vertical line orientation
/// * double line above character with horizontal line orientation or double line on the right side
///   of character with vertical line orientation
///
/// [ISO 6429]: https://www.iso.org/standard/12782.html
#[derive(Debug, Copy, Clone, Eq, PartialEq, Default)]
pub struct Decorations {
    frame: Option<Frame>,
}

impl Decorations {
    #[must_use]
    pub const fn new() -> Self {
        Self { frame: None }
    }
}
