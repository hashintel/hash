import type { EntityId, PropertyValue } from "@blockprotocol/type-system";

import type { LlmParams } from "../get-llm-response/types.js";

type CorrectedValue =
  | {
      jsonPath: string[];
      type: "correct-missing" | "correct-incorrect";
      isProvidedValueCorrect: (value: PropertyValue) => boolean;
    }
  | {
      jsonPath: string[];
      type: "delete-unfounded";
    };

type JudgeTest = {
  testName: string;
  evaluation: {
    alreadyCorrectFieldPaths: string[][];
    expectedCorrections: CorrectedValue[];
    nonInferrableFieldPaths: string[][];
  };
  inputData: Required<Pick<LlmParams, "messages" | "tools">> &
    Pick<LlmParams, "systemPrompt">;
};

const baseJsonPath = ["content", "0", "input", "documentMetadata"];

const generateJsonPath = (path: string[]) => [...baseJsonPath, ...path];

export const judgeTestData: JudgeTest[] = [
  {
    testName: "Judge AI Output",
    evaluation: {
      alreadyCorrectFieldPaths: [
        generateJsonPath(["doi-link"]),
        generateJsonPath(["doi"]),
        generateJsonPath(["isrctn"]),
        generateJsonPath(["estimated-study-completion-date"]),
        generateJsonPath(["location"]),
      ],
      nonInferrableFieldPaths: [
        /**
         * The study has not enrolled or completed yet, we don't know this information.
         */
        generateJsonPath(["actual-enrollment"]),
        generateJsonPath(["actual-study-completion-date"]),
        generateJsonPath(["actual-study-primary-completion-date"]),
      ],
      expectedCorrections: [
        {
          /**
           * The paper refers to _target number of participants_: actual enrollment is not known
           */
          jsonPath: generateJsonPath(["actual-enrollment"]),
          type: "delete-unfounded",
        },
        {
          jsonPath: generateJsonPath(["estimated-enrollment"]),
          type: "correct-missing",
          isProvidedValueCorrect: (value) => value === 24,
        },
        /**
         * It's not clear from the document if the estimated completion date refers to primary or overall completion.
         * We'll accept either one.
         */
        {
          jsonPath: generateJsonPath(["estimated-primary-completion-date"]),
          type: "correct-missing",
          isProvidedValueCorrect: (value) => value === "2026-06-30",
        },
        {
          jsonPath: generateJsonPath(["estimated-completion-date"]),
          type: "correct-missing",
          isProvidedValueCorrect: (value) => value === "2026-06-30",
        },
        {
          jsonPath: generateJsonPath(["estimated-study-start-date"]),
          type: "correct-missing",
          isProvidedValueCorrect: (value) => value === "2024-07-01",
        },
        /**
         * These values should be inferrable. We'll accept any array as we can't tell how exactly the LLM will phrase the values.
         */
        {
          jsonPath: generateJsonPath(["study-arm"]),
          type: "correct-missing",
          isProvidedValueCorrect: (value) =>
            Array.isArray(value) && value.length > 0,
        },
        {
          jsonPath: generateJsonPath(["outcome-measure"]),
          type: "correct-missing",
          isProvidedValueCorrect: (value) =>
            Array.isArray(value) && value.length > 0,
        },
        {
          jsonPath: generateJsonPath(["authors"]),
          type: "correct-missing",
          isProvidedValueCorrect: (value) => {
            if (!Array.isArray(value)) {
              return false;
            }

            for (const entry of value) {
              if (!entry || typeof entry !== "object" || !("name" in entry)) {
                return false;
              }

              const name = entry.name;

              if (typeof name !== "string") {
                return false;
              }

              if (
                !name.includes("Sarah Young") &&
                !name.includes("Lori McDermott")
              ) {
                return false;
              }
            }

            return true;
          },
        },
      ],
    },
    inputData: {
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please provide metadata about this document, using only the information visible in the document.\n\nYou are given multiple options of what type of document this might be, and must choose from them.\n\nThe options are:\n\n- Study Record\n- Doc\n- Academic Paper\n- Book\n\n'Doc' is the most generic type. Use this if no other more specific type is appropriate.\n\nIf you're not confident about any of the metadata fields, omit them.",
            },
            {
              /**
               * This file is available in this folder for reference. The test does not depend on the file in the folder.
               */
              type: "file",
              fileEntity: {
                entityId:
                  "f89989c3-c5b9-4662-9cff-651384f4a0da~4043537b-6fc0-4d1b-95b5-2c84d03e9bbf" as EntityId,
                properties: {
                  "https://blockprotocol.org/@blockprotocol/types/property-type/original-file-name/":
                    "study_record_ISRCTN15438979_2025-01-20.pdf",
                  "https://hash.ai/@h/types/property-type/file-storage-region/":
                    "local",
                  "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/":
                    "study_record_ISRCTN15438979_2025-01-20.pdf",
                  "https://hash.ai/@h/types/property-type/file-storage-endpoint/":
                    "http://localhost:9000",
                  "https://hash.ai/@h/types/property-type/file-storage-provider/":
                    "AWS_S3",
                  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/":
                    "http://localhost:5001/file/files/f89989c3-c5b9-4662-9cff-651384f4a0da~4043537b-6fc0-4d1b-95b5-2c84d03e9bbf/0050a41f-113e-409c-a54c-d46d89ba103b/study_record_ISRCTN15438979_2025-01-20.pdf",
                  "https://hash.ai/@h/types/property-type/file-storage-key/":
                    "files/f89989c3-c5b9-4662-9cff-651384f4a0da~4043537b-6fc0-4d1b-95b5-2c84d03e9bbf/0050a41f-113e-409c-a54c-d46d89ba103b/study_record_ISRCTN15438979_2025-01-20.pdf",
                  "https://blockprotocol.org/@blockprotocol/types/property-type/file-size/": 45633,
                  "https://hash.ai/@h/types/property-type/upload-completed-at/":
                    "2025-01-31T18:20:01.069Z",
                  "https://hash.ai/@h/types/property-type/file-storage-bucket/":
                    "dev-hash-bucket",
                  "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/":
                    "application/pdf",
                  "https://hash.ai/@h/types/property-type/file-storage-force-path-style/": true,
                  "https://blockprotocol.org/@blockprotocol/types/property-type/original-source/":
                    "Upload",
                },
              },
            },
          ],
        },
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "provideDocumentMetadata",
              name: "provideDocumentMetadata",
              input: {
                documentMetadata: {
                  methodology:
                    "Dose-escalations of BTM-3566 will be done using single patient cohorts followed by traditional 3+3 methodology. The starting dose level is 0.9mg/kg and will be increased in 33% increments up to a total of 12.1mg/kg or until the maximum tolerated dose or recommended phase 2 dose is established. Dose de/escalations are determined by the Safety Review Committee which meets after each dose escalation cohort completes the dose-limiting toxicity period (ie. 28 days), at minimum, to evaluate the data available. BTM-3566 will be administered as an liquid oral medication with dose based on each patient's weight (mg/kg). Treatment is given as two-week cycles, with BTM-3566 taken daily during the first week (ie 7 days) and no treatment on the second week.",
                  "doi-link": "https://doi.org/10.1186/ISRCTN15438979",
                  "exclusion-criteria": [
                    "Patient has received the therapies/interventions listed below within the specified timeframe, or has ongoing toxicity from prior therapy > Grade 1 according to the CTCAE v5.0, with the exception of alopecia, vitiligo, Grade ≤2 neuropathy, well-controlled hypo/hyperthyroidism or other endocrinopathies that are well controlled with hormone replacement. Such exceptions must be assessed by the investigator (and approved by the sponsor) as not placing the patient at undue safety risk from participating in this study.",
                    "Patient has undergone a major surgery (excluding minor procedures, e.g., placement of vascular access) <3 months prior to administration of BTM-3566.",
                    "Patient has received any anti-cancer therapy <28 days prior to administration of BTM-3566.",
                    "Patient has received radiation therapy <28 days prior to administration of BTM-3566. Exception: limited (e.g., pain palliation) radiation therapy is allowed prior to and during study treatment as long as there are no acute toxicities and the patient has measurable disease outside the radiation field.",
                    "Patient has primary CNS lymphoma.",
                    "Patient has previously received a total anthracycline dose ≥ 360mg/m² doxorubicin or equivalent.",
                    "Patient has a history of any of the following ≤6 months before first dose: congestive heart failure New York Heart Association Grade ≥2, unstable angina, myocardial infarction, unstable symptomatic ischemic heart disease, uncontrolled hypertension despite appropriate medical therapy, ongoing symptomatic cardiac arrhythmias of Grade >2, pulmonary embolism, or symptomatic cerebrovascular events, or any other serious cardiac condition (e.g., pericardial effusion or restrictive cardiomyopathy). Chronic atrial fibrillation on stable anticoagulant therapy is allowed.",
                    "Patients with history of statin-associated myopathy within 6 months of enrollment who is still taking a statin.",
                    "Patient has symptomatic or uncontrolled neurologic disease (brain metastases, leptomeningeal disease, or spinal cord compression) not definitively treated with surgery or radiation. Note: Symptomatic or uncontrolled neurologic disease is defined as patient has active CNS metastases (including evidence of cerebral edema by MRI, or progression from prior imaging study, or any requirement for steroids, or clinical symptoms of/from CNS metastases) within 28 days prior to study treatment. Patients with known CNS metastases must have a baseline MRI scan within 28 days of study treatment.",
                    "Patient has current second malignancy at other sites (exceptions: non-melanomatous skin cancer, adequately treated in situ carcinoma, or indolent prostate cancer under observation). A history of other malignancies is allowed at the discretion of the Pl and medical monitor as long as patient has been free of recurrence for ≥2 years, or if the patient has been treated with curative intent within the past 2 years and, in the opinion of the investigator, is unlikely to have a recurrence.",
                    "Patient has active and clinically significant bacterial, fungal, or viral infection, including known Hepatitis A, B, ог С ог HIV (testing not required).",
                    "Patient requires prolonged use of a moderate or strong CYP3A4 inhibitor or inducer.",
                  ],
                  "actual-enrollment": 24,
                  summary:
                    "The purpose of this study is to test how safe and effective the treatment BTM-3566 is for treating mature B cell lymphomas. This type of cancer affects certain white blood cells. The study will gradually increase the doses given to patients, starting from very low doses and moving to higher ones, to ensure safety at each level.",
                  "inclusion-criteria": [
                    "Patients aged ≥18 years with a diagnosis of relapsed or refractory mature B cell lymphoma",
                    "Patients with non-Hodgkin's lymphoma (NHL) must have received at least 2 lines of prior therapy and have no available therapies with known clinical benefit",
                    "Patient must have measurable disease at screening per Lugano classification",
                    "Patient must have an Eastern Cooperative Oncology Group (ECOG) performance status (PS) of 0-2",
                    "Patient must have a predicted life expectancy of >3 months",
                    "Patient must have the following laboratory values (obtained ≤21 days prior to enrollment):",
                    "High sensitivity cTnl <99% ULN for the local assay",
                    "NT-pгоBNP < age-adjusted “rule in” value for CHF (450 pg/mL for age <50; >900 pg/mL for 50-75; >1800 pg/mL for age >75)",
                    "Serum CK < ULN",
                    "Serum creatinine <1.5 × ULN or if creatinine higher than normal range, calculated creatinine clearance (CrCL) must be ≥60 mL/min; actual body weight must be used for CrCL unless BMI >30 kg/m²; lean body weight must be used if BMI >30 kg/m²",
                    "Total bilirubin ≤1.5 × ULN unless has known history of Gilbert's syndrome (in which case, total bilirubin must be ≤3 × ULN)",
                    "AST and ALT ≤2.5 × ULN, or ≤5 × ULN if due to liver involvement by tumor",
                    "Hemoglobin ≥8.0 g/dL",
                    "Platelets ≥ 75 × 10º cells/L",
                    "Absolute neutrophil count ≥1.0 ×10º cells/L (without the use of hematopoietic growth factors)",
                    "Corrected QT interval (QTc) <470 ms for females and <450 ms for males (as calculated by the Fridericia correction formula)",
                    "LVEF ≥ 50% or ≥ LLN for their institution, whichever is higher",
                    "Women of child-bearing potential (WOCBP) must have a negative urine pregnancy test within 72 hours prior to first administration of BTM-3566",
                    "WOCBP and males with female partners of child-bearing potential must agree to use adequate birth control throughout their participation and for 90 days following the last dose of BTM-3566.",
                    "Patient must be willing to adhere to the study visit schedule and the prohibitions and restrictions specified in this protocol.",
                    "Patient should have a site of disease amenable to biopsy and be a candidate for tumor biopsy according to institutional guidelines. Patients should be willing to undergo a new tumor biopsy at baseline and after dose 2 to 4 in either Cycle 1 or 2 of this study. Note: Patients with sites of disease not amenable to biopsy, or unwilling to undergo biopsies, will be considered for enrollment after discussion with the study PI.",
                    "Patients must not be enrolled in any other clinical trial and must not be receiving other therapy directed at their malignancy.",
                  ],
                  "actual-study-start-date": "2024-07-01",
                  isrctn: "ISRCTN15438979",
                  entityTypeId:
                    "https://hash.ai/@h/types/entity-type/study-record/v/1",
                  location: "Canada",
                  "study-type": "Safety, Efficacy",
                  doi: "10.1186/ISRCTN15438979",
                  objective: [
                    "test how safe and effective the treatment BTM-3566 is for treating mature B cell lymphomas.",
                    "gradually increase the doses given to patients, starting from very low doses and moving to higher ones, to ensure safety at each level.",
                  ],
                  status: "Ongoing",
                  title:
                    "An early phase trial to test the safety and determine the appropriate dose of BTM-3566 in patients with mature B cell lymphoma",
                  "estimated-study-completion-date": "2026-06-30",
                  "medical-condition": [
                    "mature B cell lymphoma",
                    "B cell lymphoma",
                    "non-Hodgkin's lymphoma",
                    "cancer",
                  ],
                },
              },
            },
          ],
        },
      ],
      tools: [
        {
          name: "provideDocumentMetadata",
          description: "Provide metadata about the document",
          inputSchema: {
            type: "object",
            additionalProperties: false,
            properties: {
              documentMetadata: {
                anyOf: [
                  {
                    type: "object",
                    title: "Study Record",
                    properties: {
                      entityTypeId: {
                        type: "STRING",
                        enum: [
                          "https://hash.ai/@h/types/entity-type/study-record/v/1",
                        ],
                      },
                      objective: {
                        type: "array",
                        items: {
                          $id: "https://hash.ai/@h/types/property-type/objective/v/1",
                          title: "Objective",
                          description: "The goal or aim of something.",
                          oneOf: [
                            {
                              $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                              title: "Text",
                              description: "An ordered sequence of characters",
                              type: "string",
                            },
                          ],
                        },
                      },
                      "actual-study-primary-completion-date": {
                        $id: "https://hash.ai/@h/types/property-type/actual-study-primary-completion-date/v/1",
                        title: "Actual Study Primary Completion Date",
                        description:
                          "The date on which the last participant in a study was examined or received an intervention to collect final data for the primary outcome measure.",
                        oneOf: [
                          {
                            $id: "https://hash.ai/@h/types/data-type/date/v/1",
                            title: "Date",
                            description:
                              "A reference to a particular day represented within a calendar system, formatted according to RFC 3339.",
                            type: "string",
                            format: "date",
                          },
                        ],
                      },
                      isrctn: {
                        $id: "https://hash.ai/@h/types/property-type/isrctn/v/1",
                        title: "ISRCTN",
                        description:
                          "The ISRCTN Registry identifier for something.",
                        oneOf: [
                          {
                            $id: "https://hash.ai/@h/types/data-type/isrctn/v/1",
                            title: "ISRCTN",
                            description:
                              "The unique id for a study registered with the ISRCTN Registry.",
                            type: "string",
                          },
                        ],
                      },
                      status: {
                        $id: "https://hash.ai/@h/types/property-type/status/v/1",
                        title: "Status",
                        description: "The status of something.",
                        oneOf: [
                          {
                            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                            title: "Text",
                            description: "An ordered sequence of characters",
                            type: "string",
                          },
                        ],
                      },
                      doi: {
                        $id: "https://hash.ai/@h/types/property-type/doi/v/1",
                        title: "DOI",
                        description:
                          "The Digital Object Identifier (DOI) of an object",
                        oneOf: [
                          {
                            $id: "https://hash.ai/@h/types/data-type/doi/v/1",
                            title: "DOI",
                            description:
                              "A DOI (Digital Object Identifier), used to identify digital objects such as journal articles or datasets.",
                            type: "string",
                          },
                        ],
                      },
                      "doi-link": {
                        $id: "https://hash.ai/@h/types/property-type/doi-link/v/1",
                        title: "DOI Link",
                        description:
                          "A permanent link for a digital object, using its Digital Object Identifier (DOI), which resolves to a webpage describing it",
                        oneOf: [
                          {
                            $id: "https://hash.ai/@h/types/data-type/uri/v/1",
                            title: "URI",
                            description:
                              "A unique identifier for a resource (e.g. a URL, or URN).",
                            type: "string",
                            format: "uri",
                          },
                        ],
                      },
                      "study-type": {
                        $id: "https://hash.ai/@h/types/property-type/study-type/v/1",
                        title: "Study Type",
                        description:
                          "Describes the nature of a clinical study. Study types include interventional studies, which aim to find out more about a particular intervention by assigning people to different treatment groups, and observational studies, where the researchers do not influence what treatment the participants receive.",
                        oneOf: [
                          {
                            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                            title: "Text",
                            description: "An ordered sequence of characters",
                            type: "string",
                          },
                        ],
                      },
                      "trial-phase": {
                        $id: "https://hash.ai/@h/types/property-type/trial-phase/v/1",
                        title: "Trial Phase",
                        description:
                          "The stage of a clinical trial studying a drug or biological product.",
                        oneOf: [
                          {
                            $id: "https://hash.ai/@h/types/data-type/trial-phase/v/1",
                            title: "Trial Phase",
                            description:
                              "The distinct stage of a clinical trial, categorizing the study's primary goals and level of testing. Phase 0 involves very limited human testing, Phase 1 tests safety, dosage, and administration, Phase 2 tests effectiveness, Phase 3 confirms benefits, and Phase 4 studies long-term effects.",
                            type: "string",
                            enum: [
                              "Phase 4",
                              "Phase 0",
                              "Phase 2",
                              "Phase 1",
                              "Phase 3",
                              "Not Applicable",
                            ],
                          },
                        ],
                      },
                      "study-arm": {
                        type: "array",
                        items: {
                          $id: "https://hash.ai/@h/types/property-type/study-arm/v/1",
                          title: "Study Arm",
                          description:
                            "A specific treatment group in a clinical trial. Each arm represents a unique intervention strategy or control group, allowing researchers to compare outcomes between different approaches.",
                          oneOf: [
                            {
                              properties: {
                                methodology: {
                                  $id: "https://hash.ai/@h/types/property-type/methodology/v/1",
                                  title: "Methodology",
                                  description:
                                    "The procedure via which something was produced, analyzed, or otherwise approached.",
                                  oneOf: [
                                    {
                                      $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                                      title: "Text",
                                      description:
                                        "An ordered sequence of characters",
                                      type: "string",
                                    },
                                  ],
                                },
                                intervention: {
                                  $id: "https://hash.ai/@h/types/property-type/intervention/v/1",
                                  title: "Intervention",
                                  description:
                                    "An action taken to change something, typically to address a problem or otherwise bring about a desirable outcome.",
                                  oneOf: [
                                    {
                                      $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                                      title: "Text",
                                      description:
                                        "An ordered sequence of characters",
                                      type: "string",
                                    },
                                  ],
                                },
                                name: {
                                  $id: "https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1",
                                  title: "Name",
                                  description:
                                    "A word or set of words by which something is known, addressed, or referred to.",
                                  oneOf: [
                                    {
                                      $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                                      title: "Text",
                                      description:
                                        "An ordered sequence of characters",
                                      type: "string",
                                    },
                                  ],
                                },
                              },
                              required: ["name"],
                              additionalProperties: false,
                              type: "object",
                            },
                          ],
                        },
                      },
                      "nct-id": {
                        $id: "https://hash.ai/@h/types/property-type/nct-id/v/1",
                        title: "NCT ID",
                        description:
                          "The National Clinical Trial (NCT) Identifier Number for a study registered with ClinicalTrials.gov",
                        oneOf: [
                          {
                            $id: "https://hash.ai/@h/types/data-type/nct-id/v/1",
                            title: "NCT ID",
                            description:
                              "National Clinical Trial (NCT) Identifier Number, which is a unique identifier assigned to each clinical trial registered with ClinicalTrials.gov.",
                            type: "string",
                          },
                        ],
                      },
                      "medical-condition": {
                        type: "array",
                        items: {
                          $id: "https://hash.ai/@h/types/property-type/medical-condition/v/1",
                          title: "Medical Condition",
                          description:
                            "A disease, disorder, syndrome, illness, or injury, which may relate to either or both of physical and mental health.",
                          oneOf: [
                            {
                              $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                              title: "Text",
                              description: "An ordered sequence of characters",
                              type: "string",
                            },
                          ],
                        },
                      },
                      "actual-study-completion-date": {
                        $id: "https://hash.ai/@h/types/property-type/actual-study-completion-date/v/1",
                        title: "Actual Study Completion Date",
                        description:
                          "The date on which the last participant in a clinical study was examined or received an intervention to collect final data for the primary outcome measures, secondary outcome measures, and adverse events (that is, the last participant's last visit).",
                        oneOf: [
                          {
                            $id: "https://hash.ai/@h/types/data-type/date/v/1",
                            title: "Date",
                            description:
                              "A reference to a particular day represented within a calendar system, formatted according to RFC 3339.",
                            type: "string",
                            format: "date",
                          },
                        ],
                      },
                      "outcome-measure": {
                        type: "array",
                        items: {
                          $id: "https://hash.ai/@h/types/property-type/outcome-measure/v/1",
                          title: "Outcome Measure",
                          description:
                            "A measurement used to evaluate the outcome of a trial",
                          oneOf: [
                            {
                              properties: {
                                "time-frame": {
                                  $id: "https://hash.ai/@h/types/property-type/time-frame/v/1",
                                  title: "Time Frame",
                                  description:
                                    "The time period over which something occurs or is measured.",
                                  oneOf: [
                                    {
                                      $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                                      title: "Text",
                                      description:
                                        "An ordered sequence of characters",
                                      type: "string",
                                    },
                                  ],
                                },
                                name: {
                                  $id: "https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1",
                                  title: "Name",
                                  description:
                                    "A word or set of words by which something is known, addressed, or referred to.",
                                  oneOf: [
                                    {
                                      $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                                      title: "Text",
                                      description:
                                        "An ordered sequence of characters",
                                      type: "string",
                                    },
                                  ],
                                },
                                description: {
                                  $id: "https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1",
                                  title: "Description",
                                  description:
                                    "A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.",
                                  oneOf: [
                                    {
                                      $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                                      title: "Text",
                                      description:
                                        "An ordered sequence of characters",
                                      type: "string",
                                    },
                                  ],
                                },
                              },
                              required: ["name"],
                              additionalProperties: false,
                              type: "object",
                            },
                          ],
                        },
                      },
                      "exclusion-criteria": {
                        type: "array",
                        items: {
                          $id: "https://hash.ai/@h/types/property-type/exclusion-criteria/v/1",
                          title: "Exclusion Criteria",
                          description:
                            "Criteria that would prevent someone or something from being included in something.",
                          oneOf: [
                            {
                              $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                              title: "Text",
                              description: "An ordered sequence of characters",
                              type: "string",
                            },
                          ],
                        },
                      },
                      "estimated-enrollment": {
                        $id: "https://hash.ai/@h/types/property-type/estimated-enrollment/v/1",
                        title: "Estimated Enrollment",
                        description:
                          "The estimated number of participants that will be enrolled in something.",
                        oneOf: [
                          {
                            $id: "https://hash.ai/@h/types/data-type/integer/v/1",
                            title: "Integer",
                            description:
                              "The number zero (0), a positive natural number (e.g. 1, 2, 3), or the negation of a positive natural number (e.g. -1, -2, -3).",
                            type: "number",
                            multipleOf: 1,
                          },
                        ],
                      },
                      "estimated-study-start-date": {
                        $id: "https://hash.ai/@h/types/property-type/estimated-study-start-date/v/1",
                        title: "Estimated Study Start Date",
                        description:
                          "The estimated date on which the first participant will be enrolled in a clinical study.",
                        oneOf: [
                          {
                            $id: "https://hash.ai/@h/types/data-type/date/v/1",
                            title: "Date",
                            description:
                              "A reference to a particular day represented within a calendar system, formatted according to RFC 3339.",
                            type: "string",
                            format: "date",
                          },
                        ],
                      },
                      "estimated-study-completion-date": {
                        $id: "https://hash.ai/@h/types/property-type/estimated-study-completion-date/v/1",
                        title: "Estimated Study Completion Date",
                        description:
                          "The estimated date on which the last participant in a clinical study will be examined or receive an intervention to collect final data for the primary outcome measures, secondary outcome measures, and adverse events (that is, the last participant's last visit).",
                        oneOf: [
                          {
                            $id: "https://hash.ai/@h/types/data-type/date/v/1",
                            title: "Date",
                            description:
                              "A reference to a particular day represented within a calendar system, formatted according to RFC 3339.",
                            type: "string",
                            format: "date",
                          },
                        ],
                      },
                      methodology: {
                        $id: "https://hash.ai/@h/types/property-type/methodology/v/1",
                        title: "Methodology",
                        description:
                          "The procedure via which something was produced, analyzed, or otherwise approached.",
                        oneOf: [
                          {
                            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                            title: "Text",
                            description: "An ordered sequence of characters",
                            type: "string",
                          },
                        ],
                      },
                      "actual-enrollment": {
                        $id: "https://hash.ai/@h/types/property-type/actual-enrollment/v/1",
                        title: "Actual Enrollment",
                        description:
                          "The actual number of participants enrolled in something.",
                        oneOf: [
                          {
                            $id: "https://hash.ai/@h/types/data-type/integer/v/1",
                            title: "Integer",
                            description:
                              "The number zero (0), a positive natural number (e.g. 1, 2, 3), or the negation of a positive natural number (e.g. -1, -2, -3).",
                            type: "number",
                            multipleOf: 1,
                          },
                        ],
                      },
                      "inclusion-criteria": {
                        type: "array",
                        items: {
                          $id: "https://hash.ai/@h/types/property-type/inclusion-criteria/v/1",
                          title: "Inclusion Criteria",
                          description:
                            "Criteria that must be met for someone or something to be included in something.",
                          oneOf: [
                            {
                              $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                              title: "Text",
                              description: "An ordered sequence of characters",
                              type: "string",
                            },
                          ],
                        },
                      },
                      "actual-study-start-date": {
                        $id: "https://hash.ai/@h/types/property-type/actual-study-start-date/v/1",
                        title: "Actual Study Start Date",
                        description:
                          "The actual date on which the first participant was enrolled in a clinical study.",
                        oneOf: [
                          {
                            $id: "https://hash.ai/@h/types/data-type/date/v/1",
                            title: "Date",
                            description:
                              "A reference to a particular day represented within a calendar system, formatted according to RFC 3339.",
                            type: "string",
                            format: "date",
                          },
                        ],
                      },
                      "estimated-primary-completion-date": {
                        $id: "https://hash.ai/@h/types/property-type/estimated-primary-completion-date/v/1",
                        title: "Estimated Primary Completion Date",
                        description:
                          "The estimated date on which the last participant in a study will be examined or receive an intervention to collect final data for the primary outcome measure.",
                        oneOf: [
                          {
                            $id: "https://hash.ai/@h/types/data-type/date/v/1",
                            title: "Date",
                            description:
                              "A reference to a particular day represented within a calendar system, formatted according to RFC 3339.",
                            type: "string",
                            format: "date",
                          },
                        ],
                      },
                      location: {
                        $id: "https://hash.ai/@h/types/property-type/location/v/1",
                        title: "Location",
                        description:
                          "A location for something, expressed as a single string",
                        oneOf: [
                          {
                            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                            title: "Text",
                            description: "An ordered sequence of characters",
                            type: "string",
                          },
                        ],
                      },
                      summary: {
                        $id: "https://hash.ai/@h/types/property-type/summary/v/1",
                        title: "Summary",
                        description: "The summary of the something.",
                        oneOf: [
                          {
                            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                            title: "Text",
                            description: "An ordered sequence of characters",
                            type: "string",
                          },
                        ],
                      },
                      "number-of-pages": {
                        $id: "https://hash.ai/@h/types/property-type/number-of-pages/v/1",
                        title: "Number of Pages",
                        description: "The total number of pages something has.",
                        oneOf: [
                          {
                            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
                            title: "Number",
                            description:
                              "An arithmetical value (in the Real number system)",
                            type: "number",
                          },
                        ],
                      },
                      "publication-year": {
                        $id: "https://hash.ai/@h/types/property-type/publication-year/v/1",
                        title: "Publication Year",
                        description:
                          "The year in which something was first published.",
                        oneOf: [
                          {
                            $id: "https://hash.ai/@h/types/data-type/calendar-year/v/1",
                            title: "Calendar Year",
                            description: "A year in the Gregorian calendar.",
                            type: "number",
                          },
                        ],
                      },
                      title: {
                        $id: "https://hash.ai/@h/types/property-type/title/v/1",
                        title: "Title",
                        description: "The title of something.",
                        oneOf: [
                          {
                            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                            title: "Text",
                            description: "An ordered sequence of characters",
                            type: "string",
                          },
                        ],
                      },
                    },
                    required: [
                      "methodology",
                      "objective",
                      "title",
                      "entityTypeId",
                    ],
                  },
                  {
                    type: "object",
                    title: "Doc",
                    properties: {
                      entityTypeId: {
                        type: "STRING",
                        enum: ["https://hash.ai/@h/types/entity-type/doc/v/1"],
                      },
                      summary: {
                        $id: "https://hash.ai/@h/types/property-type/summary/v/1",
                        title: "Summary",
                        description: "The summary of the something.",
                        oneOf: [
                          {
                            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                            title: "Text",
                            description: "An ordered sequence of characters",
                            type: "string",
                          },
                        ],
                      },
                      "number-of-pages": {
                        $id: "https://hash.ai/@h/types/property-type/number-of-pages/v/1",
                        title: "Number of Pages",
                        description: "The total number of pages something has.",
                        oneOf: [
                          {
                            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
                            title: "Number",
                            description:
                              "An arithmetical value (in the Real number system)",
                            type: "number",
                          },
                        ],
                      },
                      "publication-year": {
                        $id: "https://hash.ai/@h/types/property-type/publication-year/v/1",
                        title: "Publication Year",
                        description:
                          "The year in which something was first published.",
                        oneOf: [
                          {
                            $id: "https://hash.ai/@h/types/data-type/calendar-year/v/1",
                            title: "Calendar Year",
                            description: "A year in the Gregorian calendar.",
                            type: "number",
                          },
                        ],
                      },
                      title: {
                        $id: "https://hash.ai/@h/types/property-type/title/v/1",
                        title: "Title",
                        description: "The title of something.",
                        oneOf: [
                          {
                            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                            title: "Text",
                            description: "An ordered sequence of characters",
                            type: "string",
                          },
                        ],
                      },
                    },
                    required: ["title", "entityTypeId"],
                  },
                  {
                    type: "object",
                    title: "Academic Paper",
                    properties: {
                      entityTypeId: {
                        type: "STRING",
                        enum: [
                          "https://hash.ai/@h/types/entity-type/academic-paper/v/1",
                        ],
                      },
                      "doi-link": {
                        $id: "https://hash.ai/@h/types/property-type/doi-link/v/1",
                        title: "DOI Link",
                        description:
                          "A permanent link for a digital object, using its Digital Object Identifier (DOI), which resolves to a webpage describing it",
                        oneOf: [
                          {
                            $id: "https://hash.ai/@h/types/data-type/uri/v/1",
                            title: "URI",
                            description:
                              "A unique identifier for a resource (e.g. a URL, or URN).",
                            type: "string",
                            format: "uri",
                          },
                        ],
                      },
                      methodology: {
                        $id: "https://hash.ai/@h/types/property-type/methodology/v/1",
                        title: "Methodology",
                        description:
                          "The procedure via which something was produced, analyzed, or otherwise approached.",
                        oneOf: [
                          {
                            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                            title: "Text",
                            description: "An ordered sequence of characters",
                            type: "string",
                          },
                        ],
                      },
                      "experimental-subject": {
                        $id: "https://hash.ai/@h/types/property-type/experimental-subject/v/1",
                        title: "Experimental Subject",
                        description:
                          "The type of participant or observed entity in an experiment or study.",
                        oneOf: [
                          {
                            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                            title: "Text",
                            description: "An ordered sequence of characters",
                            type: "string",
                          },
                        ],
                      },
                      doi: {
                        $id: "https://hash.ai/@h/types/property-type/doi/v/1",
                        title: "DOI",
                        description:
                          "The Digital Object Identifier (DOI) of an object",
                        oneOf: [
                          {
                            $id: "https://hash.ai/@h/types/data-type/doi/v/1",
                            title: "DOI",
                            description:
                              "A DOI (Digital Object Identifier), used to identify digital objects such as journal articles or datasets.",
                            type: "string",
                          },
                        ],
                      },
                      title: {
                        $id: "https://hash.ai/@h/types/property-type/title/v/1",
                        title: "Title",
                        description: "The title of something.",
                        oneOf: [
                          {
                            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                            title: "Text",
                            description: "An ordered sequence of characters",
                            type: "string",
                          },
                        ],
                      },
                      finding: {
                        $id: "https://hash.ai/@h/types/property-type/finding/v/1",
                        title: "Finding",
                        description:
                          "The results or conclusion of an experiment, research project, investigation, etc.",
                        oneOf: [
                          {
                            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                            title: "Text",
                            description: "An ordered sequence of characters",
                            type: "string",
                          },
                        ],
                      },
                      summary: {
                        $id: "https://hash.ai/@h/types/property-type/summary/v/1",
                        title: "Summary",
                        description: "The summary of the something.",
                        oneOf: [
                          {
                            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                            title: "Text",
                            description: "An ordered sequence of characters",
                            type: "string",
                          },
                        ],
                      },
                      "number-of-pages": {
                        $id: "https://hash.ai/@h/types/property-type/number-of-pages/v/1",
                        title: "Number of Pages",
                        description: "The total number of pages something has.",
                        oneOf: [
                          {
                            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
                            title: "Number",
                            description:
                              "An arithmetical value (in the Real number system)",
                            type: "number",
                          },
                        ],
                      },
                      "publication-year": {
                        $id: "https://hash.ai/@h/types/property-type/publication-year/v/1",
                        title: "Publication Year",
                        description:
                          "The year in which something was first published.",
                        oneOf: [
                          {
                            $id: "https://hash.ai/@h/types/data-type/calendar-year/v/1",
                            title: "Calendar Year",
                            description: "A year in the Gregorian calendar.",
                            type: "number",
                          },
                        ],
                      },
                    },
                    required: ["summary", "title", "entityTypeId"],
                  },
                  {
                    type: "object",
                    title: "Book",
                    properties: {
                      entityTypeId: {
                        type: "STRING",
                        enum: ["https://hash.ai/@h/types/entity-type/book/v/1"],
                      },
                      isbn: {
                        $id: "https://hash.ai/@h/types/property-type/isbn/v/1",
                        title: "ISBN",
                        description:
                          "The International Standard Book Number (ISBN) of a book",
                        oneOf: [
                          {
                            $id: "https://hash.ai/@h/types/data-type/isbn/v/1",
                            title: "ISBN",
                            description:
                              "International Standard Book Number: a numeric commercial book identifier that is intended to be unique, issued by an affiliate of the International ISBN Agency.",
                            type: "string",
                          },
                        ],
                      },
                      summary: {
                        $id: "https://hash.ai/@h/types/property-type/summary/v/1",
                        title: "Summary",
                        description: "The summary of the something.",
                        oneOf: [
                          {
                            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                            title: "Text",
                            description: "An ordered sequence of characters",
                            type: "string",
                          },
                        ],
                      },
                      "number-of-pages": {
                        $id: "https://hash.ai/@h/types/property-type/number-of-pages/v/1",
                        title: "Number of Pages",
                        description: "The total number of pages something has.",
                        oneOf: [
                          {
                            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
                            title: "Number",
                            description:
                              "An arithmetical value (in the Real number system)",
                            type: "number",
                          },
                        ],
                      },
                      "publication-year": {
                        $id: "https://hash.ai/@h/types/property-type/publication-year/v/1",
                        title: "Publication Year",
                        description:
                          "The year in which something was first published.",
                        oneOf: [
                          {
                            $id: "https://hash.ai/@h/types/data-type/calendar-year/v/1",
                            title: "Calendar Year",
                            description: "A year in the Gregorian calendar.",
                            type: "number",
                          },
                        ],
                      },
                      title: {
                        $id: "https://hash.ai/@h/types/property-type/title/v/1",
                        title: "Title",
                        description: "The title of something.",
                        oneOf: [
                          {
                            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                            title: "Text",
                            description: "An ordered sequence of characters",
                            type: "string",
                          },
                        ],
                      },
                    },
                    required: ["title", "entityTypeId"],
                  },
                ],
              },
              authors: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    affiliatedWith: {
                      type: "array",
                      items: {
                        type: "string",
                      },
                      description:
                        "Any institution(s) or organization(s) that the document identifies the author as being affiliated with",
                    },
                    name: {
                      description: "The name of the author",
                      type: "string",
                    },
                  },
                },
              },
            },
          },
        },
      ],
    },
  },
];
