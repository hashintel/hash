use alloc::alloc::Allocator;

use error_stack::Report;

use super::{Document, codec::Envelope};
use crate::file::generation::GenerationId;

/// The active generation captured for one request.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, schemars::JsonSchema)]
pub(crate) struct CurrentDocument {
    generation: GenerationId,
}

impl CurrentDocument {
    pub(crate) const fn new(generation: GenerationId) -> Self {
        Self { generation }
    }
}

impl Document for CurrentDocument {
    type Error = Report<serde_json::Error>;

    fn encode<A: Allocator>(&self, buffer: &mut Vec<u8, A>) -> Result<Envelope, Self::Error> {
        Envelope::encode_json(self, buffer)
    }
}

#[cfg(test)]
mod tests {
    use alloc::alloc::Global;

    use super::CurrentDocument;
    use crate::{file::generation::GenerationId, serve::document::Document as _};

    #[test]
    fn json_generation() {
        let generation: GenerationId =
            "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
                .parse()
                .expect("should parse the generation identity");
        let document = CurrentDocument::new(generation);
        let mut bytes = Vec::new_in(&Global);
        bytes.extend_from_slice(b"previous document");
        let _completed = document
            .encode(&mut bytes)
            .expect("should complete the current-generation response");
        assert_eq!(
            bytes,
            br#"{"generation":"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"}"#,
            "should encode the supplied generation in canonical hexadecimal",
        );
    }
}
