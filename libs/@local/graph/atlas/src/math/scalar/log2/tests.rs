use proptest::{prop_assert_eq, property_test};

use crate::math::Log2;

/// The whole `u8` domain, exhaustively: exactly the shiftable exponents construct.
#[test]
fn new_shift_domain() {
    for value in 0_u8..64 {
        let exponent = Log2::new(value).expect("values below the shift width construct");
        assert_eq!(exponent.get(), value);
        // The type guarantees that a shift by an exponent that exists cannot panic.
        let _power = 1_u64 << exponent.get();
    }
    for value in 64_u8..=u8::MAX {
        assert_eq!(Log2::new(value), None);
    }
}

#[property_test]
fn checked_add_powers(left: Log2, right: Log2) {
    let product = (1_u64 << left.get()).checked_mul(1_u64 << right.get());
    let summed = left.checked_add(right).map(|sum| 1_u64 << sum.get());
    prop_assert_eq!(summed, product);
}

#[test]
fn checked_add_shift_boundary() {
    let largest = Log2::new(63).expect("should be below the shift width");
    assert_eq!(largest.checked_add(Log2::ZERO), Some(largest));
    assert_eq!(largest.checked_add(Log2::ONE), None);
    assert_eq!(largest.checked_add(largest), None);
}

#[test]
#[expect(clippy::non_ascii_literal, reason = "Display uses superscript digits")]
fn display_superscript_digits() {
    for (exponent, expected) in [(0, "2⁰"), (9, "2⁹"), (10, "2¹⁰"), (63, "2⁶³")] {
        let exponent = Log2::new(exponent).expect("should be below the shift width");
        assert_eq!(exponent.to_string(), expected);
    }
}

mod miri {
    use zerocopy::TryFromBytes as _;

    use crate::math::Log2;

    /// `Log2` reads a byte below the shift width and refuses `64` and `255`.
    #[test]
    fn try_from_bytes_domain() {
        assert_eq!(
            Log2::try_read_from_bytes(&[10_u8])
                .expect("10 lies below the shift width")
                .get(),
            10,
        );
        Log2::try_read_from_bytes(&[64_u8]).expect_err("64 is the shift width itself, refused");
        Log2::try_read_from_bytes(&[255_u8]).expect_err("255 is far past the shift width");
    }
}
