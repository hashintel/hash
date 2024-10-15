use core::num::NonZero;

macro_rules! non_zero {
    ($n:expr) => {{
        // ensure that the value is not 0, in case it is, panic during compile time
        const {
            assert!($n != 0, "value must not be 0");
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
macro_rules! define_error_code_consts {
    ($(
        $(#[$meta:meta])*
        $base:literal => [$(
            $(#[$name_meta:meta])*
            $name:ident
        ),+]
    ),*) => {
        $(
            $(#[$meta])*
            impl ErrorCode {
                $(
                    $(#[$name_meta])*
                    ///
                    ///
                    /// **Error Code**: `
                    #[doc = stringify!($base)]
                    #[doc = "+"]
                    #[doc = stringify!(${index(0)})]
                    #[doc = "`"]
                    pub const $name: Self = Self(non_zero!($base + ${index(0)}));
                )+
            }
        )*
    };
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
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

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for ErrorCode {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = u16::deserialize(deserializer)?;

        NonZero::new(value)
            .map(Self)
            .ok_or_else(|| serde::de::Error::custom("value must not be 0"))
    }
}

define_error_code_consts! {
    // 0xFE_xx = client errors
    /// Errors initiated by the client, but that occur on the server.
    ///
    /// These errors are issued on the higher-level tower implementation.
    0xFE_10 => [
        /// The combination of service and version requirement could not be found on the server.
        ///
        /// The HTTP equivalent is 404 Not Found.
        NOT_FOUND
    ],
    // 0xFF_xx = server errors
    /// Errors that occur in a session and are issued by the server.
    ///
    /// These errors are issued on the lower-level network layer.
    0xFF_00 => [
        /// Server is shutting down.
        ///
        /// The server is in the process of shutting down and no longer acceptts new connections.
        CONNECTION_SHUTDOWN,
        /// Connection transaction limit reached.
        ///
        /// The total count of concurrent transaction per connection has been reached.
        CONNECTION_TRANSACTION_LIMIT_REACHED,
        /// Instance transaction limit reached.
        ///
        /// The total count of concurrent transaction per server node has been reached.
        INSTANCE_TRANSACTION_LIMIT_REACHED,
        /// Transaction is lagging behind.
        ///
        /// The client sent too many packets that haven't been processed by the server yet,
        /// which lead to packets dropping and the transaction being cancelled.
        TRANSACTION_LAGGING
    ],
    /// Errors that occur due to malformed payloads in the tower layer.
    0xFF_10 => [
        /// Encoded error encountered an invalid error tag.
        ///
        /// The returned payload for an encoded error does not have a valid error tag to distinguish
        /// between the different error encodings and could therefore not be properly encoded.
        ///
        /// This is a fault in the implementation of the server, either in the `codec` or
        /// the `tower` layer.
        PACK_INVALID_ERROR_TAG
    ],
    /// Generic server errors.
    0xFF_F0 => [
        /// An internal server error occurred.
        ///
        /// An unknown error occurred on the server.
        INTERNAL_SERVER_ERROR
    ]
}
