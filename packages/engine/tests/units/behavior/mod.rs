crate::run_test!(multiple_runners, #[ignore = "unimplemented: Multiple runners are currently not supported"]);

mod js {
    crate::run_test!(composability, JavaScript);
}

mod py {
    crate::run_test!(composability, Python);
}
