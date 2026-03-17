#[macro_export]
macro_rules! debug_panic {
    ($($tt:tt)*) => {
        #[expect(clippy::manual_assert, reason = "debug_panic")]
        if cfg!(debug_assertions) {
            panic!($($tt)*)
        }
    };
}
