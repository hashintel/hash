use core::{clone::CloneToUninit, ptr::Pointee};

use zeroize::Zeroize;

/// The contents of a [`Secret`](crate::Secret).
///
/// # Examples
///
/// ```
/// use hash_secret::{Secret, SecretBuffer};
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
/// # Ok::<(), error_stack::Report<hash_secret::HexError>>(())
/// ```
pub impl(crate) trait SecretBuffer: CloneToUninit {
    /// The unsized view of the contents.
    // Only unsized views are admitted, so neither `*` nor `mem::take` can move the contents out. A
    // view that is a custom DST can still own a field that is moved out, so every view is `[u8]` or
    // `str`.
    type View: ?Sized + AsRef<[u8]> + Pointee<Metadata = usize>;

    /// The contents as their view.
    fn as_view(&self) -> &Self::View;

    /// The contents as their mutable view.
    fn as_view_mut(&mut self) -> &mut Self::View;

    /// Overwrites the contents with zeros in a way the compiler does not remove.
    fn zeroize(contents: &mut Self);
}

impl<const N: usize> SecretBuffer for [u8; N] {
    type View = [u8];

    fn as_view(&self) -> &Self::View {
        self
    }

    fn as_view_mut(&mut self) -> &mut Self::View {
        self
    }

    fn zeroize(contents: &mut Self) {
        Zeroize::zeroize(contents);
    }
}

impl SecretBuffer for [u8] {
    type View = Self;

    fn as_view(&self) -> &Self::View {
        self
    }

    fn as_view_mut(&mut self) -> &mut Self::View {
        self
    }

    fn zeroize(contents: &mut Self) {
        Zeroize::zeroize(contents);
    }
}

impl SecretBuffer for str {
    type View = Self;

    fn as_view(&self) -> &Self::View {
        self
    }

    fn as_view_mut(&mut self) -> &mut Self::View {
        self
    }

    fn zeroize(contents: &mut Self) {
        Zeroize::zeroize(contents);
    }
}
