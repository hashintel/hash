import dspy

from definition import Fact
from llms import gpt4o

# Define the signature for automatic assessments.
class Assess(dspy.Signature):
    """Assess the quality of facts produced."""

    assessed_context = dspy.InputField()
    assessed_subject = dspy.InputField()

    facts = dspy.InputField(format=list)

    assessment_question = dspy.InputField()

    assessment_answer = dspy.OutputField(desc="Your reasoning in response to the question, ending with the word 'Yes' or 'No' to provide a final answer. No further characters or punctuation beyond the final 'yes' or 'no' are permitted. Do not repeat the provided inputs, just give your rationale followed by your answer.")

def check_facts_format(facts, expected_prefix):
    """
    Checks if facts is a list of Facts, and each 'text' value in each Fact starts with 'expected_prefix'.
    
    Parameters:
    facts List[Fact]: A list of Fact objects, each containing a 'text' attribute.
    expected_prefix (str): The string that each 'text' value should start with.
    
    Returns:
    dict: A dictionary with 'assessment_answer' key having 'yes' or 'no' value.
    """
    print(f"Type of facts: {type(facts)}")
    print(f"Facts: {facts}")

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

def metric(example, pred, trace=None):
    context, subject_entity, facts, gold_facts = example.context, example.subject_entity, pred.facts, example.facts

    faithful = "Does every entry in 'facts' appear in the assessed context? Look for the text in the context that supports each fact – you are cross-checking the facts. Your reasoning, followed by yes or no:"
    complete = f"Does the 'facts' list contain all of the following facts – they can be described differently, as long as the factual information is captured (e.g. values, names, units where relevant): {gold_facts}\n Your reasoning, followed by yes or no:"

    print(f"Type of facts: {type(facts)}")

    print (f"Subject: {subject_entity}\nFacts: {facts}\n")
    
    with dspy.context(lm=gpt4o):
        complete =  dspy.Predict(Assess)(assessed_context=context, assessed_subject=subject_entity, assessment_question=complete, facts=facts)
        faithful =  dspy.Predict(Assess)(assessed_context=context, assessed_subject=subject_entity, assessment_question=faithful, facts=facts)

    format = check_facts_format(facts, subject_entity)

    print(f"Format answer: {format}\nComplete answer: {complete}\nFaithful answer: {faithful}\n")

    complete, faithful = [m.assessment_answer.lower().endswith("yes") or m.assessment_answer.lower().endswith("yes.") for m in [complete, faithful]]
    format = format["assessment_answer"].lower().startswith("yes")

    print(f"Prefix: {format}, Complete: {complete}, Faithful: {faithful}")

    score = format + complete + faithful

    print(f"Score: {score}")

    if trace is not None: return score >= 3
    return score / 3.0