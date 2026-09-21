//! Mapped point and vector matrices with typed row domains.
//!
//! [`PointFile`] admits two-component points, and [`VectorFile`] admits SIMD-aligned vectors of a
//! fixed width. [`FinitePointFile`] retains a finiteness check across repeated point access.

mod point;
mod vector;

pub(crate) use self::{
    point::{FinitePointFile, PointFile},
    vector::{OpenVectorError, VectorFile},
};
