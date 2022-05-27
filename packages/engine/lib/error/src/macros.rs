#[doc(hidden)]
pub mod __private {
    use core::fmt;

    use crate::Report;

    pub mod kinds {
        #![allow(clippy::unused_self)]

        use crate::{Context, Message, Report};

        pub trait MessageTag {
            fn __kind(&self) -> MessageReporter {
                MessageReporter
            }
        }
        impl<T> MessageTag for &T where T: ?Sized + Message {}
        pub struct MessageReporter;
        impl MessageReporter {
            pub fn report<C>(self, context: C) -> Report
            where
                C: Message,
            {
                Report::new(context)
            }
        }

        #[cfg(feature = "std")]
        pub trait ErrorTag {
            fn __kind(&self) -> ErrorReporter {
                ErrorReporter
            }
        }
        #[cfg(feature = "std")]
        impl<T> ErrorTag for T where T: ?Sized + std::error::Error + Send + Sync + 'static {}
        #[cfg(feature = "std")]
        pub struct ErrorReporter;
        #[cfg(feature = "std")]
        impl ErrorReporter {
            pub fn report<C: std::error::Error + Send + Sync + 'static>(self, error: C) -> Report {
                Report::from(error)
            }
        }

        pub trait ContextTag {
            fn __kind(&self) -> ContextReporter {
                ContextReporter
            }
        }
        impl<T> ContextTag for T where T: ?Sized + Context {}
        pub struct ContextReporter;
        impl ContextReporter {
            pub fn report<C: Context>(self, context: C) -> Report<C> {
                Report::from_context(context)
            }
        }
    }

    pub fn report(args: fmt::Arguments) -> Report {
        Report::new(alloc::string::ToString::to_string(&args))
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
/// # fn has_permission(_: &User, _: &Resource) -> bool { false }
/// # struct User;
/// # struct Resource;
/// # use core::fmt;
/// # impl fmt::Display for Resource { fn fmt(&self, _: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
/// use error::report;
///
/// # fn use_resource(user: User, resource: Resource) -> error::Result<()> {
/// if !has_permission(&user, &resource) {
///     return Err(report!("permission denied for accessing {resource}"));
/// }
/// # Ok(()) }
/// # let err = use_resource(User, Resource).unwrap_err();
/// # assert_eq!(err.frames().count(), 1);
/// # assert_eq!(err.frames().next().unwrap().to_string(), "permission denied for accessing ");
/// ```
///
/// Create a [`Report`] from an error:
///
/// ```
/// # #[cfg(not(miri))]
/// # use std::fs;
/// # use error::report;
/// # fn func() -> error::Result<()> {
/// # #[cfg(not(miri))]
/// match fs::read_to_string("/path/to/file") {
///     Ok(content) => println!("File contents: {content}"),
///     Err(err) => return Err(report!(err)),
/// }
/// # #[cfg(miri)]
/// # error::bail!("");
/// # Ok(())
/// # }
/// # let err = func().unwrap_err();
/// # assert_eq!(err.frames().count(), 1);
/// ```
///
/// Optionally, a context can be provided:
/// ```
/// # fn has_permission(_: &User, _: &Resource) -> bool { false }
/// # #[derive(Debug)] struct User;
/// # #[derive(Debug)] struct Resource;
/// # use error::report;
/// # impl fmt::Display for User { fn fmt(&self, _: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
/// # impl fmt::Display for Resource { fn fmt(&self, _: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
/// use core::fmt;
///
/// use error::Report;
/// use provider::{Demand, Provider};
///
/// #[derive(Debug)]
/// struct PermissionDenied(User, Resource);
///
/// impl fmt::Display for PermissionDenied {
///     fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
///         write!(fmt, "{} must not access {}", self.0, self.1)
///     }
/// }
///
/// impl Provider for PermissionDenied {
///     fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
///         demand.provide_ref(&self.0).provide_ref(&self.1);
///     }
/// }
///
/// # fn use_resource(user: User, resource: Resource) -> Result<(), Report<PermissionDenied>> {
/// if !has_permission(&user, &resource) {
///     return Err(report!(PermissionDenied(user, resource)));
/// }
/// # Ok(()) }
/// # let err = use_resource(User, Resource).unwrap_err();
/// # assert_eq!(err.frames().count(), 1);
/// # assert_eq!(err.request_ref::<User>().count(), 1);
/// # assert_eq!(err.request_ref::<Resource>().count(), 1);
/// ```
#[macro_export]
macro_rules! report {
    ($msg:literal $(,)?) => ({
        $crate::__private::report(core::format_args!($msg))
    });
    ($fmt:literal, $($arg:tt)+) => {
        $crate::Report::new($crate::__private::report(core::format_args!($fmt, $($arg)+)))
    };
    ($err:expr $(,)?) => ({
        use $crate::__private::kinds::*;
        let error = $err;
        (&error).__kind().report(error)
    });
}

/// Creates a [`Report`] and returns it as [`Result`].
///
/// Shorthand for `return `[`Err`]`(`[`report!(...)`]`)`
///
/// [`Report`]: crate::Report
/// [`report!(...)`]: report
///
/// # Examples
///
/// Create a [`Report`] from a message:
///
/// ```
/// # fn has_permission(_: &User, _: &Resource) -> bool { false }
/// # struct User;
/// # struct Resource;
/// # use core::fmt;
/// # impl fmt::Display for Resource { fn fmt(&self, _: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
/// use error::bail;
///
/// # fn use_resource(user: User, resource: Resource) -> error::Result<()> {
/// if !has_permission(&user, &resource) {
///     bail!("permission denied for accessing {resource}");
/// }
/// # Ok(()) }
/// # let err = use_resource(User, Resource).unwrap_err();
/// # assert_eq!(err.frames().count(), 1);
/// # assert_eq!(err.frames().next().unwrap().to_string(), "permission denied for accessing ");
/// ```
///
/// Create a [`Report`] from an error:
///
/// ```
/// # use std::fs;
/// # use error::bail;
/// # fn func() -> error::Result<()> {
/// # #[cfg(not(miri))]
/// match fs::read_to_string("/path/to/file") {
///     Ok(content) => println!("File contents: {content}"),
///     Err(err) => bail!(err),
/// }
/// # #[cfg(miri)]
/// # bail!("");
/// # Ok(())
/// # }
/// # let err = func().unwrap_err();
/// # assert_eq!(err.frames().count(), 1);
/// ```
///
/// Optionally, a context can be provided:
///
/// ```
/// # fn has_permission(_: &User, _: &Resource) -> bool { false }
/// # #[derive(Debug)] struct User;
/// # #[derive(Debug)] struct Resource;
/// # use error::bail;
/// # impl fmt::Display for User { fn fmt(&self, _: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
/// # impl fmt::Display for Resource { fn fmt(&self, _: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
/// use core::fmt;
///
/// use error::Report;
/// use provider::{Demand, Provider};
///
/// #[derive(Debug)]
/// struct PermissionDenied(User, Resource);
///
/// impl fmt::Display for PermissionDenied {
///     fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
///         write!(fmt, "{} must not access {}", self.0, self.1)
///     }
/// }
///
/// impl Provider for PermissionDenied {
///     fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
///         demand.provide_ref(&self.0).provide_ref(&self.1);
///     }
/// }
///
/// # fn use_resource(user: User, resource: Resource) -> Result<(), Report<PermissionDenied>> {
/// if !has_permission(&user, &resource) {
///     bail!(PermissionDenied(user, resource));
/// }
/// # Ok(()) }
/// # let err = dbg!(use_resource(User, Resource).unwrap_err());
/// # assert_eq!(err.frames().count(), 1);
/// # assert_eq!(err.request_ref::<Resource>().count(), 1);
/// # assert_eq!(err.request_ref::<User>().count(), 1);
/// ```
#[macro_export]
macro_rules! bail {
    ($msg:literal $(,)?) => ({
        return $crate::Result::Err($crate::report!($msg))
    });
    ($fmt:literal, $($arg:tt)+) => {
        return $crate::Result::Err($crate::report!($fmt, $($arg)+))
    };
    ($err:expr $(,)?) => ({
        return $crate::Result::Err($crate::report!($err))
    });
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
/// Create a [`Report`] from a message:
///
/// ```
/// # fn has_permission(_: &User, _: &Resource) -> bool { false }
/// # struct User;
/// # struct Resource;
/// # use core::fmt;
/// # impl fmt::Display for Resource { fn fmt(&self, _: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
/// use error::ensure;
///
/// # fn use_resource(user: User, resource: Resource) -> error::Result<()> {
/// ensure!(has_permission(&user, &resource), "permission denied for accessing {resource}");
/// # Ok(()) }
/// # let err = use_resource(User, Resource).unwrap_err();
/// # assert_eq!(err.frames().count(), 1);
/// # assert_eq!(err.frames().next().unwrap().to_string(), "permission denied for accessing ");
/// ```
///
/// Optionally, a context can be provided:
///
/// ```
/// # fn has_permission(_: &User, _: &Resource) -> bool { false }
/// # #[derive(Debug)] struct User;
/// # #[derive(Debug)] struct Resource;
/// # use error::ensure;
/// # impl fmt::Display for User { fn fmt(&self, _: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
/// # impl fmt::Display for Resource { fn fmt(&self, _: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
/// use core::fmt;
///
/// use error::Report;
/// use provider::{Demand, Provider};
///
/// #[derive(Debug)]
/// struct PermissionDenied(User, Resource);
///
/// impl fmt::Display for PermissionDenied {
///     fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
///         write!(fmt, "{} must not access {}", self.0, self.1)
///     }
/// }
///
/// impl Provider for PermissionDenied {
///     fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
///         demand.provide_ref(&self.0).provide_ref(&self.1);
///     }
/// }
///
/// # fn use_resource(user: User, resource: Resource) -> Result<(), Report<PermissionDenied>> {
/// ensure!(
///     has_permission(&user, &resource),
///     PermissionDenied(user, resource),
/// );
/// # Ok(()) }
/// # let err = use_resource(User, Resource).unwrap_err();
/// # assert_eq!(err.frames().count(), 1);
/// # assert_eq!(err.request_ref::<User>().count(), 1);
/// # assert_eq!(err.request_ref::<Resource>().count(), 1);
/// ```
///
/// [`Report`]: crate::Report
#[macro_export]
macro_rules! ensure {
    ($cond:expr, $msg:literal $(,)?) => ({
        if !$cond {
            $crate::bail!($msg)
        }
    });
    ($cond:expr, $fmt:literal, $($arg:tt)*) => {
        if !$cond {
            $crate::bail!($fmt, $($arg)*)
        }
    };
    ($cond:expr, $err:expr $(,)?) => ({
        if !$cond {
            $crate::bail!($err)
        }
    });
}

#[cfg(test)]
mod tests {
    #[allow(clippy::wildcard_imports)]
    use crate::test_helper::*;

    #[test]
    fn error() {
        let err = capture_error(|| Err(report!(ContextA(10))));
        assert!(err.contains::<ContextA>());
        assert_eq!(err.frames().count(), 1);
        assert_eq!(err.request_value().collect::<Vec<u32>>(), [10]);
        assert_eq!(request_messages(&err), ["Context A"]);

        #[cfg(feature = "std")]
        {
            let io_err = std::io::Error::from(std::io::ErrorKind::Other);
            let err = capture_error(|| Err(report!(io_err)));
            assert!(err.contains::<std::io::Error>());
            assert_eq!(err.frames().count(), 1);
            assert_eq!(request_messages(&err), ["other error"]);
        }

        let err = capture_error(|| Err(report!("Literal")));
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Literal"]);

        let err = capture_error(|| Err(report!(MESSAGE_A)));
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Message A"]);

        let var = "foo";
        let err = capture_error(|| Err(report!("Format String: {}", var)));
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Format String: foo"]);

        let var = "foo";
        let err = capture_error(|| Err(report!("Format String: {var}")));
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Format String: foo"]);
    }

    #[test]
    fn bail() {
        let err = capture_error(|| bail!(ContextA(10)));
        assert!(err.contains::<ContextA>());
        assert_eq!(err.frames().count(), 1);
        assert_eq!(err.request_value().collect::<Vec<u32>>(), [10]);
        assert_eq!(request_messages(&err), ["Context A"]);

        #[cfg(feature = "std")]
        {
            let io_err = std::io::Error::from(std::io::ErrorKind::Other);
            let err = capture_error(|| bail!(io_err));
            assert!(err.contains::<std::io::Error>());
            assert_eq!(err.frames().count(), 1);
            assert_eq!(request_messages(&err), ["other error"]);
        }

        let err = capture_error(|| bail!("Literal"));
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Literal"]);

        let err = capture_error(|| bail!(MESSAGE_A));
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Message A"]);

        let var = "foo";
        let err = capture_error(|| bail!("Format String: {}", var));
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Format String: foo"]);

        let var = "foo";
        let err = capture_error(|| bail!("Format String: {var}"));
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Format String: foo"]);
    }

    #[test]
    fn ensure() {
        let err = capture_error(|| {
            ensure!(false, ContextA(10));
            Ok(())
        });
        assert!(err.contains::<ContextA>());
        assert_eq!(err.frames().count(), 1);
        assert_eq!(err.request_value().collect::<Vec<u32>>(), [10]);
        assert_eq!(request_messages(&err), ["Context A"]);

        #[cfg(feature = "std")]
        {
            let io_err = std::io::Error::from(std::io::ErrorKind::Other);
            let err = capture_error(|| {
                ensure!(false, io_err);
                Ok(())
            });
            assert!(err.contains::<std::io::Error>());
            assert_eq!(err.frames().count(), 1);
            assert_eq!(request_messages(&err), ["other error"]);
        }

        let err = capture_error(|| {
            ensure!(false, "Literal");
            Ok(())
        });
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Literal"]);

        let err = capture_error(|| {
            ensure!(false, MESSAGE_A);
            Ok(())
        });
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Message A"]);

        let var = "foo";
        let err = capture_error(|| {
            ensure!(false, "Format String: {}", var);
            Ok(())
        });
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Format String: foo"]);

        let var = "foo";
        let err = capture_error(|| {
            ensure!(false, "Format String: {var}");
            Ok(())
        });
        assert_eq!(err.frames().count(), 1);
        assert_eq!(request_messages(&err), ["Format String: foo"]);
    }
}
