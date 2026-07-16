//! Small math primitives shared across atlas layout and projection code.

mod bounds;
mod kernel;
mod rotation;
mod transform;
mod translation;
mod vec2;
mod vecn;

#[cfg(test)]
mod test_util;

pub use self::{
    bounds::Bounds2,
    rotation::Rotation,
    transform::Transform,
    translation::Translation,
    vec2::{Vec2, Vec2x4, Vec2x4T},
    vecn::{AlignedVecN, BoxedVecN, VecN},
};
