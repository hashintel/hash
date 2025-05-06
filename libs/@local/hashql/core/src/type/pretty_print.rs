use std::io;

use anstyle::{AnsiColor, Color, Style};
use pretty::{RcDoc, Render, RenderAnnotated};

use super::{environment::Environment, recursion::RecursionDepthBoundary};

pub(crate) const BLUE: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::Blue)));
pub(crate) const CYAN: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::Cyan)));
pub(crate) const RED: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::Red)));
pub(crate) const ORANGE: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::BrightYellow)));
pub(crate) const GRAY: Style = Style::new().fg_color(Some(Color::Ansi(AnsiColor::BrightBlack)));

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

pub trait PrettyPrint {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, Style>;

    fn pretty_print(&self, env: &Environment, width: usize) -> String {
        let mut output = Vec::new();
        let mut writer = WriteColored::new(&mut output);

        self.pretty(
            env,
            RecursionDepthBoundary {
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

impl<T> PrettyPrint for &T
where
    T: PrettyPrint,
{
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, Style> {
        T::pretty(self, env, limit)
    }
}
