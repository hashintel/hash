use core::{fmt, fmt::Display, num::NonZero};

/// An embedding vector dimension, guaranteed to be a positive multiple of 8.
///
/// The multiple-of-8 invariant ensures that the dimension evenly divides into
/// SIMD lanes (8×f32 = `f32x8`), so vectorized kernels can operate without
/// remainder handling.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Dimension(NonZero<u16>);

impl Dimension {
    /// Creates a new dimension if `value` is non-zero and a multiple of 8.
    ///
    /// Returns [`None`] otherwise.
    #[must_use]
    pub const fn new(value: u16) -> Option<Self> {
        // not using `?` here because it isn't `const`
        let Some(value) = NonZero::new(value) else {
            return None;
        };

        if !value.get().is_multiple_of(8) {
            return None;
        }

        Some(Self(value))
    }

    /// The raw dimension value.
    #[must_use]
    pub const fn get(self) -> u16 {
        self.0.get()
    }

    /// The raw dimension value as a [`NonZero<u16>`].
    #[must_use]
    pub const fn value(self) -> NonZero<u16> {
        self.0
    }
}

impl Display for Dimension {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.get(), f)
    }
}

pub const D128: Dimension = Dimension(NonZero::new(128).unwrap());
pub const D256: Dimension = Dimension(NonZero::new(256).unwrap());
pub const D512: Dimension = Dimension(NonZero::new(512).unwrap());
pub const D1536: Dimension = Dimension(NonZero::new(1536).unwrap());
pub const D3072: Dimension = Dimension(NonZero::new(3072).unwrap());
