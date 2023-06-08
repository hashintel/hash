mod dot;
mod index;
mod set_get;

mod js {
    crate::run_test!(non_existing_field, JavaScript);
}

mod py {
    crate::run_test!(non_existing_field, Python);
}
