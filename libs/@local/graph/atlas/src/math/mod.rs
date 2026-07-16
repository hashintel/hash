//! Small math primitives shared across atlas layout and projection code.
#![expect(unsafe_code)]
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

mod affinity;
mod bounds;
mod dvecn;
pub(crate) mod kernel;
mod rotation;
mod scalar;
mod similarity;
mod transform;
mod translation;
mod vec2;
mod vecn;

#[cfg(test)]
mod tests;

pub use self::{
    affinity::{AffinityCurve, AffinityFitConfig},
    bounds::Bounds2,
    dvecn::DVecN,
    rotation::Rotation,
    scalar::{huber, narrow_f32, narrow_f32_exact, softplus},
    similarity::Similarity,
    transform::Transform,
    translation::Translation,
    vec2::{Vec2, Vec2x4, Vec2x4T},
    vecn::{AlignedVecN, BoxedVecN, VecN},
};
