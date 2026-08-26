//! Archived records of the dump streams.
//!
//! Every stream file is one rkyv archive, and this module names each file's root beside the
//! record types inside it, so the writer and the reader share one vocabulary and cannot drift.
//! Structural validation happens whole at the reader's `rkyv::access` call per stream: every
//! length, offset, and text encoding, and every domain invariant a record type carries (a
//! confidence is a canonical unit fraction), checks before any record is served. The invariants
//! that reach across fields - a row column and its embedding column agreeing on the row count,
//! an embedding index landing inside its column - are stated here per root and checked once at
//! open, because a byte-level check sees one value at a time.
//!
//! # Roots
//!
//! | stream | root |
//! |---|---|
//! | nodes | [`NodesRoot`] |
//! | edges | [`EdgesRoot`] |
//! | ontology | a vector of [`OntologyRecord`] values |
//! | cards | a vector of [`CardRecord`] values |
//! | node legends, edge legends, ontology icons | [`PayloadsRoot`] |
//! | canonical embeddings | a vector of [`CanonicalRecord`] values |
//! | card embeddings | a vector of [`CardEmbeddingRecord`] values |

use alloc::borrow::Cow;

use smallvec::SmallVec;

use super::super::{CANONICAL_DIMENSIONS, Edge, Node, Ontology, PROJECTOR_DIMENSIONS, card::Card};
use crate::{
    identity::{NodeRowId, OntologyRowId},
    integrity::Sha256Digest,
    math::{AlignedVecN, BoxedVecN, UnitFraction},
    postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
};

/// A packed embedding of `N` native `f32` components, aligned for the SIMD kernels.
///
/// The type is its own archived form, so an archived column of embeddings is readable in place:
/// [`aligned`](Self::aligned) borrows the mapped floats as an [`AlignedVecN`] with no copy, and
/// [`materialize`](Self::materialize) copies out an owned vector where a consumer keeps one.
/// Validation accepts every bit pattern, matching the source contract that components are
/// finite at the source and spot-checked statistically downstream.
///
/// The declared alignment is what makes the in-place borrow an [`AlignedVecN`]: the serializer
/// aligns every archived position to the type's alignment and the open validates it, so every
/// mapped value satisfies the wrapper's address invariant by construction. The layout stays
/// padding-free only while `4 · N` is a multiple of the alignment, and [`aligned`](Self::aligned)
/// asserts that at compile time, so a dimension count that would introduce padding fails the
/// build instead of undermining [`NoUndef`](rkyv::traits::NoUndef).
///
/// [`AlignedVecN`] itself cannot be the archived type. Its alignment is an address invariant
/// behind a transparent layout (`align_of` stays 4 so that any lucky-aligned `[f32; N]` wraps in
/// place and the size is exactly `4 · N` for every `N`), while every alignment mechanism rkyv
/// has - the serializer's position padding, the validator's pointer check, and the field offsets
/// inside derived record structs - reads `align_of` of the field's type. Archiving it directly
/// would therefore serve mapped references that violate its own invariant, and declaring the
/// alignment on the math type instead would pad its size off the `[f32; N]` layout for dimension
/// counts away from the stride. This wrapper carries the alignment fact in the one place rkyv
/// reads it, for exactly the dimension counts where the two layouts coincide.
#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(C, align(32))]
pub(crate) struct Embedding<const N: usize>([f32; N]);

impl<const N: usize> Embedding<N> {
    /// The compile-time proof that the declared alignment introduces no padding and satisfies
    /// the SIMD wrapper's address invariant.
    ///
    /// Every constructor and accessor evaluates it at compile time, so an `N` that violates it
    /// fails the build. `Portable` and [`NoUndef`](rkyv::traits::NoUndef) below rely on the
    /// padding-free half.
    const LAYOUT: () = {
        assert!(
            size_of::<Self>() == N * 4,
            "the declared alignment must not introduce padding",
        );
        assert!(
            align_of::<Self>() >= align_of::<core::simd::f32x8>(),
            "the declared alignment must satisfy the SIMD wrapper's invariant",
        );
    };

    /// Packs a component array.
    pub(super) const fn new(components: &[f32; N]) -> Self {
        const { Self::LAYOUT }

        Self(*components)
    }

    /// Borrows the components in place as an aligned vector.
    pub(super) const fn aligned(&self) -> &AlignedVecN<N> {
        const { Self::LAYOUT }

        // SAFETY: `self` is `repr(C, align(32))`, so every reference to it is 32-aligned, and
        // `LAYOUT` pins 32 at or above the wrapper's required alignment. The component array
        // is the struct's first field at offset 0, so it shares the address.
        unsafe { AlignedVecN::from_ref_unchecked(&self.0) }
    }

    /// Copies the components into a fresh aligned allocation.
    pub(super) fn materialize(&self) -> BoxedVecN<N> {
        let mut vector = BoxedVecN::<N>::zero();
        *vector.as_array_mut() = self.0;
        vector
    }
}

// SAFETY: `repr(C, align(32))` over one `[f32; N]` field gives one stable layout - size 4N,
// alignment 32, no padding (`LAYOUT`, compile-time) - on every target, and the type has no
// interior mutability. The components are the writer's native `f32`s, so a reader on the other
// byte order would compute different values from the same bytes: the dump manifest stamps its
// writer's byte order and the open refuses the other order before any archived value is
// reached.
unsafe impl<const N: usize> rkyv::Portable for Embedding<N> {}

// SAFETY: one `[f32; N]` field and no padding (`LAYOUT`, compile-time), so every byte of a
// value is initialized.
unsafe impl<const N: usize> rkyv::traits::NoUndef for Embedding<N> {}

impl<const N: usize> rkyv::Archive for Embedding<N> {
    type Archived = Self;
    type Resolver = ();

    fn resolve(&self, (): Self::Resolver, out: rkyv::Place<Self>) {
        out.write(*self);
    }
}

impl<const N: usize, S: rkyv::rancor::Fallible + ?Sized> rkyv::Serialize<S> for Embedding<N> {
    fn serialize(&self, _serializer: &mut S) -> Result<Self::Resolver, S::Error> {
        Ok(())
    }
}

// SAFETY: every bit pattern of `[f32; N]` is a valid component array, so there is nothing to
// check.
unsafe impl<const N: usize, C: rkyv::rancor::Fallible + ?Sized> rkyv::bytecheck::CheckBytes<C>
    for Embedding<N>
{
    unsafe fn check_bytes(_value: *const Self, _context: &mut C) -> Result<(), C::Error> {
        Ok(())
    }
}

/// The node stream's root, pairing one record with one packed embedding per node row.
///
/// Entry `n` of both columns belongs to node row `n`, and the two columns are equal in length.
/// The open checks that equality once, so a consumer zips them without a per-row bound. The
/// embedding column is declared ahead of the record column because the writer streams it to
/// disk first and validation claims the columns in declaration order.
#[cfg_attr(
    not(test),
    expect(
        dead_code,
        reason = "used as a schema declaration, only the rkyv derived version is used"
    )
)]
#[derive(rkyv::Archive, rkyv::Serialize)]
#[rkyv(derive(Debug))]
pub(crate) struct NodesRoot {
    /// Row `n`'s projector representation, packed in row order.
    pub embeddings: Vec<Embedding<PROJECTOR_DIMENSIONS>>,
    /// Row `n`'s identity, confidence, and direct types.
    pub records: Vec<NodeRecord>,
}

/// One node row beside its packed embedding.
#[derive(rkyv::Archive, rkyv::Serialize)]
#[rkyv(derive(Debug))]
pub(crate) struct NodeRecord {
    /// The source identifier.
    pub id: ArchivedEntityId,
    /// The store's confidence in the entity.
    pub confidence: Option<UnitFraction>,
    /// Direct types, ascending by ontology row and deduplicated.
    pub ontology: Vec<OntologyRowId>,
}

/// The edge stream's root, carrying one record per edge row with the present embeddings packed
/// apart.
///
/// An edge that carries an embedding names its entry in the packed column by position, so the
/// column holds exactly the present embeddings and an embedding-free edge costs no space. The
/// open checks every named position against the column's length once. The embedding column is
/// declared ahead of the record column because the writer streams it to disk first and
/// validation claims the columns in declaration order.
#[cfg_attr(
    not(test),
    expect(
        dead_code,
        reason = "used as a schema declaration, only the rkyv derived version is used"
    )
)]
#[derive(rkyv::Archive, rkyv::Serialize)]
pub(crate) struct EdgesRoot {
    /// The present edge embeddings, in edge row order.
    pub embeddings: Vec<Embedding<PROJECTOR_DIMENSIONS>>,
    /// Row `n`'s identity, endpoints, types, confidences, and embedding position.
    pub records: Vec<EdgeRecord>,
}

/// One edge row beside the packed column of present embeddings.
#[derive(rkyv::Archive, rkyv::Serialize)]
pub(crate) struct EdgeRecord {
    /// The source identifier.
    pub id: ArchivedEntityId,
    /// The node the link points from.
    pub source: NodeRowId,
    /// The node the link points to.
    pub target: NodeRowId,
    /// Direct types of the link entity, ascending by ontology row and deduplicated.
    pub ontology: Vec<OntologyRowId>,
    /// The position of this edge's embedding in the root's packed column, when the store holds
    /// one.
    pub embedding: Option<u64>,
    /// The store's confidence in the link itself.
    pub confidence: Option<UnitFraction>,
    /// The store's confidence in the link's attachment to its source.
    pub source_confidence: Option<UnitFraction>,
    /// The store's confidence in the link's attachment to its target.
    pub target_confidence: Option<UnitFraction>,
}

/// One ontology-type row.
#[derive(rkyv::Archive, rkyv::Serialize)]
pub(crate) struct OntologyRecord {
    /// The source identifier.
    pub id: ArchivedOntologyTypeUuid,
    /// Direct supertypes, ascending by ontology row and deduplicated.
    pub parents: Vec<OntologyRowId>,
}

/// One finished card beside its type's source identifier.
#[derive(rkyv::Archive, rkyv::Serialize)]
pub(crate) struct CardRecord {
    /// The source identifier of the type the card renders.
    pub id: ArchivedOntologyTypeUuid,
    /// The canonical rendered text.
    pub text: String,
    /// The rendered text's token count.
    pub token_count: u64,
    /// The truncation passes the render took.
    pub truncations: Vec<String>,
    /// Whether the render truncated past its quality floor.
    pub severely_truncated: bool,
}

/// The display-payload streams' root, one raw payload per row.
///
/// The bytes of entry `n` are row `n`'s payload exactly as the dataset delivered it, and the
/// payload type's own byte-level parse validates them at materialization, so the payload
/// contract stays with the payload type instead of being restated here.
pub(crate) type PayloadsRoot = Vec<Vec<u8>>;

/// One covered node's full canonical embedding.
#[derive(rkyv::Archive, rkyv::Serialize)]
pub(crate) struct CanonicalRecord {
    /// The source identifier.
    pub id: ArchivedEntityId,
    /// The full canonical embedding.
    pub embedding: Embedding<CANONICAL_DIMENSIONS>,
}

/// One minted card-text embedding under its text hash.
#[derive(rkyv::Archive, rkyv::Serialize)]
#[rkyv(derive(Debug))]
pub(crate) struct CardEmbeddingRecord {
    /// The SHA-256 of the embedded text's UTF-8 bytes.
    pub hash: Sha256Digest,
    /// The minted embedding.
    pub embedding: Embedding<CANONICAL_DIMENSIONS>,
}

/// Builds one node from its archived record, borrowing its packed embedding in place.
pub(super) fn node<'root>(
    record: &ArchivedNodeRecord,
    embedding: &'root Embedding<PROJECTOR_DIMENSIONS>,
) -> Node<'root, ArchivedEntityId> {
    Node {
        id: record.id,
        ontology: SmallVec::from_slice_copy(record.ontology.as_slice()),
        embedding: Cow::Borrowed(embedding.aligned()),
        confidence: record.confidence.as_ref().copied(),
    }
}

/// Builds one edge from its archived record, borrowing its entry of the packed embedding
/// column in place.
///
/// # Panics
///
/// This panics when the record names an embedding position outside the column. The open checks
/// every position against the column's length, so a validated dump never reaches the panic.
pub(super) fn edge<'root>(
    record: &ArchivedEdgeRecord,
    embeddings: &'root [Embedding<PROJECTOR_DIMENSIONS>],
) -> Edge<'root, ArchivedEntityId> {
    Edge {
        id: record.id,
        source: record.source,
        target: record.target,
        ontology: SmallVec::from_slice_copy(record.ontology.as_slice()),
        embedding: record.embedding.as_ref().map(|position| {
            let position = usize::try_from(position.to_native())
                .expect("the open bounds every embedding position by the column's length");
            Cow::Borrowed(embeddings[position].aligned())
        }),
        confidence: record.confidence.as_ref().copied(),
        source_confidence: record.source_confidence.as_ref().copied(),
        target_confidence: record.target_confidence.as_ref().copied(),
    }
}

/// Materializes one ontology entry from its archived record.
pub(super) fn ontology(record: &ArchivedOntologyRecord) -> Ontology<ArchivedOntologyTypeUuid> {
    Ontology {
        id: record.id,
        parents: SmallVec::from_slice_copy(record.parents.as_slice()),
    }
}

/// Materializes one finished card from its archived record.
pub(super) fn card(record: &ArchivedCardRecord) -> (ArchivedOntologyTypeUuid, Card) {
    let truncations = record
        .truncations
        .iter()
        .map(|label| Cow::Owned(label.as_str().to_owned()))
        .collect();

    (
        record.id,
        Card::from_parts(
            record.text.as_str().to_owned(),
            usize::try_from(record.token_count.to_native())
                .expect("the writer stored the count from a usize"),
            truncations,
            record.severely_truncated,
        ),
    )
}
