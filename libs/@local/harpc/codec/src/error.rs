use core::{marker::PhantomData, num::NonZero};

use bytes::{Buf, BufMut, Bytes, BytesMut};

use self::kind::ErrorKind;

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

/// An error that is has been fully encoded and can be sent or received over the network.
///
/// Essentially a compiled version of a `NetworkError` or `Report<C>` into it's wire format.
///
/// An `EncodedError` is constructed through the `ErrorBuffer`.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct EncodedError {
    code: ErrorCode,
    bytes: Bytes,
}

impl EncodedError {
    pub fn new(code: ErrorCode, bytes: Bytes) -> Option<Self> {
        let &first = bytes.first()?;

        kind::Tag::variants()
            .into_iter()
            .any(|tag| tag as u8 == first)
            .then(|| Self { code, bytes })
    }

    pub const fn code(&self) -> ErrorCode {
        self.code
    }

    pub const fn bytes(&self) -> &Bytes {
        &self.bytes
    }

    pub fn into_parts(self) -> (ErrorCode, Bytes) {
        (self.code, self.bytes)
    }
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

pub mod kind {
    #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
    #[repr(u8)]
    pub enum Tag {
        NetworkError = 0x01,
        Report = 0x02,
        Recovery = 0xFF,
    }

    impl Tag {
        pub(crate) fn variants() -> impl IntoIterator<Item = Self> {
            [Self::NetworkError, Self::Report, Self::Recovery]
        }
    }

    pub trait ErrorKind {
        fn tag() -> Tag;
    }

    pub struct NetworkError {
        _private: (),
    }
    impl ErrorKind for NetworkError {
        fn tag() -> Tag {
            Tag::NetworkError
        }
    }

    pub struct Report {
        _private: (),
    }

    impl ErrorKind for Report {
        fn tag() -> Tag {
            Tag::Report
        }
    }

    pub struct Recovery {
        _private: (),
    }

    impl ErrorKind for Recovery {
        fn tag() -> Tag {
            Tag::Recovery
        }
    }
}

pub struct ErrorBuffer<T> {
    kind: PhantomData<fn() -> *const T>,
    buffer: BytesMut,
}

impl<T> ErrorBuffer<T>
where
    T: ErrorKind,
{
    fn new() -> Self {
        let mut buffer = BytesMut::new();
        buffer.put_u8(T::tag() as u8);

        Self {
            kind: PhantomData,
            buffer,
        }
    }

    #[must_use]
    pub fn finish(self, code: ErrorCode) -> EncodedError {
        EncodedError {
            code,
            bytes: self.buffer.freeze(),
        }
    }
}

impl ErrorBuffer<kind::NetworkError> {
    #[must_use]
    pub fn error() -> Self {
        Self::new()
    }
}

impl ErrorBuffer<kind::Report> {
    #[must_use]
    pub fn report() -> Self {
        Self::new()
    }
}

impl ErrorBuffer<kind::Recovery> {
    #[must_use]
    pub fn recovery() -> Self {
        Self::new()
    }
}

impl<T> Buf for ErrorBuffer<T> {
    fn remaining(&self) -> usize {
        self.buffer.remaining()
    }

    fn chunk(&self) -> &[u8] {
        self.buffer.chunk()
    }

    fn advance(&mut self, cnt: usize) {
        self.buffer.advance(cnt);
    }

    // These methods are specialized in the underlying `Bytes` implementation, relay them as well

    fn copy_to_bytes(&mut self, len: usize) -> Bytes {
        self.buffer.copy_to_bytes(len)
    }
}

#[expect(
    unsafe_code,
    reason = "delegating to the underlying `BytesMut` implementation"
)]
// SAFETY: we are delegating to the underlying `BytesMut` implementation
unsafe impl<T> BufMut for ErrorBuffer<T> {
    fn remaining_mut(&self) -> usize {
        self.buffer.remaining_mut()
    }

    unsafe fn advance_mut(&mut self, cnt: usize) {
        // SAFETY: This is safe, as we are delegating to the underlying `BytesMut` implementation
        unsafe {
            self.buffer.advance_mut(cnt);
        }
    }

    fn chunk_mut(&mut self) -> &mut bytes::buf::UninitSlice {
        self.buffer.chunk_mut()
    }

    // These methods are specialized in the underlying `BytesMut` implementation, relay them as well

    fn put<B: Buf>(&mut self, src: B)
    where
        Self: Sized,
    {
        self.buffer.put(src);
    }

    fn put_slice(&mut self, src: &[u8]) {
        self.buffer.put_slice(src);
    }

    fn put_bytes(&mut self, val: u8, cnt: usize) {
        self.buffer.put_bytes(val, cnt);
    }
}
