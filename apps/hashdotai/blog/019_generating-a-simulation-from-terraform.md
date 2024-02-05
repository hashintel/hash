---
title: "Generating a Simulation from Terraform"
date: "2021-05-26"
cover: https://imagedelivery.net/EipKtqu98OotgfhvKf6Eew/b75cf25b-2c82-4dc9-c3f1-dafcff550900/public
categories: 
  - "Simulation"
---

The [Infrastructure-as-Code](https://en.wikipedia.org/wiki/Infrastructure_as_code) (IaC) movement has revolutionized the way cloud infrastructure is managed, enabling self-documenting, version-controlled provisioning and maintenance of systems and hardware. While sysadmins are very much still required, tooling and best practices for programmatically setting up large computing infrastructures have dramatically improved as DevOps has matured. In particular, planning tools like Terraform make it easy to set up and maintain massive resource clusters with relative ease.

Because infrastructure is defined in declarative information files, those same configurations can be used as inputs within HASH to automatically generate models that can be used for simulation.

Terraform-based HASH simulations can help improve infrastructure provisioning and design processes, helping you select the right instance types to use, anticipate or avoid downtime, and forecast or smooth costs.

<iframe src="https://core.hash.ai/embed.html?project=%40hash%2Fterraform-simulation&amp;ref=stable&amp;view=analysis" width="100%" height="100%" frameborder="0" scrolling="auto" style="position: absolute; top: 0; left: 0;"></iframe>

By way of lightweight demonstration, above you'll see a [simulation that takes in a Terraform configuration](https://hash.ai/@hash/terraform-simulation) alongside a set of user data, and creates a Kubernetes cluster. This leverages HASH's [support for datasets](https://docs.hash.ai/core/creating-simulations/datasets) to define a unique simulation based off of the user's configuration files:

- `terraform_resource.json` - a `terraform.tf.json` style file that defines the cluster and gets information on AWS CPU and memory specs from another dataset of [AWS instances](https://hash.ai/@hash/aws-instances).
- `distribution.csv` - a dataset that represents a proportion of daily requests received each hour of the day.

Pods and instance **agents** contain **behaviors** that receive **messages** from a request generator. The requests are stochastically generated based on the data in `distribution.csv`. [Read more in the project's README >](https://hash.ai/@hash/terraform-simulation)
