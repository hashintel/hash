use core::error::Error;
use std::collections::HashMap;

use cedar_policy::*;

fn main() -> Result<(), Box<dyn Error>> {
    const POLICY_SRC: &str = r#"
    // Principals in the Admin role can delete any resource
    permit (
        principal in PhotoFlash::Role::"Admin",
        action == PhotoFlash::Action::"DeletePhoto",
        resource
    );

    // Grants Bob permission to view photo-5678.jpg
    permit (
        principal == PhotoFlash::User::"Bob",
        action == PhotoFlash::Action::"ViewPhoto",
        resource == PhotoFlash::Photo::"photo-5678.jpg"
    );
"#;
    let policy: PolicySet = POLICY_SRC.parse().unwrap();
    // Policy

    let alice: EntityUid = r#"PhotoFlash::User::"Bob""#.parse()?;
    let admin_role: EntityUid = r#"PhotoFlash::Role::"Admin""#.parse()?;
    let request = RequestBuilder::default()
        .action(Some(r#"PhotoFlash::Action::"DeletePhoto""#.parse()?))
        .principal(Some(alice.clone()))
        .build();

    let entities = Entities::empty().partial().add_entities(
        [Entity::new(alice, HashMap::new(), [admin_role].into())?],
        None,
    )?;
    let authorizer = Authorizer::new();
    let answer = authorizer.evaluate_policies_partial(&request, &policy, &entities);

    // Should output `Deny`
    println!("{:#?}", answer);

    Ok(())
}
