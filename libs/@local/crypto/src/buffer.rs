use core::{clone::CloneToUninit, ptr::Pointee};

use zeroize::Zeroize;

/// The contents of a [`Secret`](crate::Secret).
///
/// # Examples
///
/// ```
/// use hash_crypto::{Secret, SecretBuffer};
///
/// fn key_bytes<T: ?Sized + SecretBuffer>(secret: &Secret<T>) -> &[u8] {
///     secret.expose().as_ref()
/// }
///
/// let password = Secret::from_string("hunter2".to_owned());
/// let key = Secret::<[u8]>::from_hex(String::from("dead"))?;
///
/// assert_eq!(key_bytes(&password), b"hunter2");
/// assert_eq!(key_bytes(&key), b"\xDE\xAD");
/// # Ok::<(), error_stack::Report<hash_crypto::HexError>>(())
/// ```
pub impl(crate) trait SecretBuffer:
    AsRef<Self::View> + AsMut<Self::View> + Zeroize + CloneToUninit
{
    /// The unsized view of the contents.
    // Only unsized views are admitted, so neither `*` nor `mem::take` can move the contents out. A
    // view that is a custom DST can still own a field that is moved out, so every view is `[u8]` or
    // `str`.
    type View: ?Sized + AsRef<[u8]> + Pointee<Metadata = usize>;
}

impl<const N: usize> SecretBuffer for [u8; N] {
    type View = [u8];
}

impl SecretBuffer for [u8] {
    type View = Self;
}

impl SecretBuffer for str {
    type View = Self;
}
