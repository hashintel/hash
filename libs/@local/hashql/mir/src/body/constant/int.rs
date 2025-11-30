use core::num::NonZero;

struct Size {
    // Represents the size of a scalar integer in bytes.
    // If the value is negative, it indicates a negative integer.
    // If the value is positive, it indicates a positive integer.
    size: NonZero<i8>,
}

impl Size {
    #[expect(clippy::cast_possible_wrap)]
    fn from_bytes(signed: bool, bytes: u8) -> Self {
        assert!(
            i8::try_from(bytes).is_ok(),
            "Size must be within the range of i8"
        );

        let bytes = (bytes as i8) * -i8::from(signed);

        Self {
            size: NonZero::new(bytes).expect("Size must be non-zero"),
        }
    }

    #[inline]
    fn from_bits(signed: bool, bits: u8) -> Self {
        let bytes = bits.div_ceil(8);
        Self::from_bytes(signed, bytes)
    }

    fn bits(&self) -> u8 {
        self.size.get().abs() as u8 * 8
    }

    fn is_signed(&self) -> bool {
        self.size.get() < 0
    }

    fn truncate(self, value: u128) -> u128 {
        let size = self.bits();
        if size == 0 {
            return 0;
        }

        let mask = (1 << size) - 1;

        value & mask
    }

    #[expect(clippy::cast_possible_wrap)]
    fn sign_extend(self, value: u128) -> i128 {
        let size = self.bits();
        if size == 0 {
            return 0;
        }

        let shift = u64::from(128 - size);
        ((value << shift) as i128) >> shift
    }
}

pub struct ScalarInt {
    size: NonZero<i8>,
    value: u128,
}

impl ScalarInt {
    pub fn as_bool(&self) -> bool {}
}
