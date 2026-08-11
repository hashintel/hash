//! The draw-rule identity and salt.
//!
//! The paired-movement sample is replayable without persisting pair identities. The draw is a
//! pure function of the generation's declared inputs under a rule that fixes every convention
//! behind it. [`RuleIdentity`] names one such convention set, and the evidence body records
//! which one produced its draw. A replay recognizes the recorded identity
//! ([`RuleIdentity::recognize`]), re-derives the salt under that identity's retained conventions,
//! and compares it with the recorded value. An unknown identity or a salt mismatch invalidates the
//! replay and nothing else: the readout is evidence, and the generation it came from stays
//! published.
//!
//! The salt preimage is the ordered two-field projection of the generation's metadata document,
//! `snapshot` and then `reproducibility`. Both sections exist before ladder evaluation, and no
//! ladder output can enter them. Byte-identical inputs therefore share one draw, and any changed
//! input (snapshot, configuration, embedder, or prior-generation chain) rotates the
//! pseudo-random sample. Placement and evidence stay outside the preimage, so the projection is
//! an input identity rather than a full-content identity.

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
/// A keyed digest of the generation's input identity (the encoded salt preimage) under the
/// rule's salt domain tag. The evidence body records it beside the rule identity, and a replay
/// re-derives and compares it before selecting any identity.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(transparent)]
#[repr(transparent)]
pub(crate) struct DrawSalt(Sha256Digest);

impl DrawSalt {
    /// The identity-1 salt domain tag.
    ///
    /// Both tags terminate with a newline neither tag contains, so no tag is a prefix of the other
    /// and the two derivation families cannot collide. Every hash input this module forms places
    /// its single variable-length component last, after fixed-width components only, so an
    /// input parses uniquely (see [`Sha256`] on framing).
    const DOMAIN: &[u8] = b"atlas.paired-movement.salt.1\n";
}

/// The keyed order key of one draw subject.
///
/// Keys order bytewise on the derived digest, the sampler's primary sort key. A key is never
/// persisted: the salt and the subject encoding re-derive it.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(super) struct OrderKey(Sha256Digest);

impl OrderKey {
    /// The identity-1 order domain tag; the shared framing contract lives on
    /// [`DrawSalt::DOMAIN`].
    const DOMAIN: &[u8] = b"atlas.paired-movement.order.1\n";
}

/// Identity of one paired-movement draw rule.
///
/// An identity fixes the whole draw convention: the keyed-hash algorithm, its domain tags, the
/// stable-identity encodings, the ordering rule, and the exact preimage serializer with its
/// formatting options. Changing any of them, the serializer's dependency semantics included,
/// requires a new identity, and an existing identity's conventions never move, so a recorded
/// draw stays re-derivable byte for byte. The identities are replay semantics rather than
/// configuration and are independent of the repository version.
///
/// The wire form is a bare integer, and deserialization is lossless for identities this crate
/// does not carry, so a reader reports exactly what it refused.
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

    /// Returns this identity's operations, or `None` for an identity this crate does not carry.
    ///
    /// Recognition is the one dispatch: every [`DrawRule`] operation afterwards is total over
    /// its inputs. `None` invalidates the replay that consumed the recorded identity, and
    /// nothing else, because the generation it came from is already published.
    #[must_use]
    pub(crate) const fn recognize(self) -> Option<DrawRule> {
        match self {
            Self::INITIAL => Some(DrawRule { identity: self }),
            Self(_) => None,
        }
    }
}

/// The identity-1 salt preimage, the ordered two-field projection of the metadata document.
///
/// Declaration order is serialization order: `snapshot`, then `reproducibility`. The fields
/// borrow [`SaltMetadata`]'s own types, so the projection serializes through exactly the
/// production document's `serde` paths, the validating config echo included.
///
/// [`SaltMetadata`]: crate::file::salt::metadata::SaltMetadata
#[derive(serde::Serialize)]
struct SaltPreimage<'a> {
    snapshot: &'a Snapshot,
    reproducibility: &'a Reproducibility,
}

/// The salt preimage did not serialize.
///
/// Unreachable for this crate's document types: the projection is a strict subset of the
/// document the production writer serializes on every publish. The seam stays typed rather
/// than panicking, matching the seal path's posture.
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
/// [`RuleIdentity::recognize`] is the only constructor, so a value always names a convention
/// set this crate implements. The bodies below are identity 1's. A later identity extends the
/// recognition dispatch and retains these conventions unchanged under
/// [`RuleIdentity::INITIAL`], so replay under the earlier identity keeps its exact bytes.
#[derive(Debug, Copy, Clone)]
pub(crate) struct DrawRule {
    /// The identity these operations implement.
    identity: RuleIdentity,
}

impl DrawRule {
    /// Returns the identity these operations implement.
    ///
    /// The evidence body records it beside the derived salt, so a replay dispatches back here.
    #[must_use]
    pub(super) const fn identity(self) -> RuleIdentity {
        self.identity
    }

    /// Writes the salt preimage, the ordered two-field projection of the metadata document.
    ///
    /// Identity 1 serializes `snapshot` and then `reproducibility` into `write` with
    /// [`serde_json::to_writer_pretty`] through the document types' own `serde` implementations:
    /// the same dependency, entry point, and pretty-format semantics as the production
    /// repository document writer ([`StagedGeneration::seal`]), because they are one crate.
    /// Equal projections yield equal bytes even when document content outside them differs.
    ///
    /// # Errors
    ///
    /// [`EncodeError`] when the projection does not serialize.
    ///
    /// [`StagedGeneration::seal`]: crate::file::generation::StagedGeneration::seal
    #[expect(
        clippy::unused_self,
        reason = "the receiver is the recognition proof: only `RuleIdentity::recognize` mints it, \
                  and a later identity's dispatch consumes it"
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
    /// The salt is the SHA-256 of the salt domain tag followed by the written preimage
    /// ([`Self::write_preimage`]). It keys the order under which the sampler draws candidate
    /// pairs: byte-identical inputs share it, and any changed input rotates it.
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

    /// Returns the keyed order key of one draw subject.
    ///
    /// The key is the SHA-256 of the order domain tag, the salt's raw digest bytes, and then
    /// `subject`, the draw subject's encoded stable identity. The subject encoding is part of
    /// the rule identity: [`Self::pair_order_key`] and [`Self::row_order_key`] fix the two
    /// subject families.
    #[expect(
        clippy::unused_self,
        reason = "the receiver is the recognition proof: only `RuleIdentity::recognize` mints it, \
                  and a later identity's dispatch consumes it"
    )]
    #[must_use]
    fn order_key(self, salt: DrawSalt, subject: &[u8]) -> OrderKey {
        let mut hasher = Sha256::new();
        hasher.update(OrderKey::DOMAIN);
        hasher.update(&salt.0.to_bytes());
        hasher.update(subject);
        OrderKey(hasher.finalize())
    }

    /// Returns the keyed order key of one candidate pair ([`Self::order_key`]).
    ///
    /// Identity 1 encodes the pair subject as 16 bytes, the source row and then the target row,
    /// each in the row id's persisted little-endian form. Orientation is kept: a pair and its
    /// reverse are distinct subjects. Both components are fixed width, so the encoding frames
    /// itself.
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

    /// Returns the keyed order key of one candidate control row ([`Self::order_key`]).
    ///
    /// Identity 1 encodes the row subject as the row id's persisted little-endian form: 8 bytes
    /// where a pair subject holds 16, so no row shares a preimage with a pair under one salt.
    #[must_use]
    pub(super) fn row_order_key(self, salt: DrawSalt, row: NodeRowId) -> OrderKey {
        self.order_key(salt, row.as_bytes())
    }
}
