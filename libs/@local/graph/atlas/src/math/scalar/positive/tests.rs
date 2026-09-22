use proptest::{prop_assert, prop_assert_eq, property_test};

use crate::math::{DFinite, Positive, positive};

/// The positive domain is exactly the finite `f32` values strictly above zero.
#[test]
fn new_domain() {
    assert_eq!(
        Positive::new(f32::MIN_POSITIVE)
            .expect("a tiny positive constructs")
            .get(),
        f32::MIN_POSITIVE,
    );
    assert_eq!(
        Positive::new(f32::MAX)
            .expect("the maximum is finite")
            .get(),
        f32::MAX
    );

    assert_eq!(Positive::new(0.0), None);
    assert_eq!(Positive::new(-0.0), None);
    assert_eq!(Positive::new(-1.0), None);
    assert_eq!(Positive::new(f32::INFINITY), None);
    assert_eq!(Positive::new(f32::NAN), None);
}

#[test]
fn ln_wide_range_edges() {
    let lower = Positive::MIN.ln_wide();
    let upper = Positive::MAX.ln_wide();
    assert!(
        149.0_f64
            .mul_add(core::f64::consts::LN_2, lower.get())
            .abs()
            < 1e-12
    );
    assert!((upper.get() - f64::from(f32::MAX).ln()).abs() < 1e-12);
    assert_eq!(Positive::ONE.ln_wide(), DFinite::ZERO);
}

#[property_test]
fn mul_wide_exact(left: Positive, right: Positive) {
    let product = left.mul_wide(right);
    prop_assert_eq!((product / left.widen()).finish(), Ok(right.widen()));
    prop_assert_eq!((product / right.widen()).finish(), Ok(left.widen()));
}

#[property_test]
fn geometric_mean_bounds(left: Positive, right: Positive) {
    let mean = left.geometric_mean(right);
    prop_assert!(left.min(right) <= mean && mean <= left.max(right));
    prop_assert_eq!(mean, right.geometric_mean(left));
}

#[property_test]
fn geometric_mean_identity(value: Positive) {
    prop_assert_eq!(value.geometric_mean(value), value);
}

#[test]
fn mul_wide_range_edges() {
    assert!(Positive::MIN.mul_wide(Positive::MIN).get() > 0.0);
    assert!(Positive::MAX.mul_wide(Positive::MAX).get().is_finite());
    assert_eq!(Positive::MIN.checked_mul(positive!(0.5)), None);
    assert_eq!(Positive::MAX.checked_mul(positive!(2.0)), None);
}

mod miri {
    #![expect(
        clippy::host_endian_bytes,
        reason = "fixture bytes must match the native-endian representation that is_bit_valid \
                  reads"
    )]

    use zerocopy::TryFromBytes as _;

    use crate::math::Positive;

    /// `Positive` reads canonical positive bytes and refuses zero and NaN.
    #[test]
    fn try_from_bytes_domain() {
        assert_eq!(
            Positive::try_read_from_bytes(&1.5_f32.to_ne_bytes())
                .expect("1.5 is canonical")
                .get(),
            1.5,
        );
        Positive::try_read_from_bytes(&0.0_f32.to_ne_bytes()).expect_err("zero is refused");
        Positive::try_read_from_bytes(&f32::NAN.to_ne_bytes()).expect_err("NaN is refused");
    }
}
