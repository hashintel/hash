mod js {
    crate::run_test!(array, JavaScript);
    // Bug: https://app.asana.com/0/1199548034582004/1201826554813225/f
    crate::run_test!(object, JavaScript, #[ignore = "bug: Empty structs fails with `Index out of bounds`-error"]);
}

mod py {
    crate::run_test!(array, Python);
    // Bug: https://app.asana.com/0/1199548034582004/1201826554813225/f
    crate::run_test!(object, Python, #[ignore = "bug: Empty structs fails with `Index out of bounds`-error"]);
}
