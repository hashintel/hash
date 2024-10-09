use core::{marker::PhantomData, num::NonZero};

use bytes::{Buf, BufMut, Bytes, BytesMut};

use self::kind::ErrorKind;

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
    pub const fn code(&self) -> ErrorCode {
        self.code
    }

    pub const fn bytes(&self) -> &Bytes {
        &self.bytes
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
    pub trait ErrorKind {
        fn tag() -> u8;
    }

    pub struct NetworkError {
        _private: (),
    }

    impl ErrorKind for NetworkError {
        fn tag() -> u8 {
            0x00
        }
    }

    pub struct Report {
        _private: (),
    }

    impl ErrorKind for Report {
        fn tag() -> u8 {
            0x01
        }
    }

    pub struct Recovery {
        _private: (),
    }

    impl ErrorKind for Recovery {
        fn tag() -> u8 {
            0xFF
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
        buffer.put_u8(T::tag());

        Self {
            kind: PhantomData,
            buffer,
        }
    }

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
        self.buffer.advance(cnt)
    }

    // These methods are specialized in the underlying `Bytes` implementation, relay them as well

    fn copy_to_bytes(&mut self, len: usize) -> Bytes {
        self.buffer.copy_to_bytes(len)
    }
}

#[expect(unsafe_code, reason = "delegating to underlying buffer")]
unsafe impl<T> BufMut for ErrorBuffer<T> {
    fn remaining_mut(&self) -> usize {
        self.buffer.remaining_mut()
    }

    unsafe fn advance_mut(&mut self, cnt: usize) {
        unsafe { self.buffer.advance_mut(cnt) }
    }

    fn chunk_mut(&mut self) -> &mut bytes::buf::UninitSlice {
        self.buffer.chunk_mut()
    }

    // These methods are specialized in the underlying `BytesMut` implementation, relay them as well

    fn put<B: Buf>(&mut self, src: B)
    where
        Self: Sized,
    {
        self.buffer.put(src)
    }

    fn put_slice(&mut self, src: &[u8]) {
        self.buffer.put_slice(src)
    }

    fn put_bytes(&mut self, val: u8, cnt: usize) {
        self.buffer.put_bytes(val, cnt)
    }
}
