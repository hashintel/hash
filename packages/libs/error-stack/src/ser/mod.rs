//! Serialization logic for report
//!
//! This implements the following serialization logic (rendered in json)
//!
//! ```json
//! {
//!   "frames": [
//!     {
//!       "type": "attachment",
//!       "letter": "A"
//!     },
//!     {
//!       "type": "attachment",
//!       "letter": "B"
//!     },
//!     {
//!       "type": "context",
//!       "letter": "C"
//!     }
//!   ],
//!   "sources": [
//!     {
//!       "frames": [
//!         {
//!           "type": "attachment",
//!           "letter": "E"
//!         },
//!         {
//!           "type": "attachment",
//!           "letter": "G"
//!         },
//!         {
//!           "type": "context",
//!           "letter": "H"
//!         }
//!       ],
//!       "sources": []
//!     },
//!     {
//!       "frames": [
//!         {
//!           "type": "context",
//!           "letter": "F"
//!         }
//!       ],
//!       "sources": []
//!     }
//!   ],
//! }
//! ```

pub(crate) use hook::ErasedHooks;
use serde::{
    ser::{SerializeMap, SerializeSeq},
    Serialize, Serializer,
};

#[cfg(all(nightly, feature = "experimental"))]
use crate::ser::nightly::SerializeDiagnostic;
use crate::{AttachmentKind, Frame, FrameKind, Report};

mod hook;
mod nightly;

impl Serialize for Frame {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self.kind() {
            FrameKind::Context(context) => {
                let mut s = serializer.serialize_map(Some(2))?;

                s.serialize_entry("type", "context")?;

                #[cfg(all(nightly, feature = "experimental"))]
                if let Some(diagnostic) = self.request_ref::<SerializeDiagnostic>() {
                    s.serialize_entry("value", diagnostic)?;
                } else {
                    s.serialize_entry("value", &context.to_string())?;
                }

                #[cfg(not(all(nightly, feature = "experimental")))]
                { s.serialize_entry("value", &context.to_string()) }?;

                s.end()
            }
            FrameKind::Attachment(AttachmentKind::Opaque(attachment)) => {
                let mut s = serializer.serialize_map(Some(2))?;

                s.serialize_entry("type", "attachment")?;

                let mut fallback = true;
                #[cfg(all(nightly, feature = "experimental"))]
                if let Some(diagnostic) = self.request_ref::<SerializeDiagnostic>() {
                    s.serialize_entry("value", diagnostic)?;
                    fallback = false;
                }

                #[cfg(feature = "hooks")]
                if let Some(hooks) = Report::serialize_hook() {
                    if let Some(value) = hooks.call(self) {
                        s.serialize_entry("value", &value)?;
                        fallback = false;
                    }
                }

                if fallback {
                    // explicit `None` if the value isn't provided.
                    s.serialize_entry("value", &Option::<()>::None)?;
                }

                s.end()
            }
            FrameKind::Attachment(AttachmentKind::Printable(attachment)) => {
                let mut s = serializer.serialize_map(Some(2))?;

                s.serialize_entry("type", "attachment")?;
                s.serialize_entry("value", &attachment.to_string())?;

                s.end()
            }
            FrameKind::Attachment(AttachmentKind::Serializable(attachment)) => {
                let mut s = serializer.serialize_map(Some(2))?;

                s.serialize_entry("type", "attachment")?;
                s.serialize_entry("value", attachment)?;

                s.end()
            }
        }
    }
}

struct Root<'a> {
    stack: Vec<&'a Frame>,
    split: &'a [Frame],
}

impl<'a> From<&'a Frame> for Root<'a> {
    fn from(frame: &'a Frame) -> Self {
        let (stack, split) = frame.collect();

        Self { stack, split }
    }
}

impl<'a, C> From<&'a Report<C>> for Root<'a> {
    fn from(frame: &'a Report<C>) -> Self {
        let (stack, split) = frame.collect();

        Self { stack, split }
    }
}

impl Serialize for Root<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let Self { stack, split } = self;

        let mut s = serializer.serialize_map(Some(2))?;

        s.serialize_entry("frames", &stack)?;
        s.serialize_entry("sources", &split.iter().map(Root::from).collect::<Vec<_>>())?;

        s.end()
    }
}

impl<C> Serialize for Report<C> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        Root::from(self).serialize(serializer)
    }
}
