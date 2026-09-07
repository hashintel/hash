//! Morton keys over the generation's frame.

use rayon::iter::{IntoParallelRefIterator as _, ParallelIterator as _};

use crate::{
    math::{Bounds2, Vec2},
    morton::MortonKey,
};

/// Quantizes each point onto the frame's 32-bit-per-axis grid.
///
/// [`Bounds2::quantize`] maps each point onto the grid. The grid outresolves the data, so only
/// points closer together than one coordinate ULP share a cell.
///
/// The caller owns the frame and guarantees that it contains every point. The frame fit produces
/// such a frame from these coordinates. Coordinates outside the frame clamp onto the boundary
/// cells.
#[must_use]
pub(crate) fn keys(points: &[Vec2], frame: Bounds2) -> Box<[MortonKey]> {
    points
        .par_iter()
        .map(|point| {
            let [x, y] = frame.quantize(*point);
            MortonKey::new(x, y)
        })
        .collect::<Vec<_>>()
        .into_boxed_slice()
}
