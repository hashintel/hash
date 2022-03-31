mod js {
    crate::run_test!(array, JavaScript);
    // TODO: Empty structs fails with `'index out of bounds: the len is 0 but the index is 0`
    //   see https://app.asana.com/0/1199548034582004/1201826554813225/f
    crate::run_test!(object, JavaScript, #[ignore]);
}

mod py {
    crate::run_test!(array, Python);
    // TODO: Empty structs fails with `'index out of bounds: the len is 0 but the index is 0`
    //   see https://app.asana.com/0/1199548034582004/1201826554813225/f
    crate::run_test!(object, Python, #[ignore]);
}
