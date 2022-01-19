use super::super::mini_v8::MiniV8;

#[test]
#[tracing::instrument(skip_all)]
fn to_string() {
    let mv8 = MiniV8::new();
    assert_eq!(
        mv8.create_string("abc😊🈹").to_string(),
        "abc😊🈹".to_string()
    );
}
