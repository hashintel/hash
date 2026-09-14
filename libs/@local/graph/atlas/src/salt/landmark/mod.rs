//! Bounded nonlinear layout over selected landmark rows.
//!
//! A [`LandmarkSkeleton`](artifact::LandmarkSkeleton) combines selected rows, an assignment of
//! every input row to a selected landmark, and the landmarks' 2D coordinates. A capacity `M` bounds
//! the nonlinear layout independently of the input row count `N`:
//!
//! 1. [`select_landmarks`](select::select_landmarks) selects at most `M` rows by weighted
//!    priorities. Subgroup minimums take precedence over a retention target for prior landmarks,
//!    followed by a fill to capacity. Minimums use a greedy procedure that can reject jointly
//!    feasible overlapping requirements.
//! 2. [`LandmarkSelection::assign`](select::LandmarkSelection::assign) maps every input row to a
//!    selected landmark through a nearest-neighbour backend. Landmarks assign to themselves. Other
//!    assignments inherit the backend's approximation quality.
//! 3. [`LandmarkAssignment::quotient`](assignment::LandmarkAssignment::quotient) contracts the
//!    input [`SemanticGraph`](super::semantic::SemanticGraph) through this assignment. The quotient
//!    has the same fuzzy-weight semantics over at most `M` rows, keeping the layout graph bounded
//!    while assignment still covers all `N` rows.
//! 4. [`layout_landmarks`](layout::layout_landmarks) places landmarks by UMAP-style
//!    negative-sampling updates using [`AffinityCurve`](crate::math::AffinityCurve) kernels. Its
//!    asymmetric negative updates do not generally descend one scalar objective for the whole
//!    graph.
//!
//! Selection, assignment and coordinates share [`LandmarkOrdinal`](select::LandmarkOrdinal)
//! positions and publish in one combined landmark file ([`artifact`]). Assembly checks their
//! landmark counts and coordinate finiteness. Supply parts derived from the same selection, since
//! equal counts alone do not establish that relationship.
//!
//! Selection and contraction preserve their operation order across thread counts. Assignment
//! requires a deterministic backend for reproducible results. The serial layout repeats under equal
//! inputs and random streams with the same floating-point behavior, without a cross-platform
//! bit-equality guarantee.
pub(crate) mod artifact;
pub(crate) mod assignment;
pub(crate) mod layout;
pub(crate) mod quotient;
pub(crate) mod select;

#[cfg(test)]
mod tests;
