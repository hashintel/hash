//! Implementation of general report serialization.
//!
//! The value can be of any type, currently only printable attachments and context are supported, in
//! the near future any values will be supported through the use of hooks.
//!
//! The returned JSON returned is a list of all current sources with the following output:
//!
//! ```json
//! {
//!     "context": "string value",
//!     "attachments": ["all attachments leading up to this context"],
//!     "sources": [] // recursive render using `frame.sources()`
//! }
//! ```

use alloc::{format, vec::Vec};

use serde::{ser::SerializeMap, Serialize, Serializer};

use crate::{AttachmentKind, Context, Frame, FrameKind, Report};

struct SerializeAttachment<'a>(&'a Frame);

impl<'a> Serialize for SerializeAttachment<'a> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let Self(frame) = self;

        #[allow(clippy::match_same_arms)]
        match frame.kind() {
            FrameKind::Context(_) => {
                // `SerializeContext` ensures that no context is ever serialized
                unreachable!()
            }
            FrameKind::Attachment(AttachmentKind::Opaque(_)) => {
                // TODO: for now opaque attachments are unsupported, upcoming PR will fix that
                // `SerializeContext` ensures that no such attachment is added
                unreachable!()
            }
            FrameKind::Attachment(AttachmentKind::Printable(attachment)) => {
                format!("{attachment}").serialize(serializer)
            }
        }
    }
}

struct SerializeAttachments<'a, 'b>(&'a [&'b Frame]);

impl<'a, 'b> Serialize for SerializeAttachments<'a, 'b> {
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

impl<'a> Serialize for SerializeContext<'a> {
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
        map.serialize_entry("context", &format!("{context}"))?;
        map.serialize_entry("attachments", &SerializeAttachments(&attachments[..]))?;
        map.serialize_entry("sources", &SerializeSources(sources))?;

        map.end()
    }
}

struct SerializeSources<'a>(&'a [Frame]);

impl<'a> Serialize for SerializeSources<'a> {
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
        if let FrameKind::Context(context) = current.kind() {
            // found the context, return all attachments (reversed)
            attachments.reverse();

            return vec![SerializeContext {
                attachments,
                context,
                sources: current.sources(),
            }];
        } else if current.sources().len() > 1 {
            // current is an attachment, add to attachments and recursively probe
            attachments.push(current);

            return current
                .sources()
                .iter()
                .flat_map(|source| find_next(&attachments, source))
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

impl<C: Context> Serialize for Report<C> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        SerializeSources(self.current_frames()).serialize(serializer)
    }
}
