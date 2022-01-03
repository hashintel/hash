#[doc(hidden)]
pub mod __private {
    use core::fmt;

    use crate::Report;

    pub mod kinds {
        use core::{fmt, marker::PhantomData};

        use crate::Report;

        pub trait AdhocKind: Sized {
            fn __kind(&self) -> Adhoc {
                Adhoc
            }
        }
        impl<T> AdhocKind for &T where T: ?Sized + fmt::Display + fmt::Debug + Send + Sync + 'static {}

        pub struct Adhoc;
        impl Adhoc {
            pub fn report<M>(self, message: M) -> Report
            where
                M: fmt::Display + fmt::Debug + Send + Sync + 'static,
            {
                Report::new(message)
            }
        }

        pub trait TraitKind<S>: Sized {
            fn __kind(&self) -> Trait<S> {
                Trait(PhantomData)
            }
        }
        impl<E, S> TraitKind<S> for E where E: Into<Report<S>> {}

        pub struct Trait<S>(PhantomData<S>);
        impl<S> Trait<S> {
            pub fn report<E: Into<Report<S>>>(self, error: E) -> Report<S> {
                error.into()
            }
        }
    }

    pub fn format_err(args: fmt::Arguments) -> Report {
        Report::new(alloc::format!("{}", args))
    }
}

/// Creates a [`Report`] from the given parameters.
///
/// Optionally a scope can be specified.
///
/// [`Report`]: crate::Report
///
/// # Examples
///
/// Create a [`Report`] from a message:
///
/// ```
/// # fn has_permission(user: usize, resource: usize) -> bool { true }
/// # let user = 0;
/// # let resource = 0;
/// use error::format_err;
///
/// if !has_permission(user, resource) {
///     return Err(format_err!("permission denied for accessing {resource}"));
/// }
/// # error::Result::Ok(())
/// ```
///
/// Create a [`Report`] from an error:
///
/// ```should_panic
/// # fn has_permission(user: usize, resource: usize) -> bool { true }
/// # let user = 0;
/// # let resource = 0;
/// use std::fs::read_to_string;
///
/// use error::format_err;
///
/// match read_to_string("/path/to/invalid/file") {
///     Ok(content) => println!("File contents: {content}"),
///     Err(err) => return Err(format_err!(err)),
/// }
/// # error::Result::Ok(())
/// ```
///
/// Optionally, a scope can be provided:
///
/// ```
/// # fn has_permission(user: usize, resource: usize) -> bool { true }
/// # let user = 0;
/// # let resource = 0;
/// use core::fmt;
///
/// use error::format_err;
/// use provider::{Provider, Requisition};
///
/// #[derive(Debug, Copy, Clone)]
/// enum ErrorKind {
///     PermissionDenied,
/// }
///
/// impl fmt::Display for ErrorKind {
///     fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
///         match self {
///             Self::PermissionDenied => f.write_str("Permission denied for resource"),
///         }
///     }
/// }
///
/// impl Provider for ErrorKind {
///     fn provide<'p>(&'p self, mut req: Requisition<'p, '_>) {
///         req.provide_value(|| *self);
///     }
/// }
///
/// if !has_permission(user, resource) {
///     return Err(format_err!(
///         scope: ErrorKind::PermissionDenied,
///         "permission denied for accessing {resource}"
///     ));
/// }
/// # error::Result::Ok(())
/// ```
#[macro_export]
macro_rules! format_err {
    (scope: $scope:expr $(,)?) => ({
        $crate::Report::from_scope($scope)
    });
    (scope: $scope:expr, $msg:literal $(,)?) => ({
        $crate::format_err!($msg).provide($scope)
    });
    (scope: $scope:expr, $err:expr $(,)?) => ({
        $crate::format_err!($err).provide($scope)
    });
    (scope: $scope:expr, $fmt:expr, $($arg:tt)+) => {
        $crate::format_err!($fmt, $($arg)+).provide($scope)
    };
    ($msg:literal $(,)?) => ({
        $crate::Report::new($crate::__private::format_err(core::format_args!($msg)))
    });
    ($err:expr $(,)?) => ({
        use $crate::__private::kinds::*;
        let error = $err;
        (&error).__kind().report(error)
    });
    ($fmt:expr, $($arg:tt)+) => {
        $crate::Report::new($crate::__private::format_err(core::format_args!($fmt, $($arg)+)))
    };
}

/// Creates a [`Report`] and returns it as [`Result`].
///
/// Shorthand for `return Err(format_err!(...))`
///
/// [`Report`]: crate::Report
///
/// # Examples
///
/// Create a [`Report`] from a message:
///
/// ```
/// # fn has_permission(user: usize, resource: usize) -> bool { true }
/// # let user = 0;
/// # let resource = 0;
/// use error::bail;
///
/// if !has_permission(user, resource) {
///     bail!("permission denied for accessing {resource}");
/// }
/// # error::Result::Ok(())
/// ```
///
/// Create a [`Report`] from an error:
///
/// ```should_panic
/// # fn has_permission(user: usize, resource: usize) -> bool { true }
/// # let user = 0;
/// # let resource = 0;
/// use std::fs::read_to_string;
///
/// use error::bail;
///
/// match read_to_string("/path/to/invalid/file") {
///     Ok(content) => println!("File contents: {content}"),
///     Err(err) => bail!(err),
/// }
/// # error::Result::Ok(())
/// ```
///
/// Optionally, a scope can be provided:
///
/// ```
/// # fn has_permission(user: usize, resource: usize) -> bool { true }
/// # let user = 0;
/// # let resource = 0;
/// use core::fmt;
///
/// use error::bail;
/// use provider::{Provider, Requisition};
///
/// #[derive(Debug, Copy, Clone)]
/// enum ErrorKind {
///     PermissionDenied,
/// }
///
/// impl fmt::Display for ErrorKind {
///     fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
///         match self {
///             Self::PermissionDenied => f.write_str("Permission denied for resource"),
///         }
///     }
/// }
///
/// impl Provider for ErrorKind {
///     fn provide<'p>(&'p self, mut req: Requisition<'p, '_>) {
///         req.provide_value(|| *self);
///     }
/// }
///
/// if !has_permission(user, resource) {
///     bail!(
///         scope: ErrorKind::PermissionDenied,
///         "permission denied for accessing {resource}"
///     );
/// }
/// # error::Result::Ok(())
/// ```
#[macro_export]
macro_rules! bail {
    (scope: $scope:expr $(,)?) => ({
        return $crate::Result::Err($crate::format_err!(scope: $scope))
    });
    (scope: $scope:expr, $msg:literal $(,)?) => ({
        return $crate::Result::Err($crate::format_err!(scope: $scope, $msg))
    });
    (scope: $scope:expr, $err:expr $(,)?) => ({
        return $crate::Result::Err($crate::format_err!(scope: $scope, $err))
    });
    (scope: $scope:expr, $fmt:expr, $($arg:tt)+) => {
        return $crate::Result::Err($crate::format_err!(scope: $scope, $fmt, $($arg)+))
    };
    ($msg:literal $(,)?) => ({
        return $crate::Result::Err($crate::format_err!($msg))
    });
    ($err:expr $(,)?) => ({
        return $crate::Result::Err($crate::format_err!($err))
    });
    ($fmt:expr, $($arg:tt)+) => {
        return $crate::Result::Err($crate::format_err!($fmt, $($arg)+))
    };
}

/// Ensures `$cond` is met, otherwise return an error.
///
/// Shorthand for `if !$cond { bail!(...)) }`
///
/// # Examples
///
/// Create a [`Report`] from a message:
///
/// ```
/// # fn has_permission(user: usize, resource: usize) -> bool { true }
/// # let user = 0;
/// # let resource = 0;
/// use error::ensure;
///
/// ensure!(
///     has_permission(user, resource),
///     "permission denied for accessing {resource}"
/// );
/// # error::Result::Ok(())
/// ```
///
/// Optionally, a scope can be provided:
///
/// ```
/// # fn has_permission(user: usize, resource: usize) -> bool { true }
/// # let user = 0;
/// # let resource = 0;
/// use core::fmt;
///
/// use error::ensure;
/// use provider::{Provider, Requisition};
///
/// #[derive(Debug, Copy, Clone)]
/// enum ErrorKind {
///     PermissionDenied,
/// }
///
/// impl fmt::Display for ErrorKind {
///     fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
///         match self {
///             Self::PermissionDenied => f.write_str("Permission denied for resource"),
///         }
///     }
/// }
///
/// impl Provider for ErrorKind {
///     fn provide<'p>(&'p self, mut req: Requisition<'p, '_>) {
///         req.provide_value(|| *self);
///     }
/// }
///
/// ensure!(
///     has_permission(user, resource),
///     scope: ErrorKind::PermissionDenied,
///     "permission denied for accessing {resource}"
/// );
/// # error::Result::Ok(())
/// ```
///
/// [`Report`]: crate::Report
#[macro_export]
macro_rules! ensure {
    ($cond:expr, scope: $scope:expr $(,)?) => ({
        if !$cond {
            $crate::bail!(scope: $scope)
        }
    });
    ($cond:expr, scope: $scope:expr, $msg:literal $(,)?) => ({
        if !$cond {
            $crate::bail!(scope: $scope, $msg)
        }
    });
    ($cond:expr, scope: $scope:expr, $err:expr $(,)?) => ({
        if !$cond {
            $crate::bail!(scope: $scope, $err)
        }
    });
    ($cond:expr, scope: $scope:expr, $fmt:expr, $($arg:tt)+) => {
        if !$cond {
            $crate::bail!(scope: $scope, $fmt, $($arg)+)
        }
    };
    ($cond:expr, $msg:literal $(,)?) => ({
        if !$cond {
            $crate::bail!($msg)
        }
    });
    ($cond:expr, $err:expr $(,)?) => ({
        if !$cond {
            $crate::bail!($err)
        }
    });
    ($cond:expr, $fmt:expr, $($arg:tt)*) => {
        if !$cond {
            $crate::bail!($fmt, $($arg)*)
        }
    };
}
