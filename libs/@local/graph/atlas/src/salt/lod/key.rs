//! Morton keys over the generation's frame.

use rayon::iter::{IntoParallelRefIterator as _, ParallelIterator as _};

use crate::{
    math::{Bounds2, Vec2},
    morton::MortonKey,
};

/// Quantizes each point onto the frame's 32-bit-per-axis grid.
///
/// Each point rides [`Bounds2::quantize`]: the grid outresolves the data - points closer than one
/// coordinate ULP share cells, nothing else does.
///
/// The frame is the caller's contract: it contains every point (the frame fit produces it from
/// these coordinates), and coordinates outside it clamp onto the boundary cells.
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
