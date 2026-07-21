//! Morton keys over the generation's frame.

use rayon::prelude::*;

use crate::{
    math::{Bounds2, Vec2},
    morton::MortonKey,
};

/// The number of grid positions per axis: keys quantize each axis to 32 bits.
#[expect(
    clippy::cast_precision_loss,
    reason = "2^32 is a power of two, exact in `f64`"
)]
const AXIS_CELLS: f64 = (1_u64 << 32) as f64;

/// Quantizes each point onto the frame's 32-bit-per-axis grid.
///
/// Each axis maps affinely from the frame onto `[0, 2^32)` and floors; points on the frame's
/// maximum edge take the last cell. The mapping runs in `f64`, so every `f32` coordinate quantizes
/// exactly and the grid outresolves the data: points closer than one coordinate ULP share cells,
/// nothing else does. A zero-extent axis (every point identical on it, permitted by [`Bounds2`])
/// maps to cell zero.
///
/// The frame is the caller's contract: it contains every point (the frame fit produces it from
/// these coordinates), and coordinates outside it clamp onto the boundary cells.
#[must_use]
pub(crate) fn keys(points: &[Vec2], frame: Bounds2) -> Box<[MortonKey]> {
    let min = frame.min();
    let size = frame.size();

    points
        .par_iter()
        .map(|point| {
            MortonKey::new(
                quantize(point.x(), min.x(), size.x()),
                quantize(point.y(), min.y(), size.y()),
            )
        })
        .collect::<Vec<_>>()
        .into_boxed_slice()
}

/// Maps one coordinate onto its axis grid cell.
#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "the saturating float-to-int cast is the clamp onto the axis grid"
)]
fn quantize(value: f32, min: f32, extent: f32) -> u32 {
    if extent == 0.0 {
        return 0;
    }

    let unit = (f64::from(value) - f64::from(min)) / f64::from(extent);
    // Rust float-to-int casts saturate: negative inputs clamp to cell
    // zero, inputs at or beyond the maximum edge to the last cell, and
    // a NaN coordinate (excluded by the frame contract) to cell zero.
    (unit * AXIS_CELLS) as u32
}
