//! Implementation of general [`Report`] serialization.
//!
//! The value can be of any type, currently only printable attachments and context are supported, in
//! the near future any values will be supported through the use of hooks.
//!
//! The serialized [`Report`] is a list of all current sources with the following output:
//!
//! ```json
//! {
//!     "context": "context display output",
//!     "attachments": ["all", "attachments", "leading", "up", "to", "this", "context"],
//!     "sources": [] // recursive render using `frame.sources()`
//! }
//! ```

#[cfg(any(feature = "std", feature = "hooks"))]
mod hook;

use alloc::{boxed::Box, format, string::String, vec, vec::Vec};
use core::{cell::RefCell, iter::once, marker::PhantomData};

#[cfg(any(feature = "std", feature = "hooks"))]
pub use hook::HookContext;
#[cfg(any(feature = "std", feature = "hooks"))]
pub(crate) use hook::{DynamicFn, Hooks};
use serde::{
    ser::{SerializeMap, SerializeSeq},
    Serialize, Serializer,
};

use crate::{
    fmt, fmt::debug_attachments_invoke, serde::hook::Serde, Context, Frame, FrameKind, Report,
};

enum SerializedAttachment<'a> {
    #[cfg(any(feature = "std", feature = "hooks"))]
    Erased(Box<dyn erased_serde::Serialize + 'a>),
    String(String),
}

impl Serialize for SerializedAttachment<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            #[cfg(any(feature = "std", feature = "hooks"))]
            SerializedAttachment::Erased(erased) => erased.serialize(serializer),
            SerializedAttachment::String(string) => string.serialize(serializer),
        }
    }
}

#[cfg(any(feature = "std", feature = "hooks"))]
enum EitherIterator<T, U>
where
    T: Iterator<Item = U::Item>,
    U: Iterator,
{
    Left(T),
    Right(U),
}

#[cfg(any(feature = "std", feature = "hooks"))]
impl<T, U> Iterator for EitherIterator<T, U>
where
    T: Iterator<Item = U::Item>,
    U: Iterator,
{
    type Item = T::Item;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            EitherIterator::Left(left) => left.next(),
            EitherIterator::Right(right) => right.next(),
        }
    }
}

#[cfg(any(feature = "std", feature = "hooks"))]
fn serialize_attachment<'a>(
    hooks: &'a Hooks,
    frame: &'a Frame,
    context: &'a mut HookContext<Frame>,
) -> impl Iterator<Item = SerializedAttachment<'a>> + 'a {
    let mut attachments = hooks
        .call(frame, context)
        .map(SerializedAttachment::Erased)
        .peekable();

    let has_attachments = attachments.peek().is_some();

    if has_attachments {
        EitherIterator::Left(attachments)
    } else {
        // we weren't able to find a serializer and will fallback to the debug representation if
        // possible
        let mut debug_context = fmt::HookContext::new(fmt::Format::new(false));
        let (_, attachments) = debug_attachments_invoke(once(frame), debug_context.cast());

        EitherIterator::Right(attachments.into_iter().map(SerializedAttachment::String))
    }
}

#[cfg(not(any(feature = "std", feature = "hooks")))]
fn serialize_attachment<'a>(frame: &'a Frame) -> impl Iterator<Item = String> + 'a {
    // we weren't able to find a serializer and will fallback to the debug representation if
    // possible
    let mut debug_context = fmt::HookContext::new(fmt::Format::new(false));
    let (_, attachments) = debug_attachments_invoke(once(frame), debug_context.cast());

    attachments.into_iter()
}

#[cfg(any(feature = "std", feature = "hooks"))]
struct SerializeHooks<'a> {
    hooks: &'a Hooks,
    context: &'a mut HookContext<Frame>,
}

struct SerializeAttachmentList<'a, 'b, 'c> {
    frames: &'a [&'b Frame],
    #[cfg(any(feature = "std", feature = "hooks"))]
    hooks: &'c RefCell<SerializeHooks<'c>>,
    #[cfg(not(any(feature = "std", feature = "hooks")))]
    hooks: PhantomData<&'c ()>,
}

#[cfg(any(feature = "std", feature = "hooks"))]
impl<'a, 'b, 'c> Serialize for SerializeAttachmentList<'a, 'b, 'c> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut h = self.hooks.borrow_mut();
        let hooks = h.hooks;
        let context = &mut h.context;

        let mut seq = serializer.serialize_seq(None)?;

        for frame in self.frames {
            for attachment in serialize_attachment(hooks, frame, context) {
                seq.serialize_element(&attachment)?;
            }
        }

        seq.end()
    }
}

#[cfg(not(any(feature = "std", feature = "hooks")))]
impl<'a, 'b, 'c> Serialize for SerializeAttachmentList<'a, 'b, 'c> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut seq = serializer.serialize_seq(None)?;

        for frame in self.frames {
            for attachment in serialize_attachment(hooks) {
                seq.serialize_element(&attachment)?;
            }
        }

        seq.end()
    }
}

struct SerializeContext<'a, 'b> {
    attachments: Vec<&'a Frame>,
    context: &'a dyn Context,
    sources: &'a [Frame],
    #[cfg(any(feature = "std", feature = "hooks"))]
    hooks: &'b RefCell<SerializeHooks<'b>>,
    #[cfg(not(any(feature = "std", feature = "hooks")))]
    hooks: PhantomData<&'b ()>,
}

impl<'a, 'b> Serialize for SerializeContext<'a, 'b> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let context = self.context;
        let sources = self.sources;
        #[cfg(any(feature = "std", feature = "hooks"))]
        let hooks = &self.hooks;

        let mut map = serializer.serialize_map(Some(3))?;
        map.serialize_entry("context", &format!("{context}").as_str())?;
        map.serialize_entry("attachments", &&mut SerializeAttachmentList {
            frames: &self.attachments[..],
            #[cfg(any(feature = "std", feature = "hooks"))]
            hooks,
        })?;
        map.serialize_entry("sources", &SerializeSources {
            frames: sources,
            #[cfg(any(feature = "std", feature = "hooks"))]
            hooks,
        })?;

        map.end()
    }
}

struct SerializeSources<'a, 'b> {
    frames: &'a [Frame],
    #[cfg(any(feature = "std", feature = "hooks"))]
    hooks: &'b RefCell<SerializeHooks<'b>>,
    #[cfg(not(any(feature = "std", feature = "hooks")))]
    hooks: PhantomData<&'b ()>,
}

impl<'a, 'b> Serialize for SerializeSources<'a, 'b> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.collect_seq(self.frames.iter().flat_map(|source| {
            find_next(
                &[],
                source,
                #[cfg(any(feature = "std", feature = "hooks"))]
                self.hooks,
            )
        }))
    }
}

// find the next applicable context and return the serializer
fn find_next<'a, 'b>(
    head: &[&'a Frame],
    mut current: &'a Frame,
    #[cfg(any(feature = "std", feature = "hooks"))] hooks: &'b RefCell<SerializeHooks<'b>>,
) -> Vec<SerializeContext<'a, 'b>> {
    let mut attachments = vec![];
    attachments.extend(head);

    loop {
        if let FrameKind::Context(context) = current.kind() {
            // found the context, return all attachments (reversed)
            attachments.reverse();

            return vec![SerializeContext {
                attachments,
                context,
                sources: current.sources(),
                #[cfg(any(feature = "std", feature = "hooks"))]
                hooks,
            }];
        } else if current.sources().len() > 1 {
            // current is an attachment, add to attachments and recursively probe
            attachments.push(current);

            return current
                .sources()
                .iter()
                .flat_map(|source| {
                    find_next(
                        &attachments,
                        source,
                        #[cfg(any(feature = "std", feature = "hooks"))]
                        hooks,
                    )
                })
                .collect();
        } else if current.sources().len() == 1 {
            attachments.push(current);

            current = &current.sources()[0];
        } else {
            // there are no more frames, therefore we need to abandon
            // this is theoretically impossible (the bottom is always a context), but not enforced
            return vec![];
        }
    }
}

#[cfg(any(feature = "std", feature = "hooks"))]
impl<C: Context> Serialize for Report<C> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        Report::invoke_serde_hook(|hooks| {
            let mut context = HookContext::new(Serde {});
            let serialize_hooks = SerializeHooks {
                hooks,
                context: context.cast(),
            };

            SerializeSources {
                frames: self.current_frames(),
                hooks: &RefCell::new(serialize_hooks),
            }
            .serialize(serializer)
        })
    }
}

#[cfg(not(any(feature = "std", feature = "hooks")))]
impl<C: Context> Serialize for Report<C> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        SerializeSources {
            frames: self.current_frames(),
        }
        .serialize(serializer)
    }
}
