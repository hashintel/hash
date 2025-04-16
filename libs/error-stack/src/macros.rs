/// Creates a [`Report`] from the given parameters.
///
/// The parameters may either be [`Error`] or a [`Report`]. The returned [`Report`] will use the
/// the provided type as context.
///
/// [`Report`]: crate::Report
/// [`Error`]: core::error::Error
///
/// # Examples
///
/// Create a [`Report`] from [`Error`]:
///
/// ```rust
/// # #![expect(deprecated, reason = "`report!` is deprecated")]
/// use std::fs;
///
/// use error_stack::report;
///
/// # fn wrapper() -> Result<(), error_stack::Report<impl core::fmt::Debug>> {
/// match fs::read_to_string("/path/to/file") {
///     Ok(content) => println!("file contents: {content}"),
///     Err(err) => return Err(report!(err)),
/// }
/// # Ok(()) }
/// # assert!(wrapper().unwrap_err().contains::<std::io::Error>());
/// ```
///
/// ```rust
/// # #![expect(deprecated, reason = "`report!` is deprecated")]
/// # fn has_permission(_: &u32, _: &u32) -> bool { true }
/// # type User = u32;
/// # let user = 0;
/// # type Resource = u32;
/// # let resource = 0;
/// use core::error::Error;
/// use core::fmt;
///
/// use error_stack::report;
///
/// #[derive(Debug)]
/// # #[allow(dead_code)]
/// struct PermissionDenied(User, Resource);
///
/// impl fmt::Display for PermissionDenied {
///     # #[allow(unused_variables)]
///     fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
///         # const _: &str = stringify! {
///         ...
///         # }; Ok(())}
/// }
///
/// impl Error for PermissionDenied {}
///
/// if !has_permission(&user, &resource) {
///     return Err(report!(PermissionDenied(user, resource)));
/// }
/// # Ok(())
/// ```
#[deprecated(since = "0.6.0", note = "use `IntoReport::into_report` instead")]
#[macro_export]
macro_rules! report {
    ($err:expr $(,)?) => {{ $crate::IntoReport::into_report($err) }};
}

/// Creates a [`Report`] and returns it as [`Result`].
///
/// Shorthand for `return Err(report!(..))`.
///
/// [`Report`]: crate::Report
/// [`report!(...)`]: report
///
/// # Examples
///
/// Create a [`Report`] from [`Error`]:
///
/// [`Error`]: core::error::Error
///
/// ```
/// use std::fs;
///
/// use error_stack::bail;
/// # fn wrapper() -> error_stack::Result<(), impl core::fmt::Debug> {
/// match fs::read_to_string("/path/to/file") {
///     Ok(content) => println!("file contents: {content}"),
///     Err(err) => bail!(err),
/// }
/// # Ok(()) }
/// # assert!(wrapper().unwrap_err().contains::<std::io::Error>());
/// ```
///
/// Create a [`Report`] from [`Context`]:
///
/// [`Context`]: crate::Context
///
/// ```rust
/// # fn has_permission(_: &u32, _: &u32) -> bool { true }
/// # type User = u32;
/// # let user = 0;
/// # type Resource = u32;
/// # let resource = 0;
/// use core::fmt;
///
/// use error_stack::{bail, Context};
///
/// #[derive(Debug)]
/// # #[allow(dead_code)]
/// struct PermissionDenied(User, Resource);
///
/// impl fmt::Display for PermissionDenied {
///     # #[allow(unused_variables)]
///     fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
///         # const _: &str = stringify! {
///         ...
///         # }; Ok(())}
/// }
///
/// impl Context for PermissionDenied {}
///
/// if !has_permission(&user, &resource) {
///     bail!(PermissionDenied(user, resource));
/// }
/// # Ok(())
/// ```
#[cfg(not(feature = "unstable"))]
#[macro_export]
macro_rules! bail {
    ($err:expr) => {{
        return ::core::result::Result::Err($crate::IntoReport::into_report($err));
    }};
}

/// Creates a [`Report`] and returns it as [`Result`].
///
/// Shorthand for <code>return Err([report!(..)])</code>.
///
/// [`Report`]: crate::Report
/// [report!(..)]: report
///
/// # `unstable`
///
/// The match arm: `[$($err:expr),+ $(,)?]` is considered unstable and can be used to construct a
/// `Report<[C]>`.
///
/// # Examples
///
/// Create a [`Report`] from [`Error`]:
///
/// [`Error`]: core::error::Error
///
/// ```
/// use std::fs;
///
/// use error_stack::bail;
/// # fn wrapper() -> Result<(), error_stack::Report<impl core::fmt::Debug>> {
/// match fs::read_to_string("/path/to/file") {
///     Ok(content) => println!("file contents: {content}"),
///     Err(err) => bail!(err),
/// }
/// # Ok(()) }
/// # assert!(wrapper().unwrap_err().contains::<std::io::Error>());
/// ```
///
/// Create a [`Report`] from [`Context`]:
///
/// [`Context`]: crate::Context
///
/// ```rust
/// # fn has_permission(_: &u32, _: &u32) -> bool { true }
/// # type User = u32;
/// # let user = 0;
/// # type Resource = u32;
/// # let resource = 0;
/// use core::error::Error;
/// use core::fmt;
///
/// use error_stack::bail;
///
/// #[derive(Debug)]
/// # #[allow(dead_code)]
/// struct PermissionDenied(User, Resource);
///
/// impl fmt::Display for PermissionDenied {
///     # #[allow(unused_variables)]
///     fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
///         # const _: &str = stringify! {
///         ...
///         # }; Ok(())
///     }
/// }
///
/// impl Error for PermissionDenied {}
///
/// if !has_permission(&user, &resource) {
///     bail!(PermissionDenied(user, resource));
/// }
/// # Ok(())
/// ```
///
/// Create a `Report<[C]>` from multiple errors (**unstable only**):
///
/// ```rust
/// # fn has_permission(_: &u32, _: &u32) -> bool { true }
/// # type User = u32;
/// # let user = 0;
/// # type Resource = u32;
/// # let create_user = 0;
/// # let create_resource = 0;
/// use error_stack::bail;
///
/// #[derive(Debug)]
/// # #[allow(dead_code)]
/// struct PermissionDenied(User, Resource);
///
/// impl core::fmt::Display for PermissionDenied {
///    # #[allow(unused_variables)]
///     fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
///         # const _: &str = stringify! {
///         ...
///         # }; Ok(())
///     }
/// }
///
/// impl core::error::Error for PermissionDenied {}
///
/// // You might want to look into `ReportSink` for a more incremental approach.
/// if !has_permission(&user, &create_user) && !has_permission(&user, &create_resource) {
///     bail![
///         PermissionDenied(user, create_user),
///         PermissionDenied(user, create_resource)
///     ];
/// }
/// # Ok(())
/// ```
#[cfg(feature = "unstable")]
#[cfg_attr(doc, doc(cfg(all())))]
#[macro_export]
macro_rules! bail {
    ($err:expr) => {{
        return ::core::result::Result::Err($crate::IntoReport::into_report($err));
    }};

    [$($err:expr),+ $(,)?] => {{
        let mut sink = $crate::ReportSink::new();

        $(
            sink.capture($err);
        )+

        let error = match sink.finish() {
            Ok(()) => unreachable!(),
            Err(error) => error,
        };

        return ::core::result::Result::Err(error);
    }};
}

/// Ensures `$cond` is met, otherwise return an error.
///
/// Shorthand for <code>if !$cond { [bail!(..)]) }</code>
///
/// [`Report`]: crate::Report
/// [bail!(..)]: bail
///
/// # Examples
///
/// Create a [`Report`] from an [`Error`]:
///
/// [`Error`]: core::error::Error
///
/// ```rust
/// # fn has_permission(_: &u32, _: &u32) -> bool { true }
/// # type User = u32;
/// # let user = 0;
/// # type Resource = u32;
/// # let resource = 0;
/// use core::error::Error;
/// use core::fmt;
///
/// use error_stack::ensure;
///
/// #[derive(Debug)]
/// # #[allow(dead_code)]
/// struct PermissionDenied(User, Resource);
///
/// impl fmt::Display for PermissionDenied {
///     # #[allow(unused_variables)]
///     fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
///         # const _: &str = stringify! {
///         ...
///         # };
///         Ok(())
///     }
/// }
///
/// impl Error for PermissionDenied {}
///
/// ensure!(
///     has_permission(&user, &resource),
///     PermissionDenied(user, resource)
/// );
/// # Ok(())
/// ```
#[macro_export]
macro_rules! ensure {
    ($cond:expr, $err:expr $(,)?) => {{
        if !bool::from($cond) {
            $crate::bail!($err)
        }
    }};
}
