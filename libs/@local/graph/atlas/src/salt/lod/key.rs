//! Morton keys over the generation's frame.

use rayon::iter::{IntoParallelRefIterator as _, ParallelIterator as _};

use crate::{
    math::{Bounds2, Vec2},
    morton::MortonKey,
};

/// Quantizes each point onto the frame's 32-bit-per-axis grid.
///
/// Uses [`Bounds2::quantize`] and preserves input order. For generation indexing, the frame must
/// contain every point. The fixed [`super::stage::WIRE_FRAME`] gives each grid cell an axis width
/// of 2⁻³¹. Quantization in that frame clamps coordinates outside `[-1, 1]` onto its boundary
/// cells. A zero-extent frame axis maps to cell zero.
///
/// # Warning
///
/// Quantization can merge distinct `f32` coordinates, because its uniform grid does not resolve
/// every representable value near zero and arbitrary frames also inherit the extent rounding of
/// [`Bounds2::quantize`].
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
