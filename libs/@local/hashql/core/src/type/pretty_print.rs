use std::io;

use anstyle::{AnsiColor, Color, Style};
use pretty::{RcDoc, Render, RenderAnnotated};

use super::Type;
use crate::arena::Arena;

pub(crate) const BLUE: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::Blue)));
pub(crate) const CYAN: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::Cyan)));
pub(crate) const ORANGE: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::BrightYellow)));
pub(crate) const GRAY: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::BrightBlack)));
pub(crate) const RED: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::BrightRed)));

struct WriteColored<W> {
    stack: Vec<Style>,
    inner: W,
}

impl<W> WriteColored<W> {
    const fn new(inner: W) -> Self {
        Self {
            stack: Vec::new(),
            inner,
        }
    }
}

#[expect(clippy::renamed_function_params)]
impl<W> Render for WriteColored<W>
where
    W: io::Write,
{
    type Error = io::Error;

    fn write_str(&mut self, string: &str) -> Result<usize, Self::Error> {
        self.inner.write(string.as_bytes())
    }

    fn write_str_all(&mut self, string: &str) -> Result<(), Self::Error> {
        self.inner.write_all(string.as_bytes())
    }

    fn fail_doc(&self) -> Self::Error {
        io::Error::other("Document failed to render")
    }
}

impl<W> RenderAnnotated<'_, Style> for WriteColored<W>
where
    W: io::Write,
{
    fn push_annotation(&mut self, annotation: &'_ Style) -> Result<(), Self::Error> {
        self.stack.push(*annotation);
        annotation.write_to(&mut self.inner)
    }

    fn pop_annotation(&mut self) -> Result<(), Self::Error> {
        if let Some(annotation) = self.stack.pop() {
            annotation.write_reset_to(&mut self.inner)?;
        }

        match self.stack.last() {
            Some(annotation) => annotation.write_to(&mut self.inner),
            None => Ok(()),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct RecursionLimit {
    depth: usize,
    limit: usize,
}

impl RecursionLimit {
    pub(crate) fn pretty<'a, T>(self, node: &'a T, arena: &'a Arena<Type>) -> RcDoc<'a, Style>
    where
        T: PrettyPrint,
    {
        if self.depth >= self.limit {
            RcDoc::text("...")
        } else {
            node.pretty(arena, self.enter())
        }
    }

    const fn enter(self) -> Self {
        Self {
            depth: self.depth + 1,
            limit: self.limit,
        }
    }
}

pub(crate) trait PrettyPrint {
    fn pretty<'a>(&'a self, arena: &'a Arena<Type>, limit: RecursionLimit) -> RcDoc<'a, Style>;

    fn pretty_print(&self, arena: &Arena<Type>, width: usize) -> String {
        let mut output = Vec::new();
        let mut writer = WriteColored::new(&mut output);

        self.pretty(
            arena,
            RecursionLimit {
                depth: 0,
                limit: 32,
            },
        )
        .render_raw(width, &mut writer)
        .expect(
            "should not fail during diagnostic rendering - if it does, this indicates a bug in \
             the pretty printer",
        );

        String::from_utf8(output)
            .expect("should never fail as all bytes come from valid UTF-8 strings")
    }
}
