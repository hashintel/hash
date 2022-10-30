//! Implementation of general report serialization.
//!
//! The value can be of any type, currently only printable attachments and context are supported, in
//! the near future any values will be supported through the use of hooks.
//!
//! ## Attachment
//!
//! ```json5
//! {
//!     "type": "attachment",
//!     "value": "..."
//! }
//! ```
//!
//! ## Context
//!
//! ```json5
//! {
//!     "type": "context",
//!     "value": "..."
//! }
//! ```
//!
//! ## Report
//!
//! ```json5
//! {
//!     "frames": [/* Attachment | Context */],
//!     "sources": [/* Report */]
//! }
//! ```

use std::cell::Cell;

use serde::{ser::SerializeMap, Serialize, Serializer};

use crate::{AttachmentKind, Context, Frame, FrameKind, Report};

struct SerializeFrame<'a>(&'a Frame);

impl<'a> Serialize for SerializeFrame<'a> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let Self(frame) = self;

        match frame.kind() {
            FrameKind::Context(context) => {
                let mut map = serializer.serialize_map(Some(2))?;

                map.serialize_entry("type", "context")?;
                map.serialize_entry("value", &format!("{context}"))?;

                map.end()
            }
            FrameKind::Attachment(AttachmentKind::Opaque(_)) => {
                // these are for now NOT supported
                unreachable!("`SerializeFrames` shouldn't have permitted this value")
            }
            FrameKind::Attachment(AttachmentKind::Printable(attachment)) => {
                let mut map = serializer.serialize_map(Some(2))?;

                map.serialize_entry("type", "attachment")?;
                map.serialize_entry("value", &format!("{attachment}"))?;

                map.end()
            }
        }
    }
}

struct SerializeFrames<'a, I: Iterator<Item = &'a Frame>>(Cell<Option<I>>);

impl<'a, I: Iterator<Item = &'a Frame>> Serialize for SerializeFrames<'a, I> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let frames = self
            .0
            .replace(None)
            .expect("`SerializeFrames` can only be called once!");

        let frames = frames
            .filter(|frame| {
                !matches!(
                    frame.kind(),
                    FrameKind::Attachment(AttachmentKind::Opaque(_))
                )
            })
            .map(SerializeFrame);

        serializer.collect_seq(frames)
    }
}

struct SerializeStackIntoIter<'a> {
    head: Option<&'a Frame>,
}

impl<'a> Iterator for SerializeStackIntoIter<'a> {
    type Item = &'a Frame;

    fn next(&mut self) -> Option<Self::Item> {
        let head = self.head?;

        if head.sources().len() == 1 {
            self.head = Some(&head.sources()[0]);
        } else {
            // the next iteration would return **multiple** or **none**, therefore we return the
            // current and the next one will be None
            self.head = None;
        }

        Some(head)
    }
}

struct SerializeStacks<'a>(&'a [Frame]);

impl<'a> Serialize for SerializeStacks<'a> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.collect_seq(
            self.0
                .iter()
                .map(|frame| SerializeStack { head: Some(frame) }),
        )
    }
}

#[derive(Copy, Clone)]
struct SerializeStack<'a> {
    head: Option<&'a Frame>,
}

impl<'a> IntoIterator for SerializeStack<'a> {
    type IntoIter = SerializeStackIntoIter<'a>;
    type Item = &'a Frame;

    fn into_iter(self) -> Self::IntoIter {
        SerializeStackIntoIter { head: self.head }
    }
}

impl<'a> Serialize for SerializeStack<'a> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let sources = self.sources();

        let frames = SerializeFrames(Cell::new(Some(self.into_iter())));

        let mut map = serializer.serialize_map(Some(2))?;
        map.serialize_entry("frames", &frames)?;
        match sources {
            None => {
                map.serialize_entry::<_, [()]>("sources", &[])?;
            }
            Some(sources) => {
                map.serialize_entry("sources", &SerializeStacks(sources))?;
            }
        }

        map.end()
    }
}

impl<'a> SerializeStack<'a> {
    /// Peek for the next sources. e.g. where `frames.sources() > 1`, will return `None` if there
    /// are `None`
    fn sources(&self) -> Option<&[Frame]> {
        let mut ptr = self.head?;

        while ptr.sources().len() == 1 {
            ptr = &ptr.sources()[0];
        }

        match ptr.sources().len() {
            0 => None,
            1 => unreachable!(),
            _ => Some(ptr.sources()),
        }
    }
}

impl<C: Context> Serialize for Report<C> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        SerializeStacks(self.current_frames()).serialize(serializer)
    }
}
