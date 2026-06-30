use core::num::NonZero;

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
}

pub const D128: Dimension = Dimension(NonZero::new(128).unwrap());
pub const D256: Dimension = Dimension(NonZero::new(256).unwrap());
pub const D512: Dimension = Dimension(NonZero::new(512).unwrap());
pub const D1536: Dimension = Dimension(NonZero::new(1536).unwrap());
pub const D3072: Dimension = Dimension(NonZero::new(3072).unwrap());

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_multiples_of_8() {
        for v in [8, 16, 24, 128, 256, 3072] {
            assert!(
                Dimension::new(v).is_some(),
                "{v} should be a valid dimension"
            );
        }
    }

    #[test]
    fn zero_rejected() {
        assert!(Dimension::new(0).is_none());
    }

    #[test]
    fn non_multiples_of_8_rejected() {
        for v in [1, 2, 3, 4, 5, 6, 7, 9, 10, 15, 17, 100, 3071] {
            assert!(
                Dimension::new(v).is_none(),
                "{v} should not be a valid dimension"
            );
        }
    }

    #[test]
    fn constants_have_correct_values() {
        assert_eq!(D128.0.get(), 128);
        assert_eq!(D256.0.get(), 256);
        assert_eq!(D512.0.get(), 512);
        assert_eq!(D1536.0.get(), 1536);
        assert_eq!(D3072.0.get(), 3072);
    }
}
