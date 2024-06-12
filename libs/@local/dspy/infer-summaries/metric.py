import json
import uuid

def metric(example, pred, Trace=None) -> float:
    """
    Evaluates agent performance in identifying entities from content, assessed against an example containing:
    - gold_entities: entities that should be identified because they match the research brief and type
    - irrelevant_entities: entities that should not be identified because they don't match the research brief
    - wrong_type_entities: entities that should not be identified because they are of the wrong type

    The function calculates a score out of 1 based on the following criteria:
    - If any entity in `gold_entities` is missed, the score is 0.
    - Otherwise, the score starts at 1 and is reduced based on the presence of 
      entities in `wrong_type_entities` and `irrelevant_entities`.

    Scoring:
    - If any gold entity is missed, the score is 0.
    - If no gold entity is missed:
        - Any predicted entity appearing in `wrong_type_entities` reduces the score
          up to a maximum of 0.4, proportionate to the number of wrong type entities in the example.
        - Any predicted entity appearing in `irrelevant_entities` reduces the score
          up to a maximum of 0.2, proportionate to the number of irrelevant entities in the example.

    A unique identifier (UUID) is generated for each evaluation. The logs, including 
    predicted entities and other details, are written to a file named after this UUID.

    Returns:
    - float: The evaluation score out of 1.
    """

    gold_entities, irrelevant_entities, wrong_type_entities = example.gold_entities, example.irrelevant_entities, example.wrong_type_entities

    predicted_entities = pred.entities

    # Generate a unique identifier
    evaluation_uuid = str(uuid.uuid4())
    print("Evaluation UUID:", evaluation_uuid)
    
    # Initialize score and log
    score = 1.0
    log = {"research_brief": example.relevant_entities_description,
           "predicted_entities": [entity.name for entity in predicted_entities], 
           "missing_entities": [],
           "wrong_type_entities": [],
           "irrelevant_entities": [],
           "unmatched_entities": []}

    # Convert entity lists to sets for easier comparison
    predicted_set = set(entity.name for entity in predicted_entities)
    gold_set = set(entity["name"] for entity in gold_entities)
    irrelevant_set = set(entity["name"] for entity in irrelevant_entities)
    wrong_type_set = set(entity["name"] for entity in wrong_type_entities)

    wrong_type_matches = predicted_set & wrong_type_set
    log["wrong_type_entities"] = list(wrong_type_matches)

    irrelevant_matches = predicted_set & irrelevant_set
    log["irrelevant_entities"] = list(irrelevant_matches)

    missing_entities = gold_set - predicted_set
    log["missing_entities"] = list(missing_entities)

    # Calculate penalties for missing entities
    missing_entities_penalty = 0.7 * (len(missing_entities) / len(gold_set))
    score -= min(missing_entities_penalty, 0.7)

    # Calculate penalties for wrong type entities
    if wrong_type_matches:
        wrong_type_penalty = 0.2 * (len(wrong_type_matches) / len(wrong_type_set))
        score -= min(wrong_type_penalty, 0.2)

    # Calculate penalties for irrelevant entities
    if irrelevant_matches:
        irrelevant_penalty = 0.1 * (len(irrelevant_matches) / len(irrelevant_set))
        score -= min(irrelevant_penalty, 0.1)
        
    # Identify predicted entities that aren't matched
    # – this may indicate an oversight in the training data, or entities named slightly differently
    unmatched_entities = predicted_set - (gold_set | irrelevant_set | wrong_type_set)
    log["unmatched_entities"] = list(unmatched_entities)

    # Write log to file named after the UUID
    log_file_path = f"log-{evaluation_uuid}.json"
    with open(log_file_path, "w") as log_file:
        json.dump(log, log_file, indent=2)

    print(f"Score for {evaluation_uuid}: {score}")
    
    return score