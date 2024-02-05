---
title: "Vaccine Distribution Scenario Modeling"
date: "2021-02-16"
cover: https://imagedelivery.net/EipKtqu98OotgfhvKf6Eew/7e2fe056-2d1c-47a3-a0cf-a65f9436b700/public
categories: 
  - "Simulation"
  - "Topic > Public Health"
  - "Topic > Policy"
---

Optimizing vaccine allocation is a critical task - improving the distribution of vaccines could save tens of thousands of lives over the coming months. In partnership with researchers at the [Virginia Modeling, Analysis, and Simulation Center](https://www.odu.edu/vmasc), we created a simulation of the vaccine distribution process. 

Our goal is to provide decision and policymakers in health departments and emergency management with a tool for understanding and optimizing the distribution of COVID-19 vaccines at this current moment - focusing on allocation policies for storage and assignment of first and second doses from both vaccine manufacturers. Utilizing this model, policymakers are able to build a representative model of their community at scale and test various configurations, policies and structures to explore their impact on distribution, vaccine reserve utilization, and population immunity.

<blockquote><p>When our customers came to us with an emergent question, HASH made it incredibly simple to get down to work and create a model that could serve as a a foundation for sharing knowledge and even hooking in our data. What would normally take weeks took hours. </p><cite>Alex Nielsen, Team Lead, VMASC</cite></blockquote>

## Business Logic

The simulation models distributor agents - pharmacies, hospitals, clinics - administering vaccines to patients. Every timestep represents one day. A stochastic number of patients arrive each day to the distributors to receive a vaccine, and as the simulation runs these same patients return for a second dose.

A distributor is characterized by its **throughput**, the number of patients it can treat in a day, and **vaccines on hand**, the number of vaccines it has in stock. Each distributor has a primary vaccine they provide, either Moderna or Pfizer. Vaccines are kept in general storage, or they’re reserved separately for use as a second dose (e.g. reserving vaccines for patients' second appointment).

The key decisions the distributor needs to make:

- If more people arrive than can be treated (because the distributor agent has a limited number of staff to administer vaccines), who should be turned away? People who haven’t received a vaccine, or people coming for their second dose?
- Should the distributor set vaccines aside in reserve storage for patients who need a second dose, or should vaccines be available for any patient? If setting aside vaccines, how many should be reserved?

These decisions, or **scenarios**, can be set through global parameters (in `globals.json`)

### Scenario Configuration

The simulation has many configurable parameters (visit the HASH Index page or the README for an explanation of each one); however, two ‘scenario’ options determine the two decisions related to second dose storage and patient prioritization.

![](https://imagedelivery.net/EipKtqu98OotgfhvKf6Eew/922bded2-5267-4018-6825-5c76b934c900/public)

_Global parameters for the vaccine distribution simulation_

Patient prioritization is set in the prioritize_group_option. There are two groups of patients - those who haven’t received their first dose and those who have. `num_of_first_dose` represent the former; `second_dose_moderna` and `second_dose_pfizer` the second.

**The vaccine reserve policies are set through three options:**

1. If `second_dose_separate_storage` is set as true for secondary appointments the distributor will first check if there are vials stored in secondary storage. These vials will **not** be used for first appointments.
1. Setting `second_dose_divert_to_storage` to a positive integer is option B. Vaccine vials equivalent to the number specified in `second_dose_storage` will be diverted to secondary storage.
1. Setting `second_dose_matching` as true is equivalent to option A, where the distributor will set vials in secondary storage equivalent to the number of vials administered on that day.

## Key Assumptions

The units of vaccines are **vials** and **doses**. A vial contains five doses. Every patient is administered one dose per visit. Short term spoilage occurs when there is a mismatch between the number of patients served and the number of vials/doses retrieved from storage. For instance, if four patients arrive at a distributor, one vial will be used and four doses from that vial will be administered. The extra dose goes unused, and spoils at the end of the day. **Long term spoilage** occurs when the age of a vaccine exceeds its storage life. At that point the vaccine is considered spoiled and removed from the distributor's reserves.

Currently the vaccine distributors receive a weekly shipment of their vaccine type from the shipping agent. For example, one distributor agent would receive 20 vials (100 doses) of the Moderna vaccine on time step 1, and then another 20 vials on timestep 8, etc. Another distributor agent would receive 20 vials of the Pfizer vaccine on timestep 2, then timestep 9, and so on. The number of vials received is fixed - they always receive the same amount.

The population agent stores second dose appointments. After a patient gets the first dose of the vaccine, they are scheduled to return to the distributor after a set number of timesteps (configurable in appt_delay). If the distributor is at capacity, they are turned away.

## Metrics and Plots

![](https://imagedelivery.net/EipKtqu98OotgfhvKf6Eew/8db62d2a-9559-4b04-507a-05c34b004800/public)

Plots, in the Analysis tab, provide insight into what’s happening during the simulation. 

There are six default charts:

1. **Vaccinations:** Track the number of Moderna and Pfizer vaccinations administered
1. **Reserves:** The aggregate number of vaccines distributors have in storage, split between first and second doses.
1. **Vaccination Rate:** The average number of vaccinations administered every timestep
1. **Total Wasted Doses:** The short and long term spoilage of vaccines on hand
1. **Total Vaccines:** The number of vaccines shipped
1. **Population Immunity:** The percentage of the population (set in globals) level immunity, expressed as number of one dose patients * 0.5, + number of second dose * .95, divided by total population.

## Extensions

We envision this simulation as a jumping off point for more detailed and tailored distribution models. There are numerous directions that users can take this; some potentially high value features:

- **Additional heterogeneity:** Different distributor agents could receive different amounts of vaccines, could have different throughputs, could receive drastically different numbers of patients, etc.
- **Feedback loops for vaccine requests:** Vaccine allocators are likely responsive to increased demand and shortages from specific distributors - expand the shipping agent behaviors and logic to deliver more vaccines to distributors that are short on vaccines.
- **Appointment logic:** Customize the sim so that patients pre-schedule appointments and vaccine reserve rates depend on upcoming appointments. Second dose appointments could be pushed, not entirely cancelled.

If you're interested in extending the simulation, you're invited to fork it directly and experiment, or reach out to us by [email](support@hash.ai) or on [Discord](https://hash.ai/discord)) for more information/customization.
