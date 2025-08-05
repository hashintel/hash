#![expect(
    clippy::indexing_slicing,
    reason = "Benchmark code with known array bounds"
)]
#![expect(
    clippy::integer_division_remainder_used,
    reason = "Benchmark uses modulo for cycling through arrays"
)]

use core::error::Error;

use hash_graph_authorization::policies::{
    Effect,
    action::ActionName,
    principal::PrincipalConstraint,
    store::{CreateWebParameter, PolicyCreationParams, PrincipalStore as _},
};
use hash_graph_postgres_store::store::{AsClient, PostgresStore};
use type_system::principal::{
    actor::ActorId,
    actor_group::{ActorGroupId, TeamId, WebId},
    role::{RoleId, RoleName},
};

/// Configuration for seeding benchmark data
#[derive(Debug, Clone)]
pub struct SeedConfig {
    /// Number of webs (organizations) to create
    pub webs: usize,
    /// Number of root teams per web
    pub teams_per_web: usize,
    /// Nesting depth for team hierarchies (triggers recursive CTE)
    pub team_nesting_depth: usize,
    /// Teams per level in hierarchy
    pub teams_per_level: usize,
    /// Number of policies per team (tests team access patterns)
    pub policies_per_team: usize,
    /// Number of policies per role (tests role access patterns)
    pub policies_per_role: usize,
    /// Number of policies per user (tests user-specific access)
    pub policies_per_user: usize,
    /// Number of users to create and assign roles
    pub users: usize,
    /// Number of global policies (accessible to all users)
    pub global_policies: usize,
}

impl SeedConfig {
    pub const fn small() -> Self {
        Self {
            webs: 2,
            teams_per_web: 2,
            team_nesting_depth: 2,
            teams_per_level: 2,
            policies_per_team: 2,
            policies_per_role: 2,
            policies_per_user: 2,
            users: 3,
            global_policies: 50,
        }
    }

    pub const fn medium() -> Self {
        Self {
            webs: 5,
            teams_per_web: 3,
            team_nesting_depth: 3,
            teams_per_level: 2,
            policies_per_team: 3,
            policies_per_role: 3,
            policies_per_user: 3,
            users: 10,
            global_policies: 100,
        }
    }

    pub const fn large() -> Self {
        Self {
            webs: 10,
            teams_per_web: 5,
            team_nesting_depth: 4,
            teams_per_level: 3,
            policies_per_team: 5,
            policies_per_role: 5,
            policies_per_user: 5,
            users: 50,
            global_policies: 2000,
        }
    }

    pub const fn extra_large() -> Self {
        Self {
            webs: 25,
            teams_per_web: 5,
            team_nesting_depth: 4,
            teams_per_level: 3,
            policies_per_team: 50,
            policies_per_role: 50,
            policies_per_user: 50,
            users: 100,
            global_policies: 10000,
        }
    }
}

/// Seeds realistic benchmark data according to config
#[expect(clippy::significant_drop_tightening, clippy::too_many_lines)]
pub async fn seed_benchmark_data(
    store: &mut PostgresStore<impl AsClient>,
    system_actor_id: ActorId,
    config: &SeedConfig,
) -> Result<BenchmarkData, Box<dyn Error>> {
    let mut transaction = store.transaction().await?;

    let mut data = BenchmarkData::default();

    eprintln!("📊 Starting benchmark data seeding with config: {config:#?}");

    // Create webs (organizations)
    eprintln!("🌐 Creating {} webs...", config.webs);
    for web_idx in 0..config.webs {
        let web_id = transaction
            .create_web(
                system_actor_id,
                CreateWebParameter {
                    id: None,
                    administrator: Some(system_actor_id),
                    shortname: Some(format!("bench-web-{web_idx}")),
                    is_actor_web: false,
                },
            )
            .await?
            .web_id;
        data.webs.push(web_id);
    }
    eprintln!("✅ Created {} webs", data.webs.len());

    // Create team hierarchies
    eprintln!("🏢 Creating team hierarchies...");
    for (web_idx, &web_id) in data.webs.iter().enumerate() {
        let (web_teams, web_leaf_teams) = create_team_hierarchy(
            &mut transaction,
            web_id,
            config.teams_per_web,
            config.team_nesting_depth,
            config.teams_per_level,
            web_idx,
        )
        .await?;

        data.teams.extend(web_teams);
        data.leaf_teams.extend(web_leaf_teams);
    }
    eprintln!("✅ Created {} teams total", data.teams.len());

    // Create users
    eprintln!("👥 Creating {} users...", config.users);
    for _ in 0..config.users {
        let user_id = transaction.create_user(None).await?;
        data.users.push(user_id);
    }
    eprintln!("✅ Created {} users", data.users.len());

    // Use existing roles created by create_web/create_team and assign users
    eprintln!("🔑 Creating and assigning roles...");
    for (web_idx, &web_id) in data.webs.iter().enumerate() {
        // Get the existing web roles (Administrator, Member)
        let web_admin_role = transaction
            .get_role(ActorGroupId::Web(web_id), RoleName::Administrator)
            .await?
            .expect("Web Administrator role should exist")
            .id();
        let web_member_role = transaction
            .get_role(ActorGroupId::Web(web_id), RoleName::Member)
            .await?
            .expect("Web Member role should exist")
            .id();

        data.roles.push(web_admin_role);
        data.roles.push(web_member_role);

        // Assign users to web roles (round-robin)
        if !data.users.is_empty() {
            let admin_user = data.users[web_idx % data.users.len()];
            transaction
                .assign_role_by_id(ActorId::User(admin_user), web_admin_role)
                .await?;

            if data.users.len() > 1 {
                let member_user = data.users[(web_idx + 1) % data.users.len()];
                transaction
                    .assign_role_by_id(ActorId::User(member_user), web_member_role)
                    .await?;
            }
        }
    }

    // Create team roles (insert_team doesn't create them automatically unlike create_web)
    for (team_idx, &team_id) in data.teams.iter().enumerate() {
        // Create team roles manually since insert_team doesn't create them automatically
        let team_admin_role = transaction
            .create_role(None, ActorGroupId::Team(team_id), RoleName::Administrator)
            .await?;
        let team_member_role = transaction
            .create_role(None, ActorGroupId::Team(team_id), RoleName::Member)
            .await?;

        data.roles.push(team_admin_role);
        data.roles.push(team_member_role);

        // Assign users to team roles (round-robin)
        if !data.users.is_empty() {
            let admin_user = data.users[team_idx % data.users.len()];
            transaction
                .assign_role_by_id(ActorId::User(admin_user), team_admin_role)
                .await?;

            if data.users.len() > 1 {
                let member_user = data.users[(team_idx + 1) % data.users.len()];
                transaction
                    .assign_role_by_id(ActorId::User(member_user), team_member_role)
                    .await?;
            }
        }
    }
    eprintln!(
        "✅ Created {} roles total, assigned to users",
        data.roles.len()
    );

    // Create realistic policy distribution with explicit principal constraints
    eprintln!("📜 Creating policies...");
    let expected_policies = config.global_policies
        + (data.teams.len() * config.policies_per_team)
        + (data.roles.len() * config.policies_per_role)
        + (data.users.len() * config.policies_per_user);
    eprintln!("📊 Expected total policies: {}", expected_policies);
    let action_combinations = [
        &[ActionName::ViewEntity] as &[_],
        &[ActionName::ViewEntity, ActionName::CreateEntity],
        &[
            ActionName::ViewEntity,
            ActionName::CreateEntity,
            ActionName::UpdateEntity,
        ],
        &[ActionName::ViewEntity, ActionName::UpdateEntity],
    ];

    let mut all_policies = Vec::new();

    // 1. Global policies (accessible to all users)
    eprintln!("🌍 Creating {} global policies...", config.global_policies);
    for policy_idx in 0..config.global_policies {
        let actions = &action_combinations[policy_idx % action_combinations.len()];
        all_policies.push(PolicyCreationParams {
            name: Some(format!("GlobalPolicy_{policy_idx}")),
            effect: Effect::Permit,
            actions: actions.to_vec(),
            principal: None, // Global - accessible to all
            resource: None,
        });
    }
    eprintln!("✅ Created {} global policies", config.global_policies);

    // 2. Team-specific policies (only accessible to team members)
    eprintln!(
        "🏢 Creating {} team policies ({} teams × {} policies per team)...",
        data.teams.len() * config.policies_per_team,
        data.teams.len(),
        config.policies_per_team
    );
    for (team_idx, &team_id) in data.teams.iter().enumerate() {
        for policy_idx in 0..config.policies_per_team {
            let actions = &action_combinations[policy_idx % action_combinations.len()];
            all_policies.push(PolicyCreationParams {
                name: Some(format!("TeamPolicy_T{team_idx}_P{policy_idx}")),
                effect: Effect::Permit,
                actions: actions.to_vec(),
                principal: Some(PrincipalConstraint::ActorGroup {
                    actor_group: type_system::principal::actor_group::ActorGroupId::Team(team_id),
                    actor_type: None,
                }),
                resource: None,
            });
        }
    }
    eprintln!(
        "✅ Created {} team policies",
        data.teams.len() * config.policies_per_team
    );

    // 3. Role-specific policies (only accessible to specific role holders)
    eprintln!(
        "👤 Creating {} role policies ({} roles × {} policies per role)...",
        data.roles.len() * config.policies_per_role,
        data.roles.len(),
        config.policies_per_role
    );
    for (role_idx, &role_id) in data.roles.iter().enumerate() {
        for policy_idx in 0..config.policies_per_role {
            let actions = &action_combinations[policy_idx % action_combinations.len()];
            all_policies.push(PolicyCreationParams {
                name: Some(format!("RolePolicy_R{role_idx}_P{policy_idx}")),
                effect: Effect::Permit,
                actions: actions.to_vec(),
                principal: Some(PrincipalConstraint::Role {
                    role: role_id,
                    actor_type: None,
                }),
                resource: None,
            });
        }
    }
    eprintln!(
        "✅ Created {} role policies",
        data.roles.len() * config.policies_per_role
    );

    // 4. User-specific policies (only accessible to specific users)
    eprintln!(
        "🧑 Creating {} user policies ({} users × {} policies per user)...",
        data.users.len() * config.policies_per_user,
        data.users.len(),
        config.policies_per_user
    );
    for (user_idx, &user_id) in data.users.iter().enumerate() {
        for policy_idx in 0..config.policies_per_user {
            let actions = &action_combinations[policy_idx % action_combinations.len()];
            all_policies.push(PolicyCreationParams {
                name: Some(format!("UserPolicy_U{user_idx}_P{policy_idx}")),
                effect: Effect::Permit,
                actions: actions.to_vec(),
                principal: Some(PrincipalConstraint::Actor {
                    actor: ActorId::User(user_id),
                }),
                resource: None,
            });
        }
    }
    eprintln!(
        "✅ Created {} user policies",
        data.users.len() * config.policies_per_user
    );

    eprintln!(
        "💾 Inserting {} policies into database...",
        all_policies.len()
    );
    let start_time = std::time::Instant::now();
    data.policies = transaction
        .insert_policies_into_database(all_policies.iter())
        .await?;
    eprintln!(
        "✅ Inserted {} policies in {:?}",
        data.policies.len(),
        start_time.elapsed()
    );

    eprintln!("🔄 Committing transaction...");
    let commit_start = std::time::Instant::now();
    transaction.commit().await?;
    eprintln!("✅ Transaction committed in {:?}", commit_start.elapsed());

    eprintln!("🎉 Seeding completed! Summary:");
    eprintln!("  - {} webs", data.webs.len());
    eprintln!("  - {} teams", data.teams.len());
    eprintln!("  - {} users", data.users.len());
    eprintln!("  - {} roles", data.roles.len());
    eprintln!("  - {} policies", data.policies.len());

    Ok(data)
}

/// Creates nested team hierarchy that triggers recursive CTE performance issues
/// Returns (`all_teams`, `leaf_teams`) where `leaf_teams` are the deepest level teams
async fn create_team_hierarchy(
    store: &mut PostgresStore<impl AsClient>,
    web_id: WebId,
    root_teams: usize,
    max_depth: usize,
    teams_per_level: usize,
    web_idx: usize,
) -> Result<(Vec<TeamId>, Vec<TeamId>), Box<dyn Error>> {
    let mut all_teams = Vec::new();

    // Create root teams
    let mut current_level = Vec::new();
    for i in 0..root_teams {
        let team_id = store
            .insert_team(
                None,
                ActorGroupId::Web(web_id),
                &format!("web{web_idx}-root-{i}"),
            )
            .await?;
        current_level.push(team_id);
        all_teams.push(team_id);
    }

    // Create nested levels
    for depth in 1..max_depth {
        let mut next_level = Vec::new();

        for &parent_team in &current_level {
            for i in 0..teams_per_level {
                let team_id = store
                    .insert_team(
                        None,
                        ActorGroupId::Team(parent_team),
                        &format!("web{web_idx}-d{depth}-{i}"),
                    )
                    .await?;
                next_level.push(team_id);
                all_teams.push(team_id);
            }
        }

        current_level = next_level;
    }

    // current_level now contains only the leaf teams (deepest level)
    Ok((all_teams, current_level))
}

/// Contains all the IDs created during seeding for benchmark use
#[derive(Debug, Default)]
pub struct BenchmarkData {
    pub webs: Vec<WebId>,
    pub teams: Vec<TeamId>,
    pub leaf_teams: Vec<TeamId>, // Only the deepest level teams for user assignments
    pub roles: Vec<RoleId>,
    pub policies: Vec<hash_graph_authorization::policies::PolicyId>,
    pub users: Vec<type_system::principal::actor::UserId>,
}

impl BenchmarkData {
    /// Get a random user for benchmarking (deterministic based on index)
    pub fn get_test_user(&self, index: usize) -> Option<ActorId> {
        self.users
            .get(index % self.users.len())
            .map(|&user_id| user_id.into())
    }
}
