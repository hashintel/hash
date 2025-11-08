use core::fmt;
use std::io;

use anstyle::Style;
use pretty::{Render, RenderAnnotated};

use super::semantic::Semantic;

pub(super) struct Never(!);

impl io::Write for Never {
    fn write(&mut self, _: &[u8]) -> io::Result<usize> {
        self.0
    }

    fn flush(&mut self) -> io::Result<()> {
        self.0
    }
}

impl fmt::Write for Never {
    fn write_str(&mut self, _: &str) -> fmt::Result {
        self.0
    }
}

pub(super) enum RenderError {
    Io(io::Error),
    Fmt(fmt::Error),
}

impl RenderError {
    pub(super) fn into_io(self) -> io::Error {
        match self {
            Self::Io(error) => error,
            Self::Fmt(error) => io::Error::other(error),
        }
    }

    pub(super) fn into_fmt(self) -> fmt::Error {
        match self {
            Self::Io(_) => fmt::Error,
            Self::Fmt(error) => error,
        }
    }
}

enum Backend<F, I> {
    Fmt(F),
    Io(I),
}

pub(super) struct PlainWriter<F, I> {
    backend: Backend<F, I>,
}

impl<I> PlainWriter<Never, I> {
    /// Creates a new plain writer.
    pub(super) const fn new_io(inner: I) -> Self {
        Self {
            backend: Backend::Io(inner),
        }
    }
}

impl<F> PlainWriter<F, Never> {
    /// Creates a new plain writer.
    pub(super) const fn new_fmt(inner: F) -> Self {
        Self {
            backend: Backend::Fmt(inner),
        }
    }
}

impl<F, I> PlainWriter<F, I>
where
    F: fmt::Write,
    I: io::Write,
{
    fn write_fmt(&mut self, args: fmt::Arguments<'_>) -> Result<(), RenderError> {
        match &mut self.backend {
            Backend::Fmt(fmt) => fmt.write_fmt(args).map_err(RenderError::Fmt),
            Backend::Io(io) => io.write_fmt(args).map_err(RenderError::Io),
        }
    }
}

impl<F, I> Render for PlainWriter<F, I>
where
    F: fmt::Write,
    I: io::Write,
{
    type Error = RenderError;

    fn write_str(&mut self, s: &str) -> Result<usize, Self::Error> {
        match &mut self.backend {
            Backend::Fmt(fmt) => {
                fmt.write_str(s).map_err(RenderError::Fmt)?;
                Ok(s.len())
            }
            Backend::Io(io) => io.write(s.as_bytes()).map_err(RenderError::Io),
        }
    }

    fn write_str_all(&mut self, s: &str) -> Result<(), Self::Error> {
        match &mut self.backend {
            Backend::Fmt(fmt) => fmt.write_str(s).map_err(RenderError::Fmt),
            Backend::Io(io) => io.write_all(s.as_bytes()).map_err(RenderError::Io),
        }
    }

    fn fail_doc(&self) -> Self::Error {
        match &self.backend {
            Backend::Fmt(_) => RenderError::Fmt(fmt::Error),
            Backend::Io(_) => RenderError::Io(io::Error::other("Document rendering failed")),
        }
    }
}

impl<F, I> RenderAnnotated<'_, Semantic> for PlainWriter<F, I>
where
    F: fmt::Write,
    I: io::Write,
{
    fn push_annotation(&mut self, _: &Semantic) -> Result<(), Self::Error> {
        Ok(())
    }

    fn pop_annotation(&mut self) -> Result<(), Self::Error> {
        Ok(())
    }
}

/// Writer that renders documents with semantic annotations as ANSI colors.
pub(super) struct AnsiWriter<F, I> {
    stack: Vec<Style>,
    plain: PlainWriter<F, I>,
}

impl<I> AnsiWriter<Never, I> {
    /// Creates a new styled writer.
    pub(super) const fn new_io(inner: I) -> Self {
        Self {
            stack: Vec::new(),
            plain: PlainWriter::new_io(inner),
        }
    }
}

impl<F> AnsiWriter<F, Never> {
    /// Creates a new styled writer.
    pub(super) const fn new_fmt(inner: F) -> Self {
        Self {
            stack: Vec::new(),
            plain: PlainWriter::new_fmt(inner),
        }
    }
}

impl<F, I> Render for AnsiWriter<F, I>
where
    F: fmt::Write,
    I: io::Write,
{
    type Error = RenderError;

    fn write_str(&mut self, s: &str) -> Result<usize, Self::Error> {
        self.plain.write_str(s)
    }

    fn write_str_all(&mut self, s: &str) -> Result<(), Self::Error> {
        self.plain.write_str_all(s)
    }

    fn fail_doc(&self) -> Self::Error {
        self.plain.fail_doc()
    }
}

impl<F, I> RenderAnnotated<'_, Semantic> for AnsiWriter<F, I>
where
    F: fmt::Write,
    I: io::Write,
{
    fn push_annotation(&mut self, annotation: &Semantic) -> Result<(), Self::Error> {
        let style = annotation.to_style();
        self.stack.push(style);

        self.plain.write_fmt(format_args!("{style}"))
    }

    fn pop_annotation(&mut self) -> Result<(), Self::Error> {
        if let Some(style) = self.stack.pop() {
            self.plain.write_fmt(format_args!("{style:#}"))?;
        }

        if let Some(style) = self.stack.last() {
            self.plain.write_fmt(format_args!("{style}"))?;
        }

        Ok(())
    }
}
