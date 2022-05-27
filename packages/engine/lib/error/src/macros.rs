#[doc(hidden)]
pub mod __private {
    use core::fmt;

    use crate::Report;

    pub mod kinds {
        #![allow(clippy::unused_self)]
        //! Uses [autoref-based stable specialization](https://github.com/dtolnay/case-studies/blob/master/autoref-specialization/README.md).
        // TODO: Expand documentation when string literals are forbidden as this will shrink the
        //   implementation by a fair bit.

        use crate::{Context, Message, Report};

        pub trait ReportTag {
            #[inline]
            fn __kind(&self) -> Reporter {
                Reporter
            }
        }
        impl<T> ReportTag for Report<T> {}
        pub struct Reporter;
        impl Reporter {
            #[inline]
            pub const fn report<T>(self, report: Report<T>) -> Report<T> {
                report
            }
        }

        pub trait MessageTag {
            #[inline]
            fn __kind(&self) -> MessageReporter {
                MessageReporter
            }
        }
        impl<T> MessageTag for &T where T: ?Sized + Message {}
        pub struct MessageReporter;
        impl MessageReporter {
            #[inline]
            pub fn report<C>(self, context: C) -> Report
            where
                C: Message,
            {
                Report::new(context)
            }
        }

        #[cfg(feature = "std")]
        pub trait ErrorTag {
            #[inline]
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
            #[inline]
            pub fn report<C: std::error::Error + Send + Sync + 'static>(self, error: C) -> Report {
                Report::from(error)
            }
        }

        pub trait ContextTag {
            #[inline]
            fn __kind(&self) -> ContextReporter {
                ContextReporter
            }
        }
        impl<T> ContextTag for T where T: ?Sized + Context {}
        pub struct ContextReporter;
        impl ContextReporter {
            #[inline]
            pub fn report<C: Context>(self, context: C) -> Report<C> {
                Report::from_context(context)
            }
        }
    }

    #[inline]
    pub fn report(args: fmt::Arguments) -> Report {
        Report::new(alloc::string::ToString::to_string(&args))
    }
}

/// Creates a [`Report`] from the given parameters.
///
/// The parameters may either be [`Message`], [`Context`], or [`Error`]. If a
/// [`Message`] is passed, it's returning an anonymous report without a context associated with it.
/// For [`Context`] and [`Error`], the [`Report`] will use the the provided type as context.
///
/// [`Report`]: crate::Report
/// [`Message`]: crate::Message
/// [`Context`]: crate::Context
/// [`Error`]: std::error::Error
///
/// # Examples
///
/// Create an anonymous [`Report`] from a [`Message`]:
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
/// Create a [`Report`] from [`Error`]:
///
/// ```
/// # #[cfg(not(miri))]
/// # use std::fs;
/// # use error::report;
/// # fn func() -> error::Result<(), impl core::fmt::Debug> {
/// # #[cfg(not(miri))]
/// match fs::read_to_string("/path/to/file") {
///     Ok(content) => println!("File contents: {content}"),
///     Err(err) => return Err(report!(err)),
/// }
/// # #[cfg(miri)]
/// # error::bail!(std::io::Error::from(std::io::ErrorKind::NotFound));
/// # Ok(())
/// # }
/// # let err = func().unwrap_err();
/// # assert!(cfg!(not(feature = "std")) ^ err.contains::<std::io::Error>());
/// # assert_eq!(err.frames().count(), 1);
/// ```
///
/// Create a [`Report`] from [`Context`]:
///
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
        $crate::__private::report(core::format_args!($fmt, $($arg)+))
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
/// Create an anonymous [`Report`] from a [`Message`]:
///
/// [`Message`]: crate::Message
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
/// Create a [`Report`] from [`Error`]:
///
/// [`Error`]: std::error::Error
///
/// ```
/// # use std::fs;
/// # use error::bail;
/// # fn func() -> error::Result<(), impl core::fmt::Debug> {
/// # #[cfg(not(miri))]
/// match fs::read_to_string("/path/to/file") {
///     Ok(content) => println!("File contents: {content}"),
///     Err(err) => bail!(err),
/// }
/// # #[cfg(miri)]
/// # bail!(std::io::Error::from(std::io::ErrorKind::NotFound));
/// # Ok(())
/// # }
/// # let err = func().unwrap_err();
/// # assert!(cfg!(not(feature = "std")) ^ err.contains::<std::io::Error>());
/// # assert_eq!(err.frames().count(), 1);
/// ```
///
/// Create a [`Report`] from [`Context`]:
///
/// [`Context`]: crate::Context
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
/// Create an anonymous [`Report`] from a [`Message`]:
///
/// [`Message`]: crate::Message
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
/// Create a [`Report`] from [`Context`]:
///
/// [`Context`]: crate::Context
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

        let err = report!(err);
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

        let err = report!(err);
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

        let err = report!(err);
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
