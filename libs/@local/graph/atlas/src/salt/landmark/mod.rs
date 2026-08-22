//! The bounded landmark skeleton.
//!
//! The skeleton caps the nonlinear layout problem at a configured landmark count `M` independent of
//! the corpus size `N`:
//!
//! 1. [`select_landmarks`](select::select_landmarks) draws `M` representative node rows by weighted
//!    sampling without replacement, honoring subgroup minimums and a retained fraction of the prior
//!    generation's landmarks.
//! 2. [`assign_landmarks`](assignment::assign_landmarks) maps every corpus row to its nearest
//!    selected landmark through the generation's search backend, and a landmark assigns to itself.
//! 3. [`quotient_graph`](quotient::quotient_graph) contracts the corpus
//!    [`SemanticGraph`](super::semantic::SemanticGraph) through the assignment into a semantic
//!    graph over the landmark domain: the structure the nonlinear layout optimizes over, `M x M`
//!    instead of `N x N`.
//! 4. [`layout_landmarks`](layout::layout_landmarks) places the landmarks in 2D by stochastic
//!    gradient descent of the UMAP objective over the quotient graph, on the
//!    [`AffinityCurve`](crate::math::AffinityCurve) gradient kernels.
//!
//! A fitted skeleton publishes as one combined landmark file ([`artifact`]): selection, assignment,
//! and coordinates share the ordinal vocabulary, so they live in one artifact and cannot fall out
//! of sync.
//!
//! The quotient is a [`SemanticGraph`] like the corpus graph it contracts, so the layout consumes
//! one graph type at either scale. Every stage draws its randomness from a caller-seeded generator;
//! rerunning with equal inputs, options, and seed reproduces the skeleton exactly.
//!
//! [`SemanticGraph`]: super::semantic::SemanticGraph
pub(crate) mod artifact;
pub(crate) mod assignment;
pub(crate) mod layout;
pub(crate) mod quotient;
pub(crate) mod select;

#[cfg(test)]
mod tests;
