mod manifest;
mod state;
#[cfg(test)]
mod tests;

use error_stack::{Report, ResultExt as _};
use hash_crypto::digest::Sha256;
use serde::{Deserialize, Serialize, de::DeserializeOwned};

pub use self::{
    manifest::{WorkKind, WorkManifest, WorkManifestV1},
    state::{StatePhase, StateVersion, StateVersionRef, StateVersionV1},
};

/// The largest record that is decoded, in bytes.
const MAX_RECORD_BYTES: usize = 256 * 1024;

/// Identifies a state version by its content.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, derive_more::Display)]
#[serde(transparent)]
#[display("{}", hex::encode(_0))]
pub struct StateVersionId(#[serde(with = "hex::serde")] [u8; 32]);

/// Identifies a work manifest by the work it delivers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, derive_more::Display)]
#[serde(transparent)]
#[display("{}", hex::encode(_0))]
pub struct WorkId(#[serde(with = "hex::serde")] [u8; 32]);

/// Identifies a journal event.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, derive_more::Display)]
#[serde(transparent)]
#[display("{}", hex::encode(_0))]
pub struct EventId(#[serde(with = "hex::serde")] [u8; 32]);

// Origin: `canonical_digest` in labs `pocs/integrations_rs/src/orchestrator/ids.rs`, which this
// repository's `durable-kernel` has as `content_digest_bytes`.
/// Hashes `domain`, a zero byte and `value` as JSON.
///
/// Field order is part of the digest, so it must stay stable for stored records.
fn content_digest(domain: &str, value: &impl Serialize) -> [u8; 32] {
    let mut digest = Sha256::new();
    digest.update(domain.as_bytes());
    digest.update(&[0]);
    digest.update(&serde_json::to_vec(value).expect("a record should serialize to JSON"));
    digest.finalize().to_bytes()
}

/// Reports why a stored record could not be read.
#[derive(Debug, Clone, Copy, derive_more::Display, derive_more::Error)]
pub enum RecordError {
    #[display("the record could not be decoded")]
    Decode,
    #[display("the record does not match its ID")]
    Mismatch,
}

/// Decodes a record of at most [`MAX_RECORD_BYTES`].
fn decode<T: DeserializeOwned>(bytes: &[u8]) -> Result<T, Report<RecordError>> {
    if bytes.len() > MAX_RECORD_BYTES {
        return Err(Report::new(RecordError::Decode).attach(format!(
            "the record is {} bytes; the maximum is {MAX_RECORD_BYTES}",
            bytes.len()
        )));
    }
    serde_json::from_slice(bytes).change_context(RecordError::Decode)
}
