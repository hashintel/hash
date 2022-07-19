//! Implementation of display, which can be either fancy or "normal", depending
//! on the type color and non ascii character can be used.
//!
//! This is inspired by [miette](https://docs.rs/miette/latest/miette/index.html)

use alloc::{borrow::ToOwned, collections::VecDeque, format, string::String, vec, vec::Vec};
use core::fmt::{Debug, Display, Formatter, Write};

#[cfg(feature = "glyph")]
use owo_colors::{colored::Color, colors::Red, OwoColorize, Stream::Stdout};

use crate::{AttachmentKind, Frame, FrameKind, Report};

enum Instruction {
    Content(String),
    Entry { end: bool },
    Vertical,
    Indent,
}

impl Instruction {
    fn plain(text: String) -> Line {
        let mut queue = VecDeque::new();
        queue.push_back(Instruction::Content(text));

        queue
    }

    #[cfg(feature = "glyph")]
    fn with_red<F: FnOnce(&mut T) -> std::io::Result<()>, T: WriteColor>(
        writer: &mut T,
        f: F,
    ) -> std::io::Result<()> {
        let mut spec = ColorSpec::new();
        spec.set_fg(Some(Color::Red)).set_bold(true);

        writer.set_color(&spec)?;
        f(writer)?;
        writer.reset()
    }

    fn render(self, fmt: &mut Formatter) -> core::fmt::Result {
        match self {
            Instruction::Content(text) => fmt.write_str(&text),
            #[cfg(feature = "glyph")]
            Instruction::Entry { end: true } => {
                "╰─▶ ".if_supports_color(Stdout, |text| text.red()).fmt(fmt)
            }
            #[cfg(not(feature = "glyph"))]
            Instruction::Entry { end: true } => fmt.write_str(r#"\->"#),
            #[cfg(feature = "glyph")]
            Instruction::Entry { end: false } => {
                "├─▶ ".if_supports_color(Stdout, |text| text.red()).fmt(fmt)
            }
            #[cfg(not(feature = "glyph"))]
            Instruction::Entry { end: false } => fmt.write_str("|-> "),
            #[cfg(feature = "glyph")]
            Instruction::Vertical => "│   ".if_supports_color(Stdout, |text| text.red()).fmt(fmt),
            #[cfg(not(feature = "glyph"))]
            Instruction::Vertical => fmt.write_str("|   "),
            Instruction::Indent => fmt.write_str("    "),
        }
    }
}

type Line = VecDeque<Instruction>;
type Lines = Vec<Line>;

#[cfg(all(nightly, feature = "std"))]
fn backtrace<'a>(frame: &'a Frame, bt: &mut Vec<&'a std::backtrace::Backtrace>) -> Option<Line> {
    if let Some(backtrace) = frame.request_ref::<std::backtrace::Backtrace>() {
        bt.push(backtrace);

        Some(Instruction::plain(format!(
            "backtrace with {} frames ({})",
            backtrace.frames().len(),
            bt.len()
        )))
    } else {
        None
    }
}

#[cfg(feature = "spantrace")]
fn spantrace<'a>(frame: &'a Frame, st: &mut Vec<&'a tracing_error::SpanTrace>) -> Option<Line> {
    if let Some(span_trace) = frame.request_ref::<tracing_error::SpanTrace>() {
        let mut span = 0;
        span_trace.with_spans(|_, _| {
            span += 1;
            true
        });

        st.push(span_trace);

        Some(Instruction::plain(format!(
            "spantrace with {span} frames ({})",
            st.len()
        )))
    } else {
        None
    }
}

// we allow needless lifetime, as in some scenarios (where spantrace and backtrace are disabled)
// the lifetime is needless, but rewriting for that case would decrease readability.
#[allow(clippy::needless_lifetimes)]
#[allow(unused_variables)]
fn frame<'a>(
    frame: &'a Frame,
    defer: &mut Vec<Lines>,
    #[cfg(all(nightly, feature = "std"))] bt: &mut Vec<&'a std::backtrace::Backtrace>,
    #[cfg(feature = "spantrace")] st: &mut Vec<&'a tracing_error::SpanTrace>,
) -> Option<Lines> {
    // We allow `unused_mut` due to the fact that certain feature configurations will require
    // this to be mutable (backtrace and spantrace overwrite extend the lines)
    #[allow(unused_mut)]
    let mut lines = match frame.kind() {
        FrameKind::Context(context) => context
            .to_string()
            .split('\n')
            .map(ToOwned::to_owned)
            .collect(),
        FrameKind::Attachment(AttachmentKind::Opaque(_)) => vec![],
        FrameKind::Attachment(AttachmentKind::Printable(attachment)) => attachment
            .to_string()
            .split('\n')
            .map(ToOwned::to_owned)
            .collect(),
    };

    // defer collection of backtrace and spantrace after all messages, so that they are always last.
    #[cfg(all(nightly, feature = "std"))]
    if let Some(backtrace) = backtrace(frame, bt) {
        defer.push(vec![backtrace]);

        return None;
    }

    #[cfg(feature = "spantrace")]
    if let Some(spantrace) = spantrace(frame, st) {
        defer.push(vec![spantrace]);

        return None;
    }

    Some(lines.into_iter().map(Instruction::plain).collect())
}

// we allow needless lifetime, as in some scenarios (where spantrace and backtrace are disabled)
// the lifetime is needless, but rewriting for that case would decrease readability.
#[allow(clippy::needless_lifetimes)]
fn frame_root<'a>(
    root: &'a Frame,
    #[cfg(all(nightly, feature = "std"))] bt: &mut Vec<&'a std::backtrace::Backtrace>,
    #[cfg(feature = "spantrace")] st: &mut Vec<&'a tracing_error::SpanTrace>,
) -> Lines {
    let mut plain = vec![root];

    let next;
    let mut ptr = root;

    // find all the frames that are part of this stack,
    // meaning collect them until we hit the end or a group of multiple frames.
    loop {
        let sources = ptr.sources();

        next = match sources {
            [] => None,
            [child] => {
                plain.push(child);
                ptr = child;
                continue;
            }
            group => Some(group),
        };

        break;
    }

    let mut groups = vec![];
    let mut defer = vec![];

    let mut opaque = 0;
    for child in plain {
        let content = frame(
            child,
            &mut defer,
            #[cfg(all(nightly, feature = "std"))]
            bt,
            #[cfg(feature = "spantrace")]
            st,
        );

        if let Some(lines) = content {
            if lines.is_empty() {
                opaque += 1;
            } else {
                groups.push(lines);
            }
        }
    }

    groups.append(&mut defer);

    match opaque {
        0 => {}
        1 => {
            groups.push(vec![Instruction::plain(
                "1 additional attachment".to_owned(),
            )]);
        }
        n => {
            groups.push(vec![Instruction::plain(format!(
                "{n} additional attachments"
            ))]);
        }
    }

    if let Some(group) = next {
        for child in group {
            let content = frame_root(
                child,
                #[cfg(all(nightly, feature = "std"))]
                bt,
                #[cfg(feature = "spantrace")]
                st,
            );

            if !content.is_empty() {
                groups.push(content);
            }
        }
    }

    // The first item is always the title,
    // after that every group gets one of the following indents: `|->`, or `\->`
    // if it is the last one.
    let total = groups.len();
    groups
        .into_iter()
        .enumerate()
        .flat_map(|(pos, content)| {
            let last = pos == total - 1;
            let first = pos == 0;

            content.into_iter().enumerate().map(move |(idx, mut line)| {
                if first {
                    // the first line is the title, therefore not indented.
                } else if last {
                    if idx == 0 {
                        line.push_front(Instruction::Entry { end: true });
                    } else {
                        line.push_front(Instruction::Indent);
                    }
                } else if idx == 0 {
                    line.push_front(Instruction::Entry { end: false });
                } else {
                    line.push_front(Instruction::Vertical);
                }

                line
            })
        })
        .collect()
}

pub fn report<C>(report: &Report<C>) -> String {
    #[cfg(all(nightly, feature = "std"))]
    let mut bt = Vec::new();
    #[cfg(feature = "spantrace")]
    let mut st = Vec::new();

    let mut lines = vec![];
    for frame in report.current_frames() {
        let display = frame_root(
            frame,
            #[cfg(all(nightly, feature = "std"))]
            &mut bt,
            #[cfg(feature = "spantrace")]
            &mut st,
        );

        lines.extend(display);
        lines.push(Instruction::plain("".to_owned()));
    }

    #[cfg(all(nightly, feature = "std"))]
    {
        lines.extend(vec!["".to_owned(); 2]);

        for (pos, backtrace) in bt.into_iter().enumerate() {
            lines.push(Instruction::plain(format!("Backtrace No. {}", pos + 1)));
            lines.extend(
                backtrace
                    .to_string()
                    .split('\n')
                    .map(ToOwned::to_owned)
                    .map(Instruction::plain),
            );
        }
    }

    #[cfg(feature = "spantrace")]
    {
        lines.extend(vec!["".to_owned(); 2]);

        for (pos, span_trace) in st.into_iter().enumerate() {
            lines.push(Instruction::plain(format!("Spantrace No. {}", pos + 1)));
            lines.extend(
                span_trace
                    .to_string()
                    .split('\n')
                    .map(ToOwned::to_owned)
                    .map(Instruction::plain),
            );
        }
    }

    lines.into_iter().fold(String::new(), |mut acc, line| {
        acc.push('\n');
        acc.push_str(&line);
        acc
    })
}

mod hook {
    use std::{
        any::{Any, Demand, Provider, TypeId},
        collections::HashMap,
        marker::PhantomData,
    };

    use crate::Frame;

    struct AnyContext {
        defer: Vec<Vec<String>>,
        inner: HashMap<TypeId, Box<dyn Any>>,
    }

    struct Context<'a, T> {
        parent: &'a mut AnyContext,
        _marker: PhantomData<T>,
    }

    impl<T> Context<T> {
        pub fn defer(&mut self, value: String) {
            self.0.push(value.split('\n').collect());
        }

        pub fn defer_lines<L: IntoIterator<Item = String>>(&mut self, lines: L) {
            self.0.push(lines.into_iter().collect())
        }
    }

    impl<T: 'static> Context<T> {
        fn get<U>(&self) -> Option<&U> {
            let id = T::type_id();

            let inner = self.parent.inner.get(&id)?;
            inner.downcast_ref()
        }

        fn get_mut<U>(&mut self) -> Option<&mut U> {
            let id = T::type_id();

            let inner = self.parent.inner.get_mut(&id)?;
            inner.downcast_mut()
        }

        fn insert<U>(&mut self, value: U) -> Option<&U> {
            let id = T::type_id();

            let inner = self.parent.inner.insert(id, Box::new(value));
            let inner = inner.as_ref()?;
            inner.downcast_ref()
        }
    }

    pub trait Hook<T> {
        fn call(&self, frame: &T, defer: &mut AnyContext) -> Option<String>;
    }

    impl<F, T> Hook<T> for F
    where
        F: Fn(&T, &mut Context<T>) -> String,
        T: Send + Sync + 'static,
    {
        fn call(&self, frame: &T, defer: &mut AnyContext) -> Option<String> {
            Some((self)(frame, defer))
        }
    }

    pub struct Stack<L, T, R> {
        left: L,
        right: R,
        _marker: PhantomData<T>,
    }

    impl<L, T, R> Hook<Frame> for Stack<L, T, R>
    where
        L: Hook<T>,
        T: Send + Sync + 'static,
        R: Hook<Frame>,
    {
        fn call(&self, frame: &Frame, defer: &mut AnyContext) -> Option<String> {
            if let Some(frame) = frame.downcast_ref::<T>() {
                self.left.call(frame, defer)
            } else {
                self.right.call(frame, defer)
            }
        }
    }

    impl<T> Hook<T> for () {
        fn call(&self, _: &T, _: &mut AnyContext) -> Option<String> {
            None
        }
    }

    pub struct Both<L, R> {
        left: L,
        right: R,
    }

    impl<L, R> Hook<Frame> for Both<L, R>
    where
        L: Hook<Frame>,
        R: Hook<Frame>,
    {
        fn call(&self, frame: &Frame, defer: &mut AnyContext) -> Option<String> {
            self.left
                .call(frame, defer)
                .or_else(|| self.right.call(frame, defer))
        }
    }

    impl Hook<Frame> for Box<dyn Hook<Frame>> {
        fn call(&self, frame: &Frame, defer: &mut AnyContext) -> Option<String> {
            let hook = self.as_ref();

            hook.call(frame, defer)
        }
    }

    struct Hooks<T: Hook<Frame>>(T);

    impl Hooks<()> {
        pub fn new() -> Self {
            Self(())
        }
    }

    impl<T: Hook<Frame>> Hooks<T> {
        fn new_with(hook: T) -> Self {
            Hooks(hook)
        }

        pub fn push<U: Hook<V>, V: Send + Sync + 'static>(self, hook: T) -> Hooks<Stack<U, V, T>> {
            let stack = Stack {
                left: hook,
                right: self.0,
                _marker: PhantomData::default(),
            };

            Hooks::new_with(stack)
        }

        pub fn append<U: Hook<Frame>>(self, other: Hooks<U>) -> Hooks<Both<T, U>> {
            let both = Both {
                left: self.0,
                right: other.0,
            };

            Hooks::new_with(both)
        }
    }

    impl<T: Hook<Frame> + 'static> Hooks<T> {
        pub fn erase(self) -> ErasedHooks {
            Hooks::new_with(Box::new(self.0))
        }
    }

    type ErasedHooks = Hooks<Box<dyn Hook<Frame>>>;

    mod builtin {
        #[cfg(all(nightly, feature = "std"))]
        use std::backtrace::Backtrace;

        #[cfg(feature = "spantrace")]
        use tracing_error::SpanTrace;

        use crate::fmt::hook::{AnyContext, Context};

        #[cfg(all(nightly, feature = "std"))]
        fn backtrace(backtrace: &Backtrace, ctx: &mut Context<Backtrace>) -> String {
            let idx = match ctx.get::<usize>().copied() {
                None => {
                    ctx.insert(0);
                    0
                }
                Some(idx) => idx,
            };

            ctx.defer(format!("Backtrace No. {}\n{}", idx + 1, backtrace));
            ctx.insert(idx + 1);

            format!(
                "backtrace with {} frames ({})",
                backtrace.frames().len(),
                idx + 1
            )
        }

        #[cfg(feature = "spantrace")]
        fn spantrace(spantrace: &SpanTrace, ctx: &mut Context<SpanTrace>) -> String {
            let idx = match ctx.get::<usize>().copied() {
                None => {
                    ctx.insert(0);
                    0
                }
                Some(idx) => idx,
            };

            let mut span = 0;
            spantrace.with_spans(|_, _| {
                span += 1;
                true
            });

            ctx.defer(format!("Span Trace No. {}\n{}", idx + 1, spantrace));
            ctx.insert(idx + 1);

            format!("spantrace with {span} frames ({})", idx + 1)
        }
    }
}
