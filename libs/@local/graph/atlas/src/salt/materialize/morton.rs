/// A 16-bit-per-axis Morton key.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(transparent)]
pub(crate) struct MortonKey(u32);

impl MortonKey {
    /// Restores an already validated persisted key.
    #[must_use]
    #[inline]
    pub(super) const fn from_u32(value: u32) -> Self {
        Self(value)
    }

    /// Interleaves the bits of the quantized x and y axes.
    #[must_use]
    #[inline]
    pub(crate) const fn new(x: u16, y: u16) -> Self {
        Self(spread_bits(x) | (spread_bits(y) << 1))
    }

    /// Returns the interleaved key.
    #[must_use]
    #[inline]
    pub(crate) const fn get(self) -> u32 {
        self.0
    }

    /// Returns the cell prefix at `depth` bits per axis.
    #[must_use]
    #[inline]
    pub(super) const fn prefix(self, depth: u8) -> u32 {
        if depth == 0 {
            0
        } else {
            self.0 >> (2 * (16 - depth))
        }
    }

    /// Deinterleaves the quantized x and y axes.
    #[must_use]
    #[inline]
    pub(super) const fn coordinates(self) -> [u16; 2] {
        [compact_bits(self.0), compact_bits(self.0 >> 1)]
    }
}

const fn spread_bits(value: u16) -> u32 {
    let mut value = value as u32;
    value = (value | (value << 8)) & 0x00FF_00FF;
    value = (value | (value << 4)) & 0x0F0F_0F0F;
    value = (value | (value << 2)) & 0x3333_3333;
    (value | (value << 1)) & 0x5555_5555
}

const fn compact_bits(value: u32) -> u16 {
    let mut value = value & 0x5555_5555;
    value = (value | (value >> 1)) & 0x3333_3333;
    value = (value | (value >> 2)) & 0x0F0F_0F0F;
    value = (value | (value >> 4)) & 0x00FF_00FF;
    ((value | (value >> 8)) & 0x0000_FFFF) as u16
}
