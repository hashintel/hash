use alloc::{boxed::Box, rc::Rc, string::String, sync::Arc, vec, vec::Vec};
use core::{fmt, marker::PhantomPinned, pin::Pin};

use aws_lc_rs::constant_time;
use error_stack::Report;
use zerocopy::FromZeros;
use zeroize::Zeroizing;

use crate::{
    SecretBuffer,
    hex::{HexError, decode_hex_into, decoded_len},
};

/// Secret bytes or text that are zeroed on drop.
///
/// [`expose`](Self::expose) reads the contents as their [view](SecretBuffer::View).
/// [`expose_mut`](Self::expose_mut) and [`decode_hex`](Self::decode_hex) write them through
/// `Pin<&mut Self>`. Pinning stops a secret from being moved, so its contents stay in the memory
/// that is zeroed on drop. A secret that is not pinned therefore holds only zeros, and moving it
/// copies no secret bytes. The views are unsized, so a plain `*` does not copy the contents out.
///
/// Cloning a `Pin<Box<Secret<T>>>` copies the contents into a new allocation, and cloning a
/// `Pin<Arc<_>>` or `Pin<Rc<_>>` shares them. These cannot be written, so a secret is filled first
/// and then copied with [`to_arc`](Self::to_arc) or [`to_rc`](Self::to_rc).
///
/// [`fmt::Debug`] leaves the contents out. `==` compares a secret with another secret of the same
/// view, such as a `Secret<[u8; 32]>` with a `Secret<[u8]>`, or with its view, such as
/// `&*secret == token`. It takes time that depends on the two lengths, not on the contents.
///
/// The zeroing covers the memory a secret owns when the secret is dropped. It does not cover:
///
/// - a secret that is never dropped, such as one passed to [`mem::forget`](core::mem::forget);
/// - copies left behind before a constructor received the value, such as the old buffer of a
///   [`String`] that grew;
/// - copies the compiler keeps in registers or on the stack;
/// - copies made of exposed contents.
///
/// # Examples
///
/// ```
/// use core::pin::pin;
///
/// use hash_crypto::Secret;
///
/// let mut hex = "0123456789abcdef".repeat(4);
/// let mut key = Box::pin(Secret::<[u8; 32]>::zeroed());
/// key.as_mut().decode_hex(&mut hex)?;
/// assert_eq!(key.len(), 32);
///
/// let mut session_key = pin!(Secret::<[u8; 4]>::zeroed());
/// session_key
///     .as_mut()
///     .decode_hex(&mut String::from("deadbeef"))?;
/// assert_eq!(&*session_key, b"\xDE\xAD\xBE\xEF".as_slice());
///
/// let password = Secret::from_string("hunter2".to_owned());
/// assert_eq!(&*password, "hunter2");
/// # Ok::<(), error_stack::Report<hash_crypto::HexError>>(())
/// ```
#[repr(transparent)]
pub struct Secret<T: ?Sized + SecretBuffer> {
    _pinned: PhantomPinned,
    contents: Zeroizing<T>,
}

#[expect(
    unsafe_code,
    reason = "retypes boxed, shared and counted contents as the transparent secret"
)]
impl<T: ?Sized + SecretBuffer> Secret<T> {
    fn from_boxed(contents: Box<T>) -> Box<Self> {
        // SAFETY: `Secret<T>` is `repr(transparent)` over `Zeroizing<T>`, which is
        //         `repr(transparent)` over `T`, so the allocation has the layout of a `Secret<T>`
        //         and the pointer keeps its metadata.
        unsafe { Box::from_raw(Box::into_raw(contents) as *mut Self) }
    }

    fn from_arc(contents: Arc<T>) -> Arc<Self> {
        // SAFETY: `Arc::from_raw` accepts a pointer to a type with the same layout, which
        //         `Secret<T>` has for the reason given in `from_boxed`.
        unsafe { Arc::from_raw(Arc::into_raw(contents) as *const Self) }
    }

    fn from_rc(contents: Rc<T>) -> Rc<Self> {
        // SAFETY: `Rc::from_raw` accepts a pointer to a type with the same layout, which
        //         `Secret<T>` has for the reason given in `from_boxed`.
        unsafe { Rc::from_raw(Rc::into_raw(contents) as *const Self) }
    }
}

impl Secret<[u8]> {
    /// Allocates a secret of `len` zero bytes.
    ///
    /// Write the contents through [`expose_mut`](Self::expose_mut),
    /// [`decode_hex`](Self::decode_hex) or [`fill_random`](Self::fill_random).
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_crypto::Secret;
    ///
    /// let mut key = Secret::zeroed_slice(4);
    /// key.as_mut().expose_mut().copy_from_slice(b"KEY!");
    ///
    /// assert_eq!(&*key, b"KEY!".as_slice());
    /// ```
    #[must_use]
    pub fn zeroed_slice(len: usize) -> Pin<Box<Self>> {
        Box::into_pin(Self::from_boxed(vec![0; len].into_boxed_slice()))
    }

    /// Decodes the bytes that the hexadecimal `hex` encodes into a new secret.
    ///
    /// `hex` is read as by [`decode_hex`](Self::decode_hex). Its buffer, spare capacity included,
    /// is then zeroed and freed, on failure as well.
    ///
    /// # Errors
    ///
    /// Returns [`HexError::OddLength`] if `hex` has an odd length, and otherwise
    /// [`HexError::Digit`] if it contains a character that is not a hexadecimal digit.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_crypto::Secret;
    ///
    /// let key = Secret::<[u8]>::from_hex(String::from("deadbeef"))?;
    ///
    /// assert_eq!(&*key, b"\xDE\xAD\xBE\xEF".as_slice());
    /// # Ok::<(), error_stack::Report<hash_crypto::HexError>>(())
    /// ```
    pub fn from_hex(hex: String) -> Result<Pin<Box<Self>>, Report<HexError>> {
        // `decode_hex` zeroes only the characters, this also zeroes the spare capacity.
        let mut hex = Zeroizing::new(hex);
        let mut secret = Self::zeroed_slice(decoded_len(&mut hex)?);
        secret.as_mut().decode_hex(&mut hex)?;
        Ok(secret)
    }

    /// Turns `value` into a new secret.
    ///
    /// The bytes are copied, and the buffer of `value`, spare capacity included, is zeroed and
    /// freed.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_crypto::Secret;
    ///
    /// let key = Secret::from_vec(vec![0xDE, 0xAD, 0xBE, 0xEF]);
    ///
    /// assert_eq!(&*key, b"\xDE\xAD\xBE\xEF".as_slice());
    /// ```
    #[must_use]
    pub fn from_vec(value: Vec<u8>) -> Pin<Box<Self>> {
        let value = Zeroizing::new(value);
        Box::into_pin(Self::from_boxed(Box::from(value.as_slice())))
    }
}

impl<T: SecretBuffer + FromZeros> Secret<T> {
    /// A secret whose contents are all zero bytes.
    // Any other constructor that returns `Self` must return zeros as well, see the type
    // documentation.
    pub(crate) fn new_zeroed() -> Self {
        Self {
            _pinned: PhantomPinned,
            contents: Zeroizing::new(T::new_zeroed()),
        }
    }
}

impl<const N: usize> Secret<[u8; N]> {
    /// A secret of `N` zero bytes.
    ///
    /// Pin it with [`Box::pin`] or [`pin!`](core::pin::pin), then write the contents through
    /// [`expose_mut`](Self::expose_mut), [`decode_hex`](Self::decode_hex) or
    /// [`fill_random`](Self::fill_random).
    ///
    /// # Examples
    ///
    /// ```
    /// use core::pin::pin;
    ///
    /// use hash_crypto::Secret;
    ///
    /// let mut boxed = Box::pin(Secret::<[u8; 4]>::zeroed());
    /// boxed.as_mut().expose_mut().copy_from_slice(b"KEY!");
    ///
    /// // On the stack, without an allocation.
    /// let mut stacked = pin!(Secret::<[u8; 4]>::zeroed());
    /// stacked.as_mut().expose_mut().copy_from_slice(b"KEY!");
    ///
    /// assert_eq!(&*boxed, b"KEY!".as_slice());
    /// assert_eq!(&*stacked, b"KEY!".as_slice());
    /// ```
    #[must_use]
    pub fn zeroed() -> Self {
        Self::new_zeroed()
    }

    /// Decodes the `N` bytes that the hexadecimal `hex` encodes into a new secret.
    ///
    /// `hex` is read as by [`decode_hex`](Self::decode_hex). Its buffer, spare capacity included,
    /// is then zeroed and freed, on failure as well.
    ///
    /// # Errors
    ///
    /// Returns [`HexError::Length`] if `hex` is not `2 * N` bytes long, and otherwise
    /// [`HexError::Digit`] if it contains a character that is not a hexadecimal digit.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_crypto::Secret;
    ///
    /// let key = Secret::<[u8; 4]>::from_hex(String::from("deadbeef"))?;
    ///
    /// assert_eq!(&*key, b"\xDE\xAD\xBE\xEF".as_slice());
    /// # Ok::<(), error_stack::Report<hash_crypto::HexError>>(())
    /// ```
    pub fn from_hex(hex: String) -> Result<Pin<Box<Self>>, Report<HexError>> {
        // `decode_hex` zeroes only the characters, this also zeroes the spare capacity.
        let mut hex = Zeroizing::new(hex);
        let mut secret = Box::pin(Self::zeroed());
        secret.as_mut().decode_hex(&mut hex)?;
        Ok(secret)
    }
}

impl Secret<str> {
    /// Turns `value` into a new secret.
    ///
    /// The text is copied, and the buffer of `value`, spare capacity included, is zeroed and freed.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_crypto::Secret;
    ///
    /// let password = Secret::from_string("hunter2".to_owned());
    ///
    /// assert_eq!(&*password, "hunter2");
    /// ```
    ///
    /// A clone of a borrowed `String` would leave the original behind, so take the text out of it:
    ///
    /// ```
    /// use core::mem;
    ///
    /// use hash_crypto::Secret;
    ///
    /// struct Config {
    ///     password: String,
    /// }
    ///
    /// let mut config = Config {
    ///     password: "hunter2".to_owned(),
    /// };
    /// let password = Secret::from_string(mem::take(&mut config.password));
    ///
    /// assert_eq!(&*password, "hunter2");
    /// assert!(config.password.is_empty());
    /// ```
    #[must_use]
    pub fn from_string(value: String) -> Pin<Box<Self>> {
        let value = Zeroizing::new(value);
        Box::into_pin(Self::from_boxed(Box::from(value.as_str())))
    }
}

impl<T: ?Sized + SecretBuffer> Secret<T> {
    /// The contents as their view.
    ///
    /// Compare the secret itself through `==`, not this view: `==` on a `&[u8]` or a `&str` does
    /// not take constant time.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_crypto::Secret;
    ///
    /// let password = Secret::from_string("hunter2".to_owned());
    ///
    /// assert_eq!(password.expose().len(), 7);
    /// assert_eq!(&*password, "hunter2");
    /// ```
    #[must_use]
    pub fn expose(&self) -> &T::View {
        self.contents.as_ref()
    }

    /// The contents as their mutable view.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_crypto::Secret;
    ///
    /// let mut password = Secret::from_string("hunter2".to_owned());
    /// password.as_mut().expose_mut().make_ascii_uppercase();
    ///
    /// assert_eq!(&*password, "HUNTER2");
    /// ```
    #[must_use]
    #[expect(
        unsafe_code,
        reason = "borrows the contents of the pinned secret mutably"
    )]
    pub fn expose_mut(self: Pin<&mut Self>) -> &mut T::View {
        // SAFETY: The `Secret` is not moved: only its contents are borrowed, and pinning is not
        //         structural for them.
        unsafe { self.get_unchecked_mut() }.contents.as_mut()
    }

    /// Whether the contents equal `other`, in time that depends on the two lengths, not on the
    /// contents.
    fn ct_eq(&self, other: &T::View) -> bool {
        constant_time::verify_slices_are_equal(self.expose().as_ref(), other.as_ref()).is_ok()
    }

    /// The length of the contents in bytes.
    #[must_use]
    pub fn len(&self) -> usize {
        self.expose().as_ref().len()
    }

    /// Whether the contents are empty.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.expose().as_ref().is_empty()
    }

    /// Copies the contents into a new secret in a [`Box`].
    #[must_use]
    pub fn to_boxed(&self) -> Pin<Box<Self>> {
        Box::into_pin(Self::from_boxed(Box::clone_from_ref(&self.contents)))
    }

    /// Copies the contents into a new secret in an [`Arc`].
    ///
    /// # Examples
    ///
    /// ```
    /// use core::pin::{Pin, pin};
    /// use std::sync::Arc;
    ///
    /// use hash_crypto::Secret;
    ///
    /// let mut key = pin!(Secret::<[u8; 4]>::zeroed());
    /// key.as_mut().decode_hex(&mut String::from("deadbeef"))?;
    ///
    /// let shared: Pin<Arc<Secret<[u8]>>> = key.to_arc();
    /// let clone = Pin::clone(&shared);
    ///
    /// assert_eq!(&*clone, b"\xDE\xAD\xBE\xEF".as_slice());
    /// assert!(core::ptr::eq(shared.expose(), clone.expose()));
    /// # Ok::<(), error_stack::Report<hash_crypto::HexError>>(())
    /// ```
    #[must_use]
    #[expect(unsafe_code, reason = "pins the new shared secret")]
    pub fn to_arc(&self) -> Pin<Arc<Self>> {
        let shared = Self::from_arc(Arc::clone_from_ref(&self.contents));
        // SAFETY: `shared` was just created, so the returned `Pin` holds the only `Arc` to the
        //         secret and nothing can move it out.
        unsafe { Pin::new_unchecked(shared) }
    }

    /// Copies the contents into a new secret in an [`Rc`].
    #[must_use]
    #[expect(unsafe_code, reason = "pins the new counted secret")]
    pub fn to_rc(&self) -> Pin<Rc<Self>> {
        let counted = Self::from_rc(Rc::clone_from_ref(&self.contents));
        // SAFETY: `counted` was just created, so the returned `Pin` holds the only `Rc` to the
        //         secret and nothing can move it out.
        unsafe { Pin::new_unchecked(counted) }
    }
}

impl<T: ?Sized + SecretBuffer<View = [u8]>> Secret<T> {
    /// Decodes the hexadecimal `hex` into the contents.
    ///
    /// Upper- and lowercase digits are accepted. The characters of `hex` are zeroed afterwards, on
    /// failure as well, but the spare capacity of a [`String`] that holds them is not. On failure
    /// the contents are zeroed too.
    ///
    /// # Errors
    ///
    /// Returns [`HexError::Length`] if the length of `hex` is not twice that of the contents, and
    /// otherwise [`HexError::Digit`] if it contains a character that is not a hexadecimal digit.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_crypto::{HexError, Secret};
    ///
    /// // A value read from a file or an environment variable often ends with a newline.
    /// let mut hex = String::from("deadbeef\n");
    /// hex.truncate(hex.trim_ascii_end().len());
    ///
    /// let mut key = Box::pin(Secret::<[u8; 4]>::zeroed());
    /// key.as_mut().decode_hex(&mut hex)?;
    /// assert_eq!(&*key, b"\xDE\xAD\xBE\xEF".as_slice());
    ///
    /// let report = key
    ///     .as_mut()
    ///     .decode_hex(&mut String::from("dead"))
    ///     .expect_err("four digits should not fill four bytes");
    /// assert_eq!(report.current_context(), &HexError::Length { expected: 8 });
    /// assert_eq!(&*key, [0; 4].as_slice());
    /// # Ok::<(), error_stack::Report<hash_crypto::HexError>>(())
    /// ```
    pub fn decode_hex(self: Pin<&mut Self>, hex: &mut str) -> Result<(), Report<HexError>> {
        decode_hex_into(self.expose_mut(), hex)
    }
}

// `Pin<Box<Secret<T>>>` clones through this impl. An unpinned `Box<Secret<T>>` holds only zeros,
// see the type documentation, so cloning one copies no secret bytes.
impl<T: ?Sized + SecretBuffer> Clone for Box<Secret<T>> {
    fn clone(&self) -> Self {
        Secret::from_boxed(Box::clone_from_ref(&self.contents))
    }
}

impl<T: ?Sized + SecretBuffer> fmt::Debug for Secret<T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("Secret").finish_non_exhaustive()
    }
}

impl<T, U> PartialEq<Secret<U>> for Secret<T>
where
    T: ?Sized + SecretBuffer,
    U: ?Sized + SecretBuffer<View = T::View>,
{
    /// Compares the contents in constant time: the time depends on the two lengths, not on the
    /// bytes.
    fn eq(&self, other: &Secret<U>) -> bool {
        self.ct_eq(other.expose())
    }
}

impl<T: ?Sized + SecretBuffer> Eq for Secret<T> {}

impl<T: ?Sized + SecretBuffer<View = [u8]>> PartialEq<[u8]> for Secret<T> {
    /// Compares the contents in constant time: the time depends on the two lengths, not on the
    /// bytes.
    fn eq(&self, other: &[u8]) -> bool {
        self.ct_eq(other)
    }
}

impl<T: ?Sized + SecretBuffer<View = str>> PartialEq<str> for Secret<T> {
    /// Compares the contents in constant time: the time depends on the two lengths, not on the
    /// bytes.
    fn eq(&self, other: &str) -> bool {
        self.ct_eq(other)
    }
}

#[cfg(test)]
mod tests {
    use alloc::{boxed::Box, format, rc::Rc, string::String, sync::Arc, vec::Vec};
    use core::pin::{Pin, pin};

    use rstest::rstest;

    use crate::{HexError, Secret, SecretBuffer};

    fn bytes_secret(bytes: &[u8]) -> Pin<Box<Secret<[u8]>>> {
        let mut secret = Secret::zeroed_slice(bytes.len());
        secret.as_mut().expose_mut().copy_from_slice(bytes);
        secret
    }

    fn array_secret<const N: usize>(bytes: [u8; N]) -> Pin<Box<Secret<[u8; N]>>> {
        let mut secret = Box::pin(Secret::zeroed());
        secret.as_mut().expose_mut().copy_from_slice(&bytes);
        secret
    }

    #[test]
    fn from_hex_slice_odd() {
        let report =
            Secret::<[u8]>::from_hex(String::from("abc")).expect_err("the hex should not parse");

        assert_eq!(
            report.current_context(),
            &HexError::OddLength,
            "the error should name the odd length"
        );
    }

    #[test]
    fn from_string_views() {
        let secret = Secret::from_string(String::from("hunter2"));

        assert_eq!(
            secret.len(),
            7,
            "the length should count the bytes of the text"
        );
        assert!(!secret.is_empty(), "the secret should not be empty");
        assert_eq!(
            secret.expose(),
            "hunter2",
            "the secret should hold the text"
        );
        assert_eq!(
            secret.expose().as_bytes(),
            b"hunter2",
            "the text should also be readable as bytes"
        );
    }

    #[test]
    fn from_string_spare_capacity() {
        let mut value = String::with_capacity(32);
        value.push_str("hunter2");

        // The text is copied out of the buffer, which Miri checks is freed with the layout it was
        // allocated with.
        let secret = Secret::from_string(value);

        assert_eq!(
            secret.expose(),
            "hunter2",
            "the secret should hold the text"
        );
    }

    #[test]
    fn from_vec_spare_capacity() {
        let mut value = Vec::with_capacity(32);
        value.extend_from_slice(b"KEY!");

        // The bytes are copied out of the buffer, which Miri checks is freed with the layout it was
        // allocated with.
        let secret = Secret::from_vec(value);

        assert_eq!(secret.expose(), b"KEY!", "the secret should hold the bytes");
    }

    #[test]
    fn zeroed_all_zero() {
        let array = Secret::<[u8; 4]>::zeroed();
        let slice = Secret::zeroed_slice(4);

        assert_eq!(array.expose(), &[0; 4], "the array should hold only zeros");
        assert_eq!(slice.expose(), &[0; 4], "the slice should hold only zeros");
    }

    #[test]
    fn decode_hex_in_place() {
        let mut secret = pin!(Secret::<[u8; 4]>::zeroed());
        let mut src = String::from("deadBEEF");

        secret
            .as_mut()
            .decode_hex(&mut src)
            .expect("the hex should decode");

        assert_eq!(
            secret.expose(),
            &[0xDE, 0xAD, 0xBE, 0xEF],
            "the secret should hold the decoded bytes"
        );
        assert!(
            src.bytes().all(|byte| byte == 0),
            "the source should be zeroed"
        );
    }

    #[test]
    fn unsize_box() {
        let array = array_secret([1, 2, 3, 4, 5]);
        // Dropping the secret frees it as a `Secret<[u8]>`, which Miri checks against the layout
        // it was allocated with.
        let slice: Pin<Box<Secret<[u8]>>> = array;

        assert_eq!(
            slice.expose(),
            &[1, 2, 3, 4, 5],
            "the unsized secret should hold the bytes"
        );
    }

    #[test]
    fn unsize_stack() {
        let mut array = pin!(Secret::<[u8; 4]>::zeroed());
        let slice: Pin<&mut Secret<[u8]>> = array.as_mut();

        slice
            .decode_hex(&mut String::from("deadbeef"))
            .expect("the hex should decode");

        assert_eq!(
            array.expose(),
            &[0xDE, 0xAD, 0xBE, 0xEF],
            "the array should hold the bytes written through the unsized secret"
        );
    }

    #[test]
    fn is_empty_zero_length() {
        let zeroed = Secret::zeroed_slice(0);
        let array = Secret::<[u8; 0]>::zeroed();
        let slice = Secret::<[u8]>::from_hex(String::new()).expect("the empty hex should parse");

        assert!(zeroed.is_empty(), "a zeroed empty slice should be empty");
        assert!(array.is_empty(), "a zeroed empty array should be empty");
        assert!(slice.is_empty(), "an empty slice should be empty");
    }

    #[rstest]
    #[case::array(array_secret([0xAB, 0xCD]), &[0xAB, 0xCD])]
    #[case::slice(bytes_secret(&[0xEF, 0x01]), &[0xEF, 0x01])]
    #[case::text(Secret::from_string("hunter2".to_owned()), b"hunter2")]
    fn clone_contents<T>(#[case] secret: Pin<Box<Secret<T>>>, #[case] expected: &[u8])
    where
        T: ?Sized + SecretBuffer,
    {
        assert_eq!(
            Pin::clone(&secret).expose().as_ref(),
            expected,
            "the clone should hold the contents"
        );
        assert_eq!(
            secret.to_boxed().expose().as_ref(),
            expected,
            "the boxed copy should hold the contents"
        );
        assert_eq!(
            secret.to_arc().expose().as_ref(),
            expected,
            "the shared copy should hold the contents"
        );
        assert_eq!(
            secret.to_rc().expose().as_ref(),
            expected,
            "the counted copy should hold the contents"
        );
    }

    #[test]
    fn to_arc_unsize() {
        let mut array = pin!(Secret::<[u8; 64]>::zeroed());
        array.as_mut().expose_mut().fill(0xAB);

        // Dropping the secret frees it as a `Secret<[u8]>`, which Miri checks against the layout
        // it was allocated with.
        let shared: Pin<Arc<Secret<[u8]>>> = array.to_arc();

        assert_eq!(
            shared.expose(),
            &[0xAB; 64],
            "the shared slice should hold the bytes"
        );
    }

    #[test]
    fn debug_redacted() {
        let secret = Secret::from_string("hunter2".to_owned());

        assert_eq!(
            format!("{secret:?}"),
            "Secret { .. }",
            "the debug output should leave out the contents"
        );
    }

    #[test]
    fn pinned_send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}

        assert_send_sync::<Pin<Box<Secret<[u8; 32]>>>>();
        assert_send_sync::<Pin<Box<Secret<[u8]>>>>();
        assert_send_sync::<Pin<Box<Secret<str>>>>();
        assert_send_sync::<Pin<Arc<Secret<[u8]>>>>();
        assert_send_sync::<Pin<Arc<Secret<str>>>>();
    }

    #[rstest]
    #[case::same_bytes(&[1, 2, 3], &[1, 2, 3], true)]
    #[case::other_bytes(&[1, 2, 3], &[1, 2, 4], false)]
    #[case::other_length(&[1, 2, 3], &[1, 2], false)]
    #[cfg_attr(miri, ignore = "Miri cannot run AWS-LC's C code")]
    fn eq_bytes(#[case] left: &[u8], #[case] right: &[u8], #[case] expected: bool) {
        let left = bytes_secret(left);
        let right = bytes_secret(right);

        assert_eq!(
            left == right,
            expected,
            "secrets should be equal exactly if their bytes are"
        );
    }

    #[test]
    #[cfg_attr(miri, ignore = "Miri cannot run AWS-LC's C code")]
    fn eq_array_slice() {
        let array = array_secret([1, 2, 3]);
        let slice = bytes_secret(&[1, 2, 3]);
        let other = bytes_secret(&[1, 2, 4]);

        assert_eq!(
            &*array, &*slice,
            "an array secret should equal a slice secret with the same bytes"
        );
        assert_eq!(
            &*slice, &*array,
            "a slice secret should equal an array secret with the same bytes"
        );
        assert_ne!(
            &*array, &*other,
            "an array secret should differ from a slice secret with other bytes"
        );
    }

    #[test]
    #[cfg_attr(miri, ignore = "Miri cannot run AWS-LC's C code")]
    fn eq_views() {
        let boxed = Secret::from_string("hunter2".to_owned());
        let mut stack = pin!(Secret::<[u8; 2]>::zeroed());
        stack.as_mut().expose_mut().copy_from_slice(b"ab");
        let shared = boxed.to_arc();
        let counted: Pin<Rc<Secret<[u8]>>> = stack.to_rc();

        assert_eq!(&*boxed, "hunter2", "a boxed secret should equal its text");
        assert_ne!(
            &*boxed, "hunter3",
            "a boxed secret should differ from other text"
        );
        assert_eq!(&*shared, "hunter2", "a shared secret should equal its text");
        assert_ne!(
            &*shared, "hunter3",
            "a shared secret should differ from other text"
        );
        assert_eq!(
            &*stack,
            b"ab".as_slice(),
            "a stack secret should equal its bytes"
        );
        assert_ne!(
            &*stack,
            b"ba".as_slice(),
            "a stack secret should differ from other bytes"
        );
        assert_eq!(
            &*counted,
            b"ab".as_slice(),
            "a counted secret should equal its bytes"
        );
        assert_ne!(
            &*counted,
            b"ba".as_slice(),
            "a counted secret should differ from other bytes"
        );
    }

    #[test]
    fn expose_mut_text() {
        let mut secret = Secret::from_string("hunter2".to_owned());

        secret.as_mut().expose_mut().make_ascii_uppercase();

        assert_eq!(
            secret.expose(),
            "HUNTER2",
            "the text should be changed in place"
        );
    }

    #[rstest]
    #[case::same_text("hunter2", "hunter2", true)]
    #[case::other_text("hunter2", "hunter3", false)]
    #[case::other_length("hunter2", "hunter", false)]
    #[case::empty("", "", true)]
    #[cfg_attr(miri, ignore = "Miri cannot run AWS-LC's C code")]
    fn ct_eq_text(#[case] secret: &str, #[case] other: &str, #[case] expected: bool) {
        let secret = Secret::from_string(String::from(secret));

        assert_eq!(
            secret.ct_eq(other),
            expected,
            "the secret should equal exactly the same text"
        );
    }
}
