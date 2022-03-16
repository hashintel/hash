mod js {
    use crate::run_test;

    run_test!(bool, JavaScript);
    run_test!(bool_array, JavaScript);
    run_test!(bool_array_fixed, JavaScript);
    run_test!(number, JavaScript);
    run_test!(number_array, JavaScript);
    run_test!(number_array_fixed, JavaScript);
    run_test!(string, JavaScript);
    run_test!(string_array, JavaScript);
    run_test!(string_array_fixed, JavaScript);
    run_test!(object, JavaScript);
    run_test!(object_array, JavaScript);
    run_test!(object_array_fixed, JavaScript);
    run_test!(nested, JavaScript);
}

mod py {
    use crate::run_test;

    run_test!(bool, Python);
    run_test!(bool_array, Python);
    run_test!(bool_array_fixed, Python);
    run_test!(number, Python);
    run_test!(number_array, Python);
    run_test!(number_array_fixed, Python);
    run_test!(string, Python);
    run_test!(string_array, Python);
    run_test!(string_array_fixed, Python);
    run_test!(object, Python);
    run_test!(object_array, Python);
    run_test!(object_array_fixed, Python);

    run_test!(nested, Python);
}
