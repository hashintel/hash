use core::fmt::{Debug, Display};

use crate::Context;

/// Classification of the contents of a [`Frame`], determined by how it was created.
///
/// [`Frame`]: crate::Frame
pub enum FrameKind<'f> {
    /// Frame was created through [`Report::new()`] or [`change_context()`].
    ///
    /// [`Report::new()`]: crate::Report::new
    /// [`change_context()`]: crate::Report::change_context
    Context(&'f dyn Context),
    /// Frame was created through [`attach()`] or [`attach_printable()`].
    ///
    /// [`attach()`]: crate::Report::attach
    /// [`attach_printable()`]: crate::Report::attach_printable
    Attachment(AttachmentKind<'f>),
}

/// Classification of an attachment which is determined by the method it was created in.
#[non_exhaustive]
pub enum AttachmentKind<'f> {
    /// A generic attachment created through [`attach()`].
    ///
    /// [`attach()`]: crate::Report::attach
    Opaque(&'f (dyn Send + Sync + 'static)),
    /// A printable attachment created through [`attach_printable()`].
    ///
    /// [`attach_printable()`]: crate::Report::attach_printable
    Printable(&'f dyn Printable),
}

// TODO: Replace `Printable` by trait bounds when trait objects for multiple traits are supported.
//   see https://github.com/rust-lang/rfcs/issues/2035
pub trait Printable: Debug + Display + Send + Sync + 'static {}
impl<T> Printable for T where T: Debug + Display + Send + Sync + 'static {}
