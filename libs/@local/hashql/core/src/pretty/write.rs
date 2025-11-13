use core::{fmt, mem};
use std::io;

use anstyle::{Effects, RgbColor, Style};
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

pub(super) trait RenderFormat: Render {
    fn write_fmt(&mut self, args: fmt::Arguments<'_>) -> Result<(), Self::Error>;
}

enum Backend<F, I> {
    Fmt(F),
    Io(I),
}

/// Writer that outputs plain text without styling.
///
/// Provides a unified interface over both [`fmt::Write`] and [`io::Write`]
/// backends, serving as the base layer for more specialized writers like
/// [`AnsiWriter`] and [`HtmlFragmentWriter`].
pub(super) struct PlainWriter<F, I> {
    backend: Backend<F, I>,
}

impl<I> PlainWriter<Never, I> {
    /// Creates a new plain writer using an [`io::Write`] backend.
    pub(super) const fn new_io(inner: I) -> Self {
        Self {
            backend: Backend::Io(inner),
        }
    }
}

impl<F> PlainWriter<F, Never> {
    /// Creates a new plain writer using a [`fmt::Write`] backend.
    pub(super) const fn new_fmt(inner: F) -> Self {
        Self {
            backend: Backend::Fmt(inner),
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

impl<F, I> RenderFormat for PlainWriter<F, I>
where
    F: fmt::Write,
    I: io::Write,
{
    fn write_fmt(&mut self, args: fmt::Arguments<'_>) -> Result<(), Self::Error> {
        match &mut self.backend {
            Backend::Fmt(fmt) => fmt.write_fmt(args).map_err(RenderError::Fmt),
            Backend::Io(io) => io.write_fmt(args).map_err(RenderError::Io),
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

/// Writer that renders documents with ANSI escape codes for terminal colors.
///
/// Converts semantic annotations (keywords, types, operators, etc.) into
/// ANSI terminal escape codes.
pub(super) struct AnsiWriter<R> {
    stack: Vec<Style>,
    inner: R,
}

impl<R> AnsiWriter<R> {
    /// Creates a new ANSI writer wrapping the given writer.
    pub(super) const fn new(inner: R) -> Self {
        Self {
            stack: Vec::new(),
            inner,
        }
    }
}

impl<R> Render for AnsiWriter<R>
where
    R: Render,
{
    type Error = R::Error;

    fn write_str(&mut self, s: &str) -> Result<usize, Self::Error> {
        self.inner.write_str(s)
    }

    fn write_str_all(&mut self, s: &str) -> Result<(), Self::Error> {
        self.inner.write_str_all(s)
    }

    fn fail_doc(&self) -> Self::Error {
        self.inner.fail_doc()
    }
}

impl<R> RenderFormat for AnsiWriter<R>
where
    R: RenderFormat,
{
    fn write_fmt(&mut self, args: fmt::Arguments<'_>) -> Result<(), Self::Error> {
        self.inner.write_fmt(args)
    }
}

impl<R> RenderAnnotated<'_, Semantic> for AnsiWriter<R>
where
    R: RenderFormat,
{
    fn push_annotation(&mut self, annotation: &Semantic) -> Result<(), Self::Error> {
        let style = annotation.to_style();
        self.stack.push(style);

        self.inner.write_fmt(format_args!("{style}"))
    }

    fn pop_annotation(&mut self) -> Result<(), Self::Error> {
        if let Some(style) = self.stack.pop() {
            self.inner.write_fmt(format_args!("{style:#}"))?;
        }

        if let Some(style) = self.stack.last() {
            self.inner.write_fmt(format_args!("{style}"))?;
        }

        Ok(())
    }
}

/// Writer that renders documents as HTML `<span>` fragments with inline styles.
///
/// Converts semantic annotations into HTML `<span>` elements with CSS styling,
/// producing output suitable for embedding in an SVG `<text>` element. Does not
/// produce complete HTML documents - only the styled text fragments.
///
/// # XML Escaping
///
/// This writer does **not** escape XML special characters. Text content should
/// be wrapped in [`XmlEscapingWriter`] if it may contain `<`, `>`, `&`, etc.
/// This separation allows composition with other SVG-generating code.
///
/// # Color Conversion
///
/// Uses the VGA color palette for converting ANSI colors to RGB values,
/// providing reasonable defaults for terminal-style syntax highlighting.
///
/// # Unsupported Features
///
/// - Blink effect (silently ignored)
pub(super) struct HtmlFragmentWriter<R> {
    depth: usize,
    inner: R,
}

impl<R> HtmlFragmentWriter<R>
where
    R: RenderFormat,
{
    fn write_style(&mut self, style: Style) -> Result<(), R::Error> {
        let mut foreground = style.get_fg_color();
        let mut background = style.get_bg_color();
        let mut text_decoration = 0_u8;

        for effect in style.get_effects().iter() {
            #[expect(clippy::match_same_arms, reason = "clarity")]
            match effect {
                Effects::BOLD => {
                    self.inner.write_str_all("font-weight:bold;")?;
                }
                Effects::DIMMED => {
                    self.inner.write_str_all("opacity:0.5;")?;
                }
                Effects::ITALIC => {
                    self.inner.write_str_all("font-style:italic;")?;
                }
                Effects::UNDERLINE => {
                    text_decoration |= 0b1;
                }
                Effects::DOUBLE_UNDERLINE => {
                    text_decoration |= 0b1;
                    self.inner.write_str_all("text-decoration-style:double;")?;
                }
                Effects::CURLY_UNDERLINE => {
                    text_decoration |= 0b1;
                    self.inner.write_str_all("text-decoration-style:wavy;")?;
                }
                Effects::DOTTED_UNDERLINE => {
                    text_decoration |= 0b1;
                    self.inner.write_str_all("text-decoration-style:dotted;")?;
                }
                Effects::DASHED_UNDERLINE => {
                    text_decoration |= 0b1;
                    self.inner.write_str_all("text-decoration-style:dashed;")?;
                }
                Effects::BLINK => {
                    // Blink is unsupported
                }
                Effects::INVERT => {
                    mem::swap(&mut foreground, &mut background);
                }
                Effects::HIDDEN => {
                    self.inner.write_str_all("visibility:hidden;")?;
                }
                Effects::STRIKETHROUGH => {
                    text_decoration |= 0b10;
                }
                _ => {}
            }
        }

        #[expect(clippy::min_ident_chars, reason = "well established")]
        if let Some(foreground) = foreground {
            let RgbColor(r, g, b) =
                anstyle_lossy::color_to_rgb(foreground, anstyle_lossy::palette::VGA);

            self.inner
                .write_fmt(format_args!("color:#{r:02x}{g:02x}{b:02x};"))?;
        }

        #[expect(clippy::min_ident_chars, reason = "well established")]
        if let Some(background) = background {
            let RgbColor(r, g, b) =
                anstyle_lossy::color_to_rgb(background, anstyle_lossy::palette::VGA);

            self.inner
                .write_fmt(format_args!("background-color:#{r:02x}{g:02x}{b:02x};"))?;
        }

        if text_decoration != 0 {
            self.inner.write_str_all("text-decoration-line:")?;
            if text_decoration & 0b1 != 0 {
                self.inner.write_str_all("underline ")?;
            }
            if text_decoration & 0b10 != 0 {
                self.inner.write_str_all("line-through ")?;
            }
            self.inner.write_str_all(";")?;
        }

        Ok(())
    }
}

impl<R> HtmlFragmentWriter<R> {
    /// Creates a new HTML fragment writer wrapping the given writer.
    pub(super) const fn new(inner: R) -> Self {
        Self { depth: 0, inner }
    }
}

impl<R> Render for HtmlFragmentWriter<R>
where
    R: Render,
{
    type Error = R::Error;

    fn write_str(&mut self, s: &str) -> Result<usize, Self::Error> {
        self.inner.write_str(s)
    }

    fn write_str_all(&mut self, s: &str) -> Result<(), Self::Error> {
        self.inner.write_str_all(s)
    }

    fn fail_doc(&self) -> Self::Error {
        self.inner.fail_doc()
    }
}

impl<R> RenderFormat for HtmlFragmentWriter<R>
where
    R: RenderFormat,
{
    fn write_fmt(&mut self, args: fmt::Arguments<'_>) -> Result<(), Self::Error> {
        self.inner.write_fmt(args)
    }
}

impl<R> RenderAnnotated<'_, Semantic> for HtmlFragmentWriter<R>
where
    R: RenderFormat,
{
    fn push_annotation(&mut self, annotation: &Semantic) -> Result<(), Self::Error> {
        let style = annotation.to_style();
        self.depth += 1;

        self.inner.write_str_all("<span style=\"")?;
        self.write_style(style)?;
        self.inner.write_str_all("\">")
    }

    fn pop_annotation(&mut self) -> Result<(), Self::Error> {
        if let Some(depth) = self.depth.checked_sub(1) {
            self.depth = depth;
            self.inner.write_str_all("</span>")?;
        }

        Ok(())
    }
}

/// Writer that escapes XML special characters in text content.
///
///
/// # XML Escaping
///
/// Escapes `<`, `>`, `&`, `"`, and `'` to their entity references.
pub(super) struct XmlEscapingWriter<R> {
    inner: R,
}

impl<R> XmlEscapingWriter<R> {
    /// Creates a new styled writer.
    pub(super) const fn new(inner: R) -> Self {
        Self { inner }
    }

    #[expect(
        clippy::string_slice,
        reason = "indices are checked to not be utf boundaries"
    )]
    fn write_str_escaped(&mut self, value: &str) -> Result<usize, R::Error>
    where
        R: Render,
    {
        let mut start = 0;

        for (index, byte) in value.bytes().enumerate() {
            let escape = match byte {
                b'<' => "&lt;",
                b'>' => "&gt;",
                b'&' => "&amp;",
                b'"' => "&quot;",
                b'\'' => "&apos;",
                _ => continue,
            };

            // Check if we completely flush the existing content
            let slice = &value[start..index];
            let length = self.inner.write_str(slice)?;
            if length != slice.len() {
                // We weren't able to flush the entire slice, but also haven't written the escape
                // sequence yet, bail with the total amount of written bytes
                return Ok(start + length);
            }

            // We **need** to write the escape sequence atomically.
            // If this fails, the entire rendering operation will abort,
            // so partial state is acceptable.
            self.inner.write_str_all(escape)?;

            // Reset the start index to the current position
            start = index + 1;
        }

        // Flush again (and check if we wrote everything)
        let length = self.inner.write_str(&value[start..])?;
        Ok(start + length)
    }
}

impl<R> Render for XmlEscapingWriter<R>
where
    R: Render,
{
    type Error = R::Error;

    fn write_str(&mut self, s: &str) -> Result<usize, Self::Error> {
        self.write_str_escaped(s)
    }

    #[expect(
        clippy::string_slice,
        reason = "indices are checked to not be utf boundaries"
    )]
    fn write_str_all(&mut self, mut s: &str) -> Result<(), Self::Error> {
        while !s.is_empty() {
            let count = self.write_str_escaped(s)?;
            s = &s[count..];
        }

        Ok(())
    }

    fn fail_doc(&self) -> Self::Error {
        self.inner.fail_doc()
    }
}

impl<'alloc, R, A> RenderAnnotated<'alloc, A> for XmlEscapingWriter<R>
where
    R: RenderAnnotated<'alloc, A>,
{
    fn push_annotation(&mut self, annotation: &'alloc A) -> Result<(), Self::Error> {
        self.inner.push_annotation(annotation)
    }

    fn pop_annotation(&mut self) -> Result<(), Self::Error> {
        self.inner.pop_annotation()
    }
}
