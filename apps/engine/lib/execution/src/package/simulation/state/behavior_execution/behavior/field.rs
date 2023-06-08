use std::collections::HashMap;

use stateful::field::{FieldSpecMap, RootFieldSpec, RootFieldSpecCreator};

use crate::{
    package::simulation::{
        state::behavior_execution::{behavior::keys::BehaviorKeys, Behavior},
        PackageInitConfig,
    },
    Error, Result,
};

// TODO: Come up with a better name. Also probably rename `BehaviorKeys` to `BehaviorFields`.
#[derive(Clone)]
pub struct BehaviorFieldMap {
    shared: Behavior,
    keys: BehaviorKeys,
}

impl BehaviorFieldMap {
    pub fn shared(&self) -> &Behavior {
        &self.shared
    }

    pub fn keys(&self) -> &BehaviorKeys {
        &self.keys
    }
}

#[derive(Clone)]
pub struct BehaviorMap {
    pub inner: HashMap<String, BehaviorFieldMap>,
    pub all_field_specs: FieldSpecMap,
}

impl TryFrom<(&PackageInitConfig, &RootFieldSpecCreator)> for BehaviorMap {
    type Error = Error;

    fn try_from(
        (package_creator_config, field_spec_creator): (&PackageInitConfig, &RootFieldSpecCreator),
    ) -> Result<Self> {
        let mut meta = HashMap::new();
        let mut field_spec_map = FieldSpecMap::empty();

        package_creator_config
            .behaviors
            .iter()
            .try_for_each::<_, Result<()>>(|b| {
                if meta.contains_key(&b.name) {
                    return Ok(());
                }

                // Need to check whether we're dealing with rust built-in keys,
                // for which we always use the in-repo locally defined ones.

                // TODO: OS - Re-enable Rust Behavior Runner
                // let rust_built_in_behavior_keys = if rust::behaviors::is_built_in(&b.name) {
                //     let behavior = rust::behaviors::get_named_behavior(&b.name)
                //         .expect(&format!("Built in behavior {} not found", &b.name));
                //     let behavior_keys_src = behavior.behavior_keys_src.expect(&format!(
                //         "Expected built in Rust behavior `{}` to contain behavior keys",
                //         &b.name
                //     ));
                //     Some(behavior_keys_src)
                // } else {
                //     None
                // };
                let rust_built_in_behavior_keys = None;
                let keys = rust_built_in_behavior_keys
                    .or_else(|| b.behavior_keys_src.clone())
                    .map(|v| BehaviorKeys::from_json_str(&v, field_spec_creator))
                    .unwrap_or_else(|| {
                        // The default is to use all built-in keys
                        Ok(BehaviorKeys::default())
                    })?;
                field_spec_map.try_extend(
                    keys.get_field_specs()
                        .cloned()
                        .collect::<Vec<RootFieldSpec>>(),
                )?;
                let behavior = BehaviorFieldMap {
                    shared: b.clone(),
                    keys,
                };

                meta.insert(b.name.clone(), behavior);
                Ok(())
            })?;
        Ok(BehaviorMap {
            inner: meta,
            all_field_specs: field_spec_map,
        })
    }
}

impl BehaviorMap {
    pub fn iter_behaviors(&self) -> impl Iterator<Item = &BehaviorFieldMap> {
        self.inner.values()
    }
}
