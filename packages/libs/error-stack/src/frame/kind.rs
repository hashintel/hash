/// Classification of the contents of a [`Frame`], determined by how it was created.
///
/// [`Frame`]: crate::Frame
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum FrameKind {
    /// Frame was created through [`Report::new()`] or [`change_context()`].
    ///
    /// [`Report::new()`]: crate::Report::new
    /// [`change_context()`]: crate::Report::change_context
    Context,
    /// Frame was created through [`attach()`].
    ///
    /// [`attach()`]: crate::Report::attach
    Attachment,
}
