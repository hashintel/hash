mod js {
    crate::run_test!(array, JavaScript);
}

mod py {
    crate::run_test!(array, Python, #[ignore]);
}
