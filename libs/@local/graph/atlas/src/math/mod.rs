//! Small math primitives shared across atlas layout and projection code.

mod kernel;
mod rotation;
mod transform;
mod translation;
mod vec2;
mod vecn;

#[cfg(test)]
mod tests;

pub use self::{
    rotation::Rotation,
    transform::Transform,
    translation::Translation,
    vec2::{Vec2, Vec2x4, Vec2x4T},
    vecn::{AlignedVecN, BoxedVecN, VecN},
};
