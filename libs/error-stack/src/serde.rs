#![expect(deprecated, reason = "We use `Context` to maintain compatibility")]

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

use alloc::{format, vec, vec::Vec};

use serde::{Serialize, Serializer, ser::SerializeMap as _};

use crate::{AttachmentKind, Context, Frame, FrameKind, Report};

struct SerializeAttachment<'a>(&'a Frame);

impl Serialize for SerializeAttachment<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let Self(frame) = self;

        match frame.kind() {
            FrameKind::Context(_) => {
                // TODO: for now `Error` is unsupported, upcoming PR will fix via hooks
                // `SerializeAttachmentList` ensures that no context is ever serialized
                unimplemented!()
            }
            FrameKind::Attachment(AttachmentKind::Opaque(_)) => {
                // TODO: for now opaque attachments are unsupported, upcoming PR will fix that
                // `SerializeAttachmentList` ensures that no such attachment is added
                unimplemented!()
            }
            FrameKind::Attachment(AttachmentKind::Printable(attachment)) => {
                format!("{attachment}").serialize(serializer)
            }
        }
    }
}

struct SerializeAttachmentList<'a, 'b>(&'a [&'b Frame]);

impl Serialize for SerializeAttachmentList<'_, '_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.collect_seq(
            self.0
                .iter()
                .copied()
                .filter(|attachment| {
                    // for now opaque attachments are ignored
                    !matches!(
                        attachment.kind(),
                        FrameKind::Attachment(AttachmentKind::Opaque(_))
                    )
                })
                .map(SerializeAttachment),
        )
    }
}

struct SerializeContext<'a> {
    attachments: Vec<&'a Frame>,
    context: &'a dyn Context,
    sources: &'a [Frame],
}

impl Serialize for SerializeContext<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let Self {
            context,
            attachments,
            sources,
        } = self;

        let mut map = serializer.serialize_map(Some(3))?;
        map.serialize_entry("context", &format!("{context}").as_str())?;
        map.serialize_entry("attachments", &SerializeAttachmentList(attachments))?;
        map.serialize_entry("sources", &SerializeSources(sources))?;

        map.end()
    }
}

struct SerializeSources<'a>(&'a [Frame]);

impl Serialize for SerializeSources<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.collect_seq(self.0.iter().flat_map(|source| find_next(&[], source)))
    }
}

// find the next applicable context and return the serializer
fn find_next<'a>(head: &[&'a Frame], mut current: &'a Frame) -> Vec<SerializeContext<'a>> {
    let mut attachments = vec![];
    attachments.extend(head);

    loop {
        match current.kind() {
            FrameKind::Context(context) => {
                // found the context, return all attachments (reversed)
                attachments.reverse();

                return vec![SerializeContext {
                    attachments,
                    context,
                    sources: current.sources(),
                }];
            }
            FrameKind::Attachment(_) => match current.sources() {
                [] => {
                    // there are no more frames, therefore we need to abandon
                    // this is theoretically impossible (the bottom is always a context), but not
                    // enforced
                    return vec![];
                }
                [source] => {
                    attachments.push(current);

                    current = source;
                }
                sources => {
                    // there are multiple sources, we need to recursively probe each of them
                    attachments.push(current);

                    return sources
                        .iter()
                        .flat_map(|source| find_next(&attachments, source))
                        .collect();
                }
            },
        }
    }
}

impl<C: Context> Serialize for Report<C> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        SerializeSources(self.current_frames_unchecked()).serialize(serializer)
    }
}

impl<C: Context> Serialize for Report<[C]> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        SerializeSources(self.current_frames_unchecked()).serialize(serializer)
    }
}
