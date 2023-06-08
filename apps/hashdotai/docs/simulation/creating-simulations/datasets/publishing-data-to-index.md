---
title: Publishing Datasets to Index
slug: simulation/creating-simulations/datasets/publishing-data-to-index
objectId: d8103bea-2124-494a-a852-c38e8e1d0f9d
---

# Publishing Datasets to Index

You can share your datasets with others by publishing them to hIndex.

## Upload Datasets

To upload a dataset, first visit your projects page - hash.ai/@\[your_username\] - and select new Dataset.

![](https://cdn-us1.hash.ai/site/docs/kapture-2021-06-06-at-21.00.44%20%283%29%20%283%29%20%283%29%20%281%29%20%283%29.gif)

Add a name and project path, and choose the visibility and the user or org to publish the dataset under. Private datasets are only displayed to you \(and other members of your organization if you've published under that\) while public are visible to all HASH users.

## Edit Datasets

To edit a Dataset, visit your projects page, select the data you want to publish, and click Edit Project.

From the Edit Project modal add descriptions, keywords, and schemas to your data.

![Publish Modal](https://cdn-us1.hash.ai/site/docs/screen-shot-2020-05-12-at-1.22.27-pm.png)

Release a new version and click public at the bottom of the modal.

![](https://cdn-us1.hash.ai/site/docs/screenshot-2020-10-30-144523.png)

Finally add semantic versioning details and create a release.

![](https://cdn-us1.hash.ai/site/docs/screenshot-2020-10-30-144826.png)

If publishing as yourself, the dataset will be referenced in a simulation as:

```text
"@[your-username]/[listing-shortname]/[dataset].[csv/json]"
```

Or, if you're part of an organization and publishing on their behalf, when you publish a dataset in a simulation it will be referenceable as:

```text
"@[org-handle]/[listing-shortname]/[dataset].[csv/json]"
```
