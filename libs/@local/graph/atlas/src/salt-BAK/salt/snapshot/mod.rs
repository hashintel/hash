//! Permission-filtered generation snapshot inputs.
//!
//! Store-backed extraction supplies permission results from the existing graph
//! store APIs. This module keeps admission pure: a link is exposed to later
//! geometry only when its selected link edition, both selected endpoint
//! editions, and every required entity-type record are visible.
//!
//! # One bitemporal view
//!
//! [`SnapshotTemporalAxes`] is created from the same ontology transaction time,
//! knowledge transaction time, and knowledge decision-time policy recorded in
//! the generation input manifest. It derives exact point queries for entity
//! and entity-type permission APIs. The production runner compares those axes
//! with extraction provenance before issuing any permission request.
//!
//! Permission is edition-specific. Visibility of an entity UUID at some other
//! edition does not admit the edition selected by extraction. Required entity
//! types are the complete type closure resolved for that candidate in the same
//! snapshot; every member must be visible.
//!
//! # Authorization revision
//!
//! [`AuthorizationRevisionProvider`] supplies a content identity that must
//! change whenever a permission result can change. [`authorize_snapshot`]
//! samples it before and after both batched permission calls. Equal nonzero
//! revisions prove that the result belongs to one authorization state; a
//! change fails the complete snapshot instead of mixing decisions.
//!
//! Excluded candidates contribute only aggregate [`LinkRejectionCounts`].
//! Their graph identities are discarded at the boundary, preventing diagnostic
//! output from becoming a side channel for inaccessible links.
//!
//! # Coordinate influence
//!
//! Visibility authorization and coordinate-influence policy are distinct.
//! [`RelationSecurityPolicy`] applies one frozen mode after visibility:
//!
//! - public-only mode requires the exact link and both endpoints to satisfy their public
//!   predicates;
//! - atlas-safe mode applies deny overrides, admitted relation types, and the exact safe-link
//!   predicate; and
//! - all-snapshot mode admits every visibility-authorized link.
//!
//! The resulting [`GeometrySnapshot`] is sorted canonically and hashes the
//! mode, allow-list identity, authorization revision, exact entity editions,
//! relation type, and required type closure. Downstream geometry accepts this
//! type rather than raw candidates.

mod admit;
mod error;
mod permission;
mod receipt;
mod security;

#[expect(
    unused_imports,
    reason = "snapshot authorization is invoked by the store-backed generation adapter"
)]
pub(crate) use self::{
    admit::{AuthorizedLink, EntityAtEdition, LinkCandidate, LinkRejection, authorize_link},
    error::SnapshotError,
    permission::{
        AuthorizationActivationLeaseProvider, AuthorizationRevisionProvider,
        AuthorizationRevisionProviderAdapter, AuthorizedSnapshot,
        CoordinatedAuthorizationProviderAdapter, LinkRejectionCounts, SnapshotTemporalAxes,
        authorize_snapshot,
    },
    receipt::{
        ExtractionReceiptSubject, StoreExtractionReceipt, StoreExtractionReceiptVerifier,
        StoreExtractionReceiptVerifierAdapter,
    },
    security::{
        GeometryAuthorizedLink, GeometrySnapshot, RelationSecurityPolicy,
        authorize_relation_geometry,
    },
};

#[cfg(test)]
mod tests;
