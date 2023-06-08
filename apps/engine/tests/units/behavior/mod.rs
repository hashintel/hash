crate::run_test!(multiple_runners);

mod js {
    crate::run_test!(composability, JavaScript);
}

mod py {
    crate::run_test!(composability, Python);
}
