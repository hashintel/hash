use core::fmt::{Debug, Display};

use crate::Context;

/// The type of a [`Frame`].
///
/// This directly correlates to the [`FrameKind`] and can be obtained via [`FrameKind::as_type`].
///
/// The difference between [`FrameKind`] and [`FrameType`] is that [`FrameType`] does not hold any
/// data, while [`FrameKind`] does.
// TODO: naming
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub enum FrameType {
    Context,
    Attachment(AttachmentType),
}

impl FrameType {
    pub fn is_context(&self) -> bool {
        matches!(self, FrameType::Context)
    }

    pub fn is_attachment(&self) -> bool {
        matches!(self, FrameType::Attachment(_))
    }
}

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

impl<'f> FrameKind<'f> {
    /// Convert [`FrameKind`] into the corresponding [`FrameType`], which is the same as a
    /// [`FrameKind`], but does not hold any data and purely serves as a marker.
    pub fn as_type(&self) -> FrameType {
        match self {
            FrameKind::Context(_) => FrameType::Context,
            FrameKind::Attachment(attachment) => FrameType::Attachment(attachment.as_type()),
        }
    }
}

/// The type of an attachment.
///
/// This directly correlates to the [`AttachmentKind`] and can be obtained via
/// [`FrameKind::as_type`] through the [`FrameType::Attachment`] variant.
///
/// The difference between [`AttachmentKind`] and [`AttachmentType`] is that [`AttachmentType`] does
/// not hold any data, while [`AttachmentKind`] does.
// TODO: naming
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
#[non_exhaustive]
pub enum AttachmentType {
    Opaque,
    Printable,
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

impl<'f> AttachmentKind<'f> {
    fn as_type(&self) -> AttachmentType {
        match self {
            AttachmentKind::Opaque(_) => AttachmentType::Opaque,
            AttachmentKind::Printable(_) => AttachmentType::Printable,
        }
    }
}

// TODO: Replace `Printable` by trait bounds when trait objects for multiple traits are supported.
//   see https://github.com/rust-lang/rfcs/issues/2035
pub trait Printable: Debug + Display + Send + Sync + 'static {}
impl<T> Printable for T where T: Debug + Display + Send + Sync + 'static {}
