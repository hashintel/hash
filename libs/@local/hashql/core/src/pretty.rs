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

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Default)]
pub enum PrettyRecursionGuardStrategy {
    DepthCounting,
    #[default]
    IdentityTracking,
}

#[derive(Debug)]
enum RecursionGuardState {
    Depth(usize),
    Reference(FastHashSet<usize>),
}

impl RecursionGuardState {
    fn enter<T>(&mut self, value: &T) -> bool {
        match self {
            Self::Depth(depth) => {
                *depth += 1;
                true
            }
            Self::Reference(set) => set.insert(core::ptr::from_ref(value).addr()),
        }
    }

    fn exit<T>(&mut self, value: &T) {
        match self {
            Self::Depth(depth) => *depth -= 1,
            Self::Reference(set) => {
                set.remove(&core::ptr::from_ref(value).addr());
            }
        }
    }

    fn depth(&self) -> usize {
        match self {
            Self::Depth(depth) => *depth,
            Self::Reference(set) => set.len(),
        }
    }
}

impl From<PrettyRecursionGuardStrategy> for RecursionGuardState {
    fn from(tracking: PrettyRecursionGuardStrategy) -> Self {
        match tracking {
            PrettyRecursionGuardStrategy::DepthCounting => Self::Depth(0),
            PrettyRecursionGuardStrategy::IdentityTracking => {
                Self::Reference(FastHashSet::default())
            }
        }
    }
}

#[derive(Debug)]
pub struct PrettyRecursionBoundary {
    visited: RecursionGuardState,
    limit: Option<usize>,
}

impl PrettyRecursionBoundary {
    #[must_use]
    pub fn new(tracking: PrettyRecursionGuardStrategy, limit: Option<usize>) -> Self {
        Self {
            visited: tracking.into(),
            limit,
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
        if !self.visited.enter(value) {
            return RcDoc::text("...");
        }

        if let Some(limit) = self.limit
            && self.visited.depth() >= limit
        {
            // proper cleanup
            self.visited.exit(value);
            return RcDoc::text("...");
        }

        let document = call(value, env, self);

        self.visited.exit(value);
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

        // untracked to properly allow for recursion detection
        r#type.kind.pretty_generic(env, self, arguments)
    }

    #[inline]
    pub fn pretty<'heap, T>(&mut self, env: &Environment<'heap>, value: &T) -> RcDoc<'heap, Style>
    where
        T: PrettyPrint<'heap>,
    {
        self.track(env, value, PrettyPrint::pretty)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Default)]
pub struct PrettyOptions {
    pub indent: u8 = 4,
    pub max_width: usize = 80,

    pub recursion_limit: Option<usize> = Some(32),
    pub recursion_strategy: PrettyRecursionGuardStrategy
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
        RcDoc::line_()
            .append(arguments.pretty(env, boundary))
            .append(self.pretty(env, boundary))
    }

    fn pretty_print(&self, env: &Environment<'heap>, options: PrettyOptions) -> String {
        let mut output = Vec::new();
        let mut writer = WriteColored::new(&mut output);

        self.pretty(
            env,
            &mut PrettyRecursionBoundary::new(options.recursion_strategy, options.recursion_limit),
        )
        .render_raw(options.max_width, &mut writer)
        .expect(
            "should not fail during diagnostic rendering - if it does, this indicates a bug in \
             the pretty printer",
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
