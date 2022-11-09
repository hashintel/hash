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

use alloc::format;

use serde::{ser::SerializeMap, Serialize, Serializer};

use crate::{AttachmentKind, Context, Frame, FrameKind, Report};

struct SerializeFrames<'a>(&'a [Frame]);

impl<'a> Serialize for SerializeFrames<'a> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.collect_seq(self.0.iter().map(SerializeFrame))
    }
}

struct SerializeFrame<'a>(&'a Frame);

impl<'a> Serialize for SerializeFrame<'a> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let Self(frame) = self;

        let mut map = serializer.serialize_map(Some(3))?;

        match frame.kind() {
            FrameKind::Context(context) => {
                map.serialize_entry("type", "context")?;
                map.serialize_entry("value", &format!("{context}"))?;
            }
            FrameKind::Attachment(AttachmentKind::Opaque(_)) => {
                map.serialize_entry("type", "attachment")?;
                // TODO: for now opaque attachments are unsupported, upcoming PR will fix that
                map.serialize_entry("value", &())?;
            }
            FrameKind::Attachment(AttachmentKind::Printable(attachment)) => {
                map.serialize_entry("type", "attachment")?;
                map.serialize_entry("value", &format!("{attachment}"))?;
            }
        }

        map.serialize_entry("sources", &SerializeFrames(frame.sources()))?;

        map.end()
    }
}

impl<C: Context> Serialize for Report<C> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.collect_seq(self.current_frames().iter().map(SerializeFrame))
    }
}
