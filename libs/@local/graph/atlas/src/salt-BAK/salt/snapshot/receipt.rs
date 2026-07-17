//! Opaque store receipts for one extracted and authorized generation payload.

use core::{fmt, future::Future, marker::PhantomData};

use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;

use super::{SnapshotError, SnapshotTemporalAxes};
use crate::salt::{hash::ContentHash, revision::AuthorizationRevision};

const MAXIMUM_RECEIPT_BYTES: usize = 16 * 1_024;

/// Opaque token issued by the extraction store.
///
/// SALT never interprets the token. The matching receipt verifier must bind it
/// to the exact actor, temporal axes, authorization revision, snapshot hashes,
/// and frozen payload identity supplied in [`ExtractionReceiptSubject`].
pub(crate) struct StoreExtractionReceipt {
    bytes: Box<[u8]>,
}

impl StoreExtractionReceipt {
    /// Wraps a bounded token returned by the extraction store.
    ///
    /// # Errors
    ///
    /// Returns an error for an empty or oversized token.
    pub(crate) fn new(bytes: impl Into<Box<[u8]>>) -> Result<Self, SnapshotError> {
        let bytes = bytes.into();
        if bytes.is_empty() || bytes.len() > MAXIMUM_RECEIPT_BYTES {
            return Err(SnapshotError::ExtractionReceipt);
        }
        Ok(Self { bytes })
    }

    /// Borrows the provider-specific token.
    #[must_use]
    #[inline]
    pub(crate) fn as_bytes(&self) -> &[u8] {
        &self.bytes
    }
}

impl fmt::Debug for StoreExtractionReceipt {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("StoreExtractionReceipt")
            .field("byte_length", &self.bytes.len())
            .finish_non_exhaustive()
    }
}

/// Complete subject that a store receipt must attest.
#[derive(Debug, Clone)]
pub(crate) struct ExtractionReceiptSubject {
    pub temporal_axes: SnapshotTemporalAxes,
    pub authorization_revision: AuthorizationRevision,
    pub ontology_hash: ContentHash,
    pub knowledge_hash: ContentHash,
    pub frozen_input_hash: ContentHash,
}

/// Verifies one opaque extraction token against its complete frozen subject.
pub(crate) trait StoreExtractionReceiptVerifier: Sync {
    /// Returns the immutable store report identity after successful verification.
    fn verify_extraction_receipt(
        &self,
        actor: AuthenticatedActor,
        receipt: StoreExtractionReceipt,
        subject: ExtractionReceiptSubject,
    ) -> impl Future<Output = Result<ContentHash, SnapshotError>> + Send;
}

/// Callback-backed adapter for a production store receipt verifier.
pub(crate) struct StoreExtractionReceiptVerifierAdapter<Verify, VerifyFuture> {
    verify: Verify,
    _future: PhantomData<fn() -> VerifyFuture>,
}

impl<Verify, VerifyFuture> StoreExtractionReceiptVerifierAdapter<Verify, VerifyFuture> {
    /// Binds an asynchronous store receipt callback.
    #[must_use]
    pub(crate) const fn new(verify: Verify) -> Self {
        Self {
            verify,
            _future: PhantomData,
        }
    }
}

impl<Verify, VerifyFuture> StoreExtractionReceiptVerifier
    for StoreExtractionReceiptVerifierAdapter<Verify, VerifyFuture>
where
    Verify: Fn(AuthenticatedActor, StoreExtractionReceipt, ExtractionReceiptSubject) -> VerifyFuture
        + Sync,
    VerifyFuture: Future<Output = Result<ContentHash, SnapshotError>> + Send,
{
    fn verify_extraction_receipt(
        &self,
        actor: AuthenticatedActor,
        receipt: StoreExtractionReceipt,
        subject: ExtractionReceiptSubject,
    ) -> impl Future<Output = Result<ContentHash, SnapshotError>> + Send {
        (self.verify)(actor, receipt, subject)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn receipt_tokens_are_bounded_and_redacted() {
        assert!(matches!(
            StoreExtractionReceipt::new(Vec::<u8>::new()),
            Err(SnapshotError::ExtractionReceipt)
        ));
        assert!(matches!(
            StoreExtractionReceipt::new(vec![0; MAXIMUM_RECEIPT_BYTES + 1]),
            Err(SnapshotError::ExtractionReceipt)
        ));

        let receipt =
            StoreExtractionReceipt::new(b"provider-secret".to_vec()).expect("token should fit");
        let debug = format!("{receipt:?}");
        assert!(debug.contains("byte_length"));
        assert!(!debug.contains("provider-secret"));
        assert_eq!(receipt.as_bytes(), b"provider-secret");
    }
}
