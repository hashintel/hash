#![expect(deprecated, reason = "We use `Context` to maintain compatibility")]

pub mod __private {
    #![doc(hidden)]
    //! Implementation detail for macros.
    //!
    //! ⚠️ **Functionality in this module is considered unstable and is subject to change at any
    //! time without a major version bump!** ⚠️
    mod specialization {
        #![allow(clippy::unused_self)]
        //! [Autoref-Based Stable Specialization](https://github.com/dtolnay/case-studies/blob/master/autoref-specialization/README.md)
        //! for macros.
        //!
        //! This is a stable implementation for specialization (only possible within macros, as
        //! there is no trait bound for these things).
        //!
        //! The different tags [`ReportTag`] and [`ContextTag`] have a blanket implementation
        //! returning a concrete type. This type is then used to create a [`Report`].
        //!
        //! [`ContextTag`] is implemented for `T: `[`Context`]s while [`ReportTag`] is implement for
        //! [`Report`]s. Calling `my_report.__kind()` will always return a [`Reporter`] while
        //! `my_context.__kind()` will return a [`ContextReporter`] so a [`Report`] has the highest
        //! precedence when calling `.__kind()`. This will use an identity function when creating a
        //! [`Report`] to ensure that no information will be lost.
        //!
        //! Note: The methods on the tags are called `__kind` instead of `kind` to avoid misleading
        //! suggestions from the Rust compiler, when calling `kind`. It would suggest implementing a
        //! tag for the type which cannot and should not be implemented.

        pub trait ReportTag {
            #[inline]
            fn __kind(&self) -> Reporter {
                Reporter
            }
        }
        impl<T> ReportTag for Report<T> {}

        pub trait ContextTag {
            #[inline]
            fn __kind(&self) -> ContextReporter {
                ContextReporter
            }
        }
        impl<T> ContextTag for &T where T: ?Sized + Context {}
        use crate::{Context, Report};

        pub struct Reporter;
        impl Reporter {
            #[inline]
            pub const fn report<T>(self, report: Report<T>) -> Report<T> {
                report
            }
        }

        pub struct ContextReporter;
        impl ContextReporter {
            #[inline]
            #[track_caller]
            pub fn report<C: Context>(self, context: C) -> Report<C> {
                Report::new(context)
            }
        }
    }

    // Import anonymously to allow calling `__kind` but forbid implementing the tag-traits.
    pub use self::specialization::{ContextTag as _, ReportTag as _};
}

/// Creates a [`Report`] from the given parameters.
///
/// The parameters may either be [`Context`] or a [`Report`]. The returned [`Report`] will use the
/// the provided type as context.
///
/// [`Report`]: crate::Report
/// [`Context`]: crate::Context
/// [`Error`]: core::error::Error
///
/// # Examples
///
/// Create a [`Report`] from [`Error`]:
///
/// ```rust
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
/// Create a [`Report`] from [`Context`]:
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
#[macro_export]
macro_rules! report {
    ($err:expr $(,)?) => {{
        use $crate::__private::*;
        let error = $err;
        (&error).__kind().report(error)
    }};
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
        return ::core::result::Result::Err($crate::report!($err));
    }};
}

/// Creates a [`Report`] and returns it as [`Result`].
///
/// Shorthand for `return Err(report!(..))`.
///
/// [`Report`]: crate::Report
/// [`report!(...)`]: report
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
        return ::core::result::Result::Err($crate::report!($err));
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
/// Shorthand for `if !$cond { `[`bail!(...)`]`) }`
///
/// [`Report`]: crate::Report
/// [`bail!(...)`]: bail
///
/// # Examples
///
/// Create a [`Report`] from [`Context`]:
///
/// [`Report`]: crate::Report
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
