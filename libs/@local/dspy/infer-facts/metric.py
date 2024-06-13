import dspy
import re

from definition import Fact
from llms import gpt4o

# Define the signature for automatic assessments.
class Assess(dspy.Signature):
    """Assess the quality of facts produced."""

    assessed_context = dspy.InputField()
    assessed_subject = dspy.InputField()
    potential_object_entities = dspy.InputField(format=list)

    facts = dspy.InputField(format=list)

    assessment_question = dspy.InputField()

    assessment_answer = dspy.OutputField(desc="Your reasoning in response to the question, ending with a score between 0 and 1 based on the question's criteria. No further characters or punctuation beyond the final number are permitted. Do not repeat the provided inputs, just give your rationale followed by your score.")

def check_facts_format(facts, expected_prefix):
    """
    Checks if facts is a list of Facts, and each 'text' value in each Fact starts with 'expected_prefix'.
    
    Parameters:
    facts List[Fact]: A list of Fact objects, each containing a 'text' attribute.
    expected_prefix (str): The string that each 'text' value should start with.
    
    Returns:
    dict: A dictionary with 'assessment_answer' key having 'yes' or 'no' value.
    """

    if (not isinstance(facts, list)):
        print(f"Facts is not a list: {facts}")
        return { "assessment_answer": "no, facts is not a list" }
    
    # Iterate through each Fact in the list
    for fact in facts:
        if not isinstance(fact, Fact):
            print(f"Fact is not a Fact: {fact}")
            return { "assessment_answer": "no, fact is not a Fact" }
        if not hasattr(fact, "text"):
            print(f"No fact text found in fact: {fact}")
            return { "assessment_answer": "no, no fact text found" }
        if not fact.text.startswith(expected_prefix):
            print(f"Fact text '{fact.text}' does not start with '{expected_prefix}'")
            return { "assessment_answer": "no, does not start with subject" }
    
    print("Returning yes")
    return { "assessment_answer": "yes" }


def extract_number(answer):
    # Remove trailing period
    cleaned_answer = answer.rstrip('.')
    # Extract the number (integer or float)
    match = re.search(r'(\d+(\.\d+)?)$', cleaned_answer)
    if match:
        return float(match.group(1))
    else:
        return None
    
def metric(example, pred, trace=None):
    context, subject_entity, potential_object_entities, facts, gold_facts = example.context, example.subject_entity, example.potential_object_entities, pred.facts, example.facts

    faithful = "Does every entry in 'facts' appear in the assessed context? Look for the text in the context that supports each fact – you are cross-checking the facts. Your reasoning, followed by 1 if all facts appear, or 0 if some do not:"
    complete = f"Does the 'facts' list contain all of the following facts – they can be described differently, as long as the factual information is captured (e.g. values, names, units where relevant): {gold_facts}\n Your reasoning, followed by a score between 0 (if none are present) and 1 (if all are present in some form):"
    subjects = f"If any of the provided potential_object_entities (if defined) are present, are they correctly identified as the object of the fact, with no other objects mentioned in the fact? Your reasoning, followed by a score between 0 (if no subjects are correct, or if other subjects appear in the facts) and 1 (if all subjects are correctly identified, and are the only subject in the fact):"
    schema = f"Do all facts conform to the schema {Fact.model_json_schema()}? Your reasoning, followed by a score between 0 (none correct) and 1 (all correct):"
    
    with dspy.context(lm=gpt4o):
        complete =  dspy.Predict(Assess)(assessed_context=context, assessed_subject=subject_entity, potential_object_entities=potential_object_entities, assessment_question=complete, facts=facts)
        faithful =  dspy.Predict(Assess)(assessed_context=context, assessed_subject=subject_entity, potential_object_entities=potential_object_entities, assessment_question=faithful, facts=facts)
        subjects =  dspy.Predict(Assess)(assessed_context=context, assessed_subject=subject_entity, potential_object_entities=potential_object_entities, assessment_question=subjects, facts=facts)
        schema = dspy.Predict(Assess)(assessed_context=context, assessed_subject=subject_entity, potential_object_entities=potential_object_entities, assessment_question=schema, facts=facts)

    format = check_facts_format(facts, subject_entity)

    print(f"Format answer: {format}\nComplete answer: {complete}\nFaithful answer: {faithful}\nSubjects answer: {subjects}\nSchema answer: {schema}")
    format = format["assessment_answer"].lower().startswith("yes")

    complete, faithful, subjects, schema = [extract_number(m.assessment_answer) for m in [complete, faithful, subjects, schema]]

    # weight the complete score more heavily
    complete = complete * 2

    print(f"Prefix: {format}, Complete: {complete}, Faithful: {faithful}, Subjects: {subjects}, Schema: {schema}")

    score = format + complete + faithful + subjects + schema

    if trace is not None: return score >= 6

    score = score / 6.0

    print(f"Score: {score}")

    return score