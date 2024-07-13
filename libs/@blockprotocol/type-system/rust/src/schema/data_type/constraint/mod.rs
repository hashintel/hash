macro_rules! extend_report {
    ($status:expr, $error:expr $(,)?) => {
        if let Err(ref mut report) = $status {
            report.extend_one(error_stack::report!($error))
        } else {
            $status = Err(error_stack::report!($error))
        }
    };
}

pub(crate) use extend_report;

mod array;
mod boolean;
mod error;
mod null;
mod number;
mod object;
mod string;

pub(crate) use self::{
    array::check_array_constraints,
    boolean::check_boolean_constraints,
    error::ConstraintError,
    null::check_null_constraints,
    number::check_numeric_constraints,
    object::check_object_constraints,
    string::{check_string_constraints, StringFormat},
};
