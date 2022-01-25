mod js {
    use crate::run_test;

    run_test!(bool, JavaScript);
    run_test!(bool_array, JavaScript);
    run_test!(number, JavaScript);
    run_test!(number_array, JavaScript);
    run_test!(string, JavaScript);
    run_test!(object, JavaScript);
    run_test!(object_array, JavaScript);

    run_test!(multiple, JavaScript);
}
