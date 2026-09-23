//! Versioned derivation of the paired-movement draw salt and subject order.
//!
//! [`RuleIdentity`] names the conventions needed to replay a draw without persisting the selected
//! pair identities. Recognize the recorded identity with [`RuleIdentity::recognize`], re-derive the
//! salt and compare it with the recorded value before sampling the same attraction index. An
//! unknown identity or a salt mismatch prevents this replay check from establishing agreement.
//! These operations do not change a published generation.
//!
//! The salt preimage serializes the metadata's `snapshot` and then `reproducibility`, excluding
//! placement outputs and evidence. Equal serialized projections yield equal salts. The projection
//! contains declared inputs, not the attraction-index bytes or a complete corpus identity.
//! Replaying the draw also requires the same candidate domain and row identities. Changed
//! projections normally change the digest, subject to SHA-256 collisions, and even different salts
//! can select the same sample.

#[cfg(test)]
mod tests;

use core::{error::Error, fmt};
use std::io;

use zerocopy::IntoBytes as _;

use crate::{
    file::salt::metadata::{Reproducibility, Snapshot},
    identity::NodeRowId,
    integrity::{self, Sha256, Sha256Digest, Update as _},
};

/// One generation's derived draw salt.
///
/// SHA-256 of a public domain tag followed by the encoded metadata projection. The evidence records
/// it beside [`RuleIdentity`] for replay comparison. This derivation uses no secret key and
/// supplies no authentication.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(transparent)]
#[repr(transparent)]
pub(crate) struct DrawSalt(Sha256Digest);

impl DrawSalt {
    /// The identity-1 salt domain tag.
    ///
    /// Salt and order tags are distinct and end at their first newline. Neither tag is a prefix of
    /// the other. Every input places its single variable-length component after the fixed-width
    /// components. This framing separates the derivations' preimages, without ruling out hash
    /// collisions.
    const DOMAIN: &[u8] = b"atlas.paired-movement.salt.1\n";
}

/// A salted digest ordering one draw subject.
///
/// Keys order bytewise on the derived digest, the sampler's primary sort key. A key is never
/// persisted: the salt and the subject encoding re-derive it.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(super) struct OrderKey(Sha256Digest);

impl OrderKey {
    /// The identity-1 order domain tag.
    ///
    /// [`DrawSalt::DOMAIN`] states the shared framing contract.
    const DOMAIN: &[u8] = b"atlas.paired-movement.order.1\n";
}

/// Identity of one paired-movement draw rule.
///
/// An identity fixes the hash algorithm and domain tags, subject encodings, ordering rule and exact
/// preimage serialization. Changes to any of these conventions require a new identity. An existing
/// identity's encoding of the same inputs must never change. This includes the metadata schema and
/// serializer dependency semantics, which this type alone cannot freeze.
///
/// The wire form is a bare `u32`. Deserialization preserves unknown identities exactly, allowing a
/// reader to report the refused value.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(transparent)]
#[repr(transparent)]
pub(crate) struct RuleIdentity(u32);

impl RuleIdentity {
    /// The first draw rule.
    ///
    /// SHA-256 under newline-terminated ASCII domain tags, [`serde_json::to_writer_pretty`] as
    /// the preimage serializer, and bytewise digest order for the keys.
    pub(crate) const INITIAL: Self = Self(1);

    /// Returns this identity's operations, or [`None`] for an unknown identity.
    ///
    /// Recognition selects supported conventions. Serialization through the returned [`DrawRule`]
    /// remains fallible.
    #[must_use]
    pub(crate) const fn recognize(self) -> Option<DrawRule> {
        match self {
            Self::INITIAL => Some(DrawRule { identity: self }),
            Self(_) => None,
        }
    }
}

/// The identity-1 projection of snapshot and reproducibility metadata.
///
/// Serialization emits `snapshot`, then `reproducibility`, through [`SaltMetadata`]'s field types
/// and their serialization implementations.
///
/// [`SaltMetadata`]: crate::file::salt::metadata::SaltMetadata
#[derive(serde::Serialize)]
struct SaltPreimage<'document> {
    snapshot: &'document Snapshot,
    reproducibility: &'document Reproducibility,
}

/// A salt-preimage serialization or output-write failure.
///
/// The source retains the underlying [`serde_json::Error`].
#[derive(Debug)]
pub(crate) struct EncodeError(serde_json::Error);

impl fmt::Display for EncodeError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "the salt preimage did not serialize")
    }
}

impl Error for EncodeError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.0)
    }
}

/// The operations of one recognized draw rule.
///
/// [`RuleIdentity::recognize`] constructs only supported identities. These operations implement
/// [`RuleIdentity::INITIAL`]. Adding an identity must retain the existing identity's exact
/// derivation for its recorded inputs.
#[derive(Debug, Copy, Clone)]
pub(crate) struct DrawRule {
    /// The identity these operations implement.
    identity: RuleIdentity,
}

impl DrawRule {
    /// Returns the identity these operations implement.
    #[must_use]
    pub(super) const fn identity(self) -> RuleIdentity {
        self.identity
    }

    /// Writes the salt preimage, the ordered two-field projection of the metadata document.
    ///
    /// Identity 1 writes `snapshot` and then `reproducibility` using
    /// [`serde_json::to_writer_pretty`] through the metadata types' own serialization
    /// implementations. Equal projections yield equal bytes even when other document content
    /// differs.
    ///
    /// # Errors
    ///
    /// Returns [`EncodeError`] for serialization or output-write failure.
    #[expect(
        clippy::unused_self,
        reason = "the receiver limits these operations to a recognized draw rule"
    )]
    fn write_preimage(
        self,
        snapshot: &Snapshot,
        reproducibility: &Reproducibility,
        write: impl io::Write,
    ) -> Result<(), EncodeError> {
        serde_json::to_writer_pretty(
            write,
            &SaltPreimage {
                snapshot,
                reproducibility,
            },
        )
        .map_err(EncodeError)
    }

    /// Derives the draw salt of one generation.
    ///
    /// Computes SHA-256 of the salt domain tag followed by [`Self::write_preimage`]'s bytes.
    /// Byte-identical projections share a salt. Digest equality alone does not prove equal inputs
    /// or an equal attraction index.
    ///
    /// # Errors
    ///
    /// [`EncodeError`] when the preimage does not serialize.
    pub(crate) fn derive_salt(
        self,
        snapshot: &Snapshot,
        reproducibility: &Reproducibility,
    ) -> Result<DrawSalt, EncodeError> {
        let mut hasher = Sha256::new();

        hasher.update(DrawSalt::DOMAIN);
        self.write_preimage(
            snapshot,
            reproducibility,
            &mut integrity::Writer {
                accumulator: &mut hasher,
                writer: io::sink(),
            },
        )?;

        Ok(DrawSalt(hasher.finalize()))
    }

    /// Hashes a draw subject under the order tag and public salt.
    ///
    /// The key is the SHA-256 of the order domain tag, the salt's raw digest bytes, and then
    /// `subject`, the draw subject's encoded stable identity. The subject encoding is part of
    /// the rule identity: [`Self::pair_order_key`] and [`Self::row_order_key`] fix the two
    /// subject families.
    #[expect(
        clippy::unused_self,
        reason = "the receiver limits these operations to a recognized draw rule"
    )]
    #[must_use]
    fn order_key(self, salt: DrawSalt, subject: &[u8]) -> OrderKey {
        let mut hasher = Sha256::new();
        hasher.update(OrderKey::DOMAIN);
        hasher.update(&salt.0.to_bytes());
        hasher.update(subject);
        OrderKey(hasher.finalize())
    }

    /// Returns the salted order key of an oriented pair.
    ///
    /// Identity 1 encodes the source row followed by the target row, each as an 8-byte
    /// little-endian integer. Fixed-width components make the pair encoding unambiguous. For
    /// distinct endpoints, a pair and its reverse have different preimages.
    #[must_use]
    pub(super) fn pair_order_key(
        self,
        salt: DrawSalt,
        source: NodeRowId,
        target: NodeRowId,
    ) -> OrderKey {
        let mut subject = [0_u8; 16];
        subject[..8].copy_from_slice(source.as_bytes());
        subject[8..].copy_from_slice(target.as_bytes());
        self.order_key(salt, &subject)
    }

    /// Returns the salted order key of a control row.
    ///
    /// Identity 1 encodes the row as an 8-byte little-endian integer. The distinct lengths of row
    /// and pair subjects keep their preimages separate under one salt.
    #[must_use]
    pub(super) fn row_order_key(self, salt: DrawSalt, row: NodeRowId) -> OrderKey {
        self.order_key(salt, row.as_bytes())
    }
}
