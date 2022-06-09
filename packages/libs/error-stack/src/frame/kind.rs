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
    /// Frame was created through [`attach()`].
    ///
    /// [`attach()`]: crate::Report::attach
    Attachment(Attachment<'f>),
}

/// Classification of the contents of a [`Frame`], determined by how it was created.
///
/// [`Frame`]: crate::Frame
pub enum Attachment<'f> {
    /// A generic attachment.
    Generic(&'f (dyn Send + Sync + 'static)),
    /// A printable attachment implementing [`Debug`].
    Debug(&'f (dyn Debug + Send + Sync + 'static)),
    /// A printable attachment implementing [`Debug`] and [`Display`].
    Printable(&'f dyn Printable),
}

pub trait Printable: Debug + Display + Send + Sync + 'static {}
impl<T> Printable for T where T: Debug + Display + Send + Sync + 'static {}
