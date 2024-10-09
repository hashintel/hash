use core::num::NonZero;

macro_rules! non_zero {
    ($n:expr) => {{
        // ensure that the value is not 0, in case it is, panic during compile time
        const {
            let ones = $n.count_ones() as usize;
            assert!(ones != 0, "value must not be 0");
        }

        #[expect(unsafe_code, reason = "checked that it is never 0")]
        // SAFETY: $value is not 0
        unsafe {
            NonZero::new_unchecked($n)
        }
    }};
}

// we use a macro here to define the error codes, as the code is quite repetetive and also error
// prone, we might not be able to increment values correctly, another problem is that rustfmt will
// reorder the constants, making keeping tracks of the ids harder than it should be.
macro_rules! define {
    ($($base:literal => [$($name:ident),+]),*) => {
        $(
            impl ErrorCode {
                $(
                    pub const $name: Self = Self(non_zero!(($base as u16) + ${index(0)}));
                )+
            }
        )*
    };
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "proptest", derive(test_strategy::Arbitrary))]
pub struct ErrorCode(NonZero<u16>);

impl ErrorCode {
    #[must_use]
    pub const fn new(value: NonZero<u16>) -> Self {
        Self(value)
    }

    #[must_use]
    pub const fn value(self) -> NonZero<u16> {
        self.0
    }
}

define! {
    // 0xFE_xx = client errors
    // Initiated by client, but occur on server (tower level)
    0xFE_10 => [
        NOT_FOUND // akin to 404
    ],
    // 0xFF_xx = server errors
    // Server Session Errors
    0xFF_00 => [
        CONNECTION_CLOSED,
        CONNECTION_SHUTDOWN,
        CONNECTION_TRANSACTION_LIMIT_REACHED,
        INSTANCE_TRANSACTION_LIMIT_REACHED,
        TRANSACTION_LAGGING
    ],
    // Generic Errors
    0xFF_10 => [
        INTERNAL_SERVER_ERROR
    ]
}

pub trait NetworkError {
    fn code(&self) -> ErrorCode;
}

impl<T> NetworkError for T
where
    T: core::error::Error,
{
    fn code(&self) -> ErrorCode {
        core::error::request_ref::<ErrorCode>(self)
            .copied()
            .or_else(|| core::error::request_value::<ErrorCode>(self))
            .unwrap_or(ErrorCode::INTERNAL_SERVER_ERROR)
    }
}
