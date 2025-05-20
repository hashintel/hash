use std::io;

use ::pretty::{RcDoc, Render, RenderAnnotated};
use anstyle::{AnsiColor, Color, Style};

use crate::{
    collection::FastHashSet,
    r#type::{TypeId, environment::Environment, kind::GenericArguments},
};

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

pub struct PrettyRecursionBoundary {
    visited: FastHashSet<usize>,
    limit: Option<usize>,
}

impl PrettyRecursionBoundary {
    #[must_use]
    pub fn new() -> Self {
        Self {
            visited: FastHashSet::default(),
            limit: None,
        }
    }

    #[must_use]
    pub fn with_limit(limit: usize) -> Self {
        Self {
            visited: FastHashSet::default(),
            limit: Some(limit),
        }
    }

    fn track<'heap, T>(
        &mut self,
        env: &Environment<'heap>,
        value: &T,
        call: impl FnOnce(&T, &Environment<'heap>, &mut Self) -> RcDoc<'heap, Style>,
    ) -> RcDoc<'heap, Style>
    where
        T: PrettyPrint<'heap>,
    {
        let address = (&raw const value).addr();

        if !self.visited.insert(address) {
            return RcDoc::text("...");
        }

        if let Some(limit) = self.limit
            && self.visited.len() >= limit
        {
            // proper cleanup
            self.visited.remove(&address);
            return RcDoc::text("...");
        }

        let document = call(value, env, self);

        self.visited.remove(&address);
        document
    }

    #[inline]
    pub fn pretty_type<'heap>(
        &mut self,
        env: &Environment<'heap>,
        id: TypeId,
    ) -> RcDoc<'heap, Style> {
        let r#type = env.r#type(id);

        self.pretty(env, r#type.kind) // using `kind` is strategic here, that way the reference is tracked
    }

    #[inline]
    pub fn pretty_generic_type<'heap>(
        &mut self,
        env: &Environment<'heap>,
        id: TypeId,
        arguments: GenericArguments<'heap>,
    ) -> RcDoc<'heap, Style> {
        let r#type = env.r#type(id);

        // using `kind` is strategic here, that way the reference is tracked
        self.track(env, r#type.kind, |value, env, this| {
            value.pretty_generic(env, this, arguments)
        })
    }

    #[inline]
    pub fn pretty<'heap, T>(&mut self, env: &Environment<'heap>, value: &T) -> RcDoc<'heap, Style>
    where
        T: PrettyPrint<'heap>,
    {
        self.track(env, value, PrettyPrint::pretty)
    }
}

impl Default for PrettyRecursionBoundary {
    fn default() -> Self {
        Self::new()
    }
}

pub trait PrettyPrint<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, Style>;

    fn pretty_generic(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
        arguments: GenericArguments<'heap>,
    ) -> RcDoc<'heap, Style> {
        arguments
            .pretty(env, boundary)
            .append(self.pretty(env, boundary))
            .group()
    }

    fn pretty_print(&self, env: &Environment<'heap>, width: usize) -> String {
        let mut output = Vec::new();
        let mut writer = WriteColored::new(&mut output);

        self.pretty(env, &mut PrettyRecursionBoundary::with_limit(32))
            .render_raw(width, &mut writer)
            .expect(
                "should not fail during diagnostic rendering - if it does, this indicates a bug \
                 in the pretty printer",
            );

        String::from_utf8(output)
            .expect("should never fail as all bytes come from valid UTF-8 strings")
    }
}

impl<'heap, T> PrettyPrint<'heap> for &T
where
    T: PrettyPrint<'heap>,
{
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, Style> {
        T::pretty(self, env, boundary)
    }

    fn pretty_generic(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
        arguments: GenericArguments<'heap>,
    ) -> RcDoc<'heap, Style> {
        T::pretty_generic(self, env, boundary, arguments)
    }
}
