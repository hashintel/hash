use serde_json::Value;

use crate::{
    Extensions,
    document::text,
    extensions::{items, resolve_place},
};

const KERNEL_PREFIX: &str = "/**
* This code defines the kernel for the transition.
* `input` holds tokens from coloured standard/read input places
* keyed by place name, and `parameters` any global parameters defined.
* Return tokens for output places keyed by place name.
*/

// input is an object which looks like:
//   { PlaceA: [{ x: 0, y: 0 }], PlaceB: [...] }
// where 'x' and 'y' are examples of dimensions (properties)
// of the token's type.

// Return an object with output place names as keys
return {
  ";

fn default_kernel(
    document: &Value,
    net: &Value,
    transition: &Value,
    extensions: Extensions,
) -> String {
    let mut outputs = Vec::new();
    for arc in items(transition, "outputArcs") {
        let Some(place) = resolve_place(document, net, arc, extensions.subnets) else {
            continue;
        };
        let color = items(document, "types")
            .iter()
            .chain(
                items(document, "subnets")
                    .iter()
                    .flat_map(|subnet| items(subnet, "types")),
            )
            .chain(items(net, "types"))
            .rfind(|color| color["id"] == place["colorId"]);
        let Some(color) = color else {
            continue;
        };
        let fields = items(color, "elements")
            .iter()
            .map(|element| {
                let default = match text(element, "type") {
                    "boolean" => "false",
                    "uuid" => "Uuid.generate()",
                    "string" => "\"\"",
                    _ => "0",
                };
                format!("{}: {default}", text(element, "name"))
            })
            .collect::<Vec<_>>()
            .join(", ");
        // Array.from in the TypeScript template truncates fractional arc weights.
        #[expect(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "Arc weights are positive; template token counts truncate to whole tokens"
        )]
        let count = arc["weight"].as_f64().unwrap_or(0.0) as usize;
        let tokens = vec![format!("{{ {fields} }}"); count].join(",\n    ");
        outputs.push(format!("{}: [\n    {tokens}\n  ],", text(place, "name")));
    }
    format!("{KERNEL_PREFIX}{}\n}};", outputs.join("\n  "))
}

pub(crate) fn sanitize_transition(
    document: &Value,
    net: &Value,
    transition: &mut Value,
    extensions: Extensions,
    load_default: bool,
) {
    extensions.sanitize_transition(document, net, transition);
    if load_default
        && text(transition, "transitionKernelCode").trim().is_empty()
        && extensions.kernel_available(document, net, transition)
    {
        transition["transitionKernelCode"] =
            Value::String(default_kernel(document, net, transition, extensions));
    }
}

pub(crate) fn sanitize_all_transitions(document: &mut Value, extensions: Extensions) {
    let view = document.clone();
    sanitize_net(&view, &view, document, extensions);
    if let Some(subnets) = document.get_mut("subnets").and_then(Value::as_array_mut) {
        for (subnet_view, subnet) in items(&view, "subnets").iter().zip(subnets) {
            sanitize_net(&view, subnet_view, subnet, extensions);
        }
    }
}

fn sanitize_net(document: &Value, view: &Value, net: &mut Value, extensions: Extensions) {
    if let Some(transitions) = net.get_mut("transitions").and_then(Value::as_array_mut) {
        for transition in transitions {
            sanitize_transition(document, view, transition, extensions, true);
        }
    }
}
