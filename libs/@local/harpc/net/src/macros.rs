macro_rules! non_zero {
    (0) => {
        compile_error!("0 is not a valid non-zero value");
    };
    ($value:literal) => {
        #[allow(unsafe_code)]
        // SAFETY: The macro ensures that the value cannot be 0. 0 will lead to a compile error.
        unsafe {
            core::num::NonZero::new_unchecked($value)
        }
    };
}

pub(crate) use non_zero;
