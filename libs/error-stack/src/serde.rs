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

#[cfg(any(feature = "std", feature = "hooks"))]
use alloc::boxed::Box;
use alloc::{format, string::String, vec, vec::Vec};
#[cfg(any(feature = "std", feature = "hooks"))]
use core::cell::RefCell;
use core::iter::once;
#[cfg(not(any(feature = "std", feature = "hooks")))]
use core::marker::PhantomData;

#[cfg(any(feature = "std", feature = "hooks"))]
pub use hook::HookContext;
#[cfg(any(feature = "std", feature = "hooks"))]
pub(crate) use hook::{install_builtin_serde_hooks, Serde, SerdeHooks, SerializeFn};
use serde::{
    ser::{SerializeMap, SerializeSeq},
    Serialize, Serializer,
};

#[cfg(any(feature = "std", feature = "hooks"))]
use crate::fmt;
use crate::{fmt::debug_attachments_invoke, Context, Frame, FrameKind, Report};

#[cfg(any(feature = "std", feature = "hooks"))]
enum SerializedAttachment<'a> {
    Erased(Box<dyn erased_serde::Serialize + 'a>),
    String(String),
}

#[cfg(any(feature = "std", feature = "hooks"))]
impl Serialize for SerializedAttachment<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Erased(erased) => erased.serialize(serializer),
            Self::String(string) => string.serialize(serializer),
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
            Self::Left(left) => left.next(),
            Self::Right(right) => right.next(),
        }
    }
}

#[cfg(any(feature = "std", feature = "hooks"))]
struct SerializeHooks<'a> {
    hooks: &'a SerdeHooks,
    context: &'a mut HookContext<Frame>,
    format: &'a mut fmt::config::Config,
}

#[cfg(any(feature = "std", feature = "hooks"))]
fn serialize_attachment<'a>(
    hooks: &'a SerdeHooks,
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
fn serialize_attachment(frame: &Frame) -> impl Iterator<Item = String> + '_ {
    // we weren't able to find a serializer and will fallback to the debug representation if
    // possible
    let (_, attachments) = debug_attachments_invoke(once(frame));

    attachments.into_iter()
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
        let mut hooks_ref = self.hooks.borrow_mut();
        let hooks = hooks_ref.hooks;
        let context = &mut *hooks_ref.context;

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
            for attachment in serialize_attachment(frame) {
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
            #[cfg(not(any(feature = "std", feature = "hooks")))]
            hooks: PhantomData,
        })?;
        map.serialize_entry("sources", &SerializeSources {
            frames: sources,
            #[cfg(any(feature = "std", feature = "hooks"))]
            hooks,
            #[cfg(not(any(feature = "std", feature = "hooks")))]
            hooks: PhantomData,
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
                #[cfg(not(any(feature = "std", feature = "hooks")))]
                hooks: PhantomData,
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
            hooks: PhantomData,
        }
        .serialize(serializer)
    }
}
