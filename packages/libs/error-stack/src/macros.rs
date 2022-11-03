#[doc(hidden)]
pub mod __private {
    //! Implementation detail for macros.
    //!
    //! ⚠️ **Functionality in this module is considered unstable and is subject to change at any time
    //! without a major version bump!** ⚠️
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

    // false-positive lint
    #[allow(unreachable_pub)]
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
/// ```
/// # #[cfg(all(not(miri), feature = "std"))] {
/// use std::fs;
///
/// use error_stack::report;
///
/// # fn wrapper() -> error_stack::Result<(), impl core::fmt::Debug> {
/// match fs::read_to_string("/path/to/file") {
///     Ok(content) => println!("file contents: {content}"),
///     Err(err) => return Err(report!(err)),
/// }
/// # Ok(()) }
/// # assert!(wrapper().unwrap_err().contains::<std::io::Error>()); }
/// ```
///
/// Create a [`Report`] from [`Context`]:
///
/// ```
/// # fn has_permission(_: &u32, _: &u32) -> bool { true }
/// # type User = u32;
/// # let user = 0;
/// # type Resource = u32;
/// # let resource = 0;
/// use core::fmt;
///
/// use error_stack::{report, Context};
///
/// #[derive(Debug)]
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
/// Shorthand for `return `Err`(`[`report!(...)`]`)`
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
/// # #[cfg(all(not(miri), feature = "std"))] {
/// use std::fs;
///
/// use error_stack::bail;
/// # fn wrapper() -> error_stack::Result<(), impl core::fmt::Debug> {
/// match fs::read_to_string("/path/to/file") {
///     Ok(content) => println!("file contents: {content}"),
///     Err(err) => bail!(err),
/// }
/// # Ok(()) }
/// # assert!(wrapper().unwrap_err().contains::<std::io::Error>()); }
/// ```
///
/// Create a [`Report`] from [`Context`]:
///
/// [`Context`]: crate::Context
///
/// ```
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
#[macro_export]
macro_rules! bail {
    ($err:expr $(,)?) => {{
        return $crate::Result::Err($crate::report!($err));
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
/// ```
/// # fn has_permission(_: &u32, _: &u32) -> bool { true }
/// # type User = u32;
/// # let user = 0;
/// # type Resource = u32;
/// # let resource = 0;
/// # use core::fmt;
///
/// use error_stack::{ensure, Context};
///
/// #[derive(Debug)]
/// struct PermissionDenied(User, Resource);
///
/// impl fmt::Display for PermissionDenied {
///     # #[allow(unused_variables)]
///     fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
///         const _: &str = stringify! {
///         ...
///          };
///         Ok(())
///     }
/// }
///
/// impl Context for PermissionDenied {}
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
