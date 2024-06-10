import dspy
from dspy.teleprompt import BootstrapFewShotWithRandomSearch
import json
import random
from pydantic import BaseModel, Field
from typing import List, Optional

# Define the types we will need to refer to in the DSPy program signature's input and output fields
class Fact(BaseModel):
    text: str = Field(description="""
                 The text containing the fact, which:
                  - must follow a consistent sentence structure, with a single subject, a single predicate and a single object
                  - must have the subject_entity as the singular subject of the fact, so must follow the format <subject_entity> <predicate> <object>"
                  - must be concise statements that are true based on the information provided in the text
                  - must be standalone, and not depend on any contextual information to make sense
                  - must not contain any pronouns, and refer to all entities by their provided "name"
                  - must not be lists or contain multiple pieces of information, each piece of information must be expressed as a standalone fact
                  - must not contain conjunctions or compound sentences, and therefore must not contain "and", "or", "but" or a comma (",")
                  - must not include prepositional phrases, these must be provided separately in the "prepositionalPhrases" argument
                  - must include full and complete units when specifying numeric data as the object of the fact
                      """)
    prepositionalPhrases: List[str] = Field(description="""
                    A list of prepositional phrases that provide additional context to the predicate in the fact. Predicate phrases:
                    - must not refer to other entities
                    - must not provide additional information about the subject or object themselves, only focus on the predicate
                    
                    Examples of prepositional phrases for the example fact "Company X acquired Company Y":
                    - "on January 1, 2022"
                    - "for $8.5 billion"
                    - "with a combination of cash and stock"
                                            """)
    objectEntityLocalId: Optional[str] = Field(description="The localId of the entity that is the object if the fact, if any. Facts don't need to have entities as their object", default = None)

class EntitySummary(BaseModel):
    localId: str = Field(description="The localId of the entity")
    name: str = Field(description="The name of the entity")

# Define the DSPy Signature, which represents the input -> output expectations of the program
class FactInferrer(dspy.Signature):
    """Infer facts about named entities from a piece of context, with a JSON response format"""
    
    context: str = dspy.InputField()
    # subject_entity: EntitySummary = dspy.InputField(description="The entity that must be the subject of the facts", format=dict)
    subject_entity: str = dspy.InputField(desc="The entity that must be the subject of the facts")
    # potentialObjectEntities: List[EntitySummary] = dspy.InputField(description="The entities that could be the object of the facts", required=False, format=list)

    facts = dspy.OutputField(desc=f"a JSON formatted array of Fact objects, each of which should confirm to the schema {Fact.model_json_schema()}.", format=list)
  
# Load the language model to use
gpt4o = dspy.OpenAI(model='gpt-4o', max_tokens=4_000, response_format={ "type": "json_object" })
dspy.settings.configure(lm=gpt4o)

with open("inputs.json") as f:
    input_data = json.load(f)

def cache_busting_config():
    return dict(temperature=0.7 + 0.0001 * random.uniform(-1, 1))

# predictor = dspy.Predict(FactInferrer, **cache_busting_config())

# pred = predictor(**input_data[4])

# print("Simple predictor answer:")
# print(f"{pred}")

# Program
cot = dspy.ChainOfThought(FactInferrer, **cache_busting_config())

# Module
class FactInferrerModule(dspy.Module):
    def __init__(self):
        super().__init__()
        self.signature = FactInferrer
        self.prog = cot
    
    def forward(self, **args):
        return self.prog(**args)

pred = cot(**input_data[4])

print("Chain of Thought answer:")
print(f"{pred}")

with open("examples.json") as f:
    examples = json.load(f)

trainset = [dspy.Example(**item).with_inputs("context", "subject_entity") for item in examples]

# Define the signature for automatic assessments.
class Assess(dspy.Signature):
    """Assess the quality of facts produced."""

    assessed_context = dspy.InputField()
    assessed_subject = dspy.InputField()

    facts = dspy.InputField(format=list)

    assessment_question = dspy.InputField()

    assessment_answer = dspy.OutputField(desc="The answer must start with the word 'Yes' or 'No', followed by a justification of the answer")

def check_facts_start_with_string(fact_json_string, expected_prefix):
    """
    Checks if each 'text' value in the JSON string starts with 'expected_prefix'.
    
    Parameters:
    fact_json_string (str): A JSON string representing a list of objects, each containing a 'text' entry.
    expected_prefix (str): The string that each 'text' value should start with.
    
    Returns:
    dict: A dictionary with 'assessment_answer' key having 'yes' or 'no' value.
    """
    print(f"Type of json_string: {type(fact_json_string)}")
    print(f"JSON string: {fact_json_string}")
    
    # Parse the JSON string into a Python list of dictionaries
    facts = json.loads(fact_json_string)
    
    # Iterate through each dictionary in the list
    for fact in facts:
        if not 'text' in fact:
            print(f"No fact text found in fact: {fact}")
            return { "assessment_answer": "no" }
        if not fact['text'].startswith(expected_prefix):
            print(f"Fact text '{fact['text']}' does not start with '{expected_prefix}'")
            return { "assessment_answer": "no" }
    
    print("Returning yes")
    return { "assessment_answer": "yes" }

def metric(example, pred, trace=None):
    context, subject_entity, facts = example.context, example.subject_entity, pred.facts

    faithful = "Does every entry in 'facts' appear in the assessed context?"
    complete = "Do the facts capture all information about the entity in the assessed context?"

    print(f"Type of facts: {type(facts)}")

    print (f"Subject: {subject_entity}\nFacts: {facts}\n")
    
    with dspy.context(lm=gpt4o):
        complete =  dspy.Predict(Assess)(assessed_context=context, assessed_subject=subject_entity, assessment_question=complete, facts=facts)
        faithful =  dspy.Predict(Assess)(assessed_context=context, assessed_subject=subject_entity, assessment_question=faithful, facts=facts)

    correct_prefix = check_facts_start_with_string(facts, subject_entity)

    print(f"Prefix answer: {correct_prefix}\nComplete answer: {complete}\nFaithful answer: {faithful}\n")

    correct_prefix, complete, faithful = [m.assessment_answer.lower().startswith("yes") for m in [correct_prefix, complete, faithful]]

    print(f"Prefix: {correct_prefix}, Complete: {complete}, Faithful: {faithful}")

    score = correct_prefix + complete + faithful

    print(f"Score: {score}")

    if trace is not None: return score >= 3
    return score / 3.0

# Set up the optimizer: we want to "bootstrap" (i.e., self-generate) 8-shot examples of your program's steps.
# The optimizer will repeat this 10 times (plus some initial attempts) before selecting its best attempt on the devset.
config = dict(max_bootstrapped_demos=6, max_labeled_demos=4, num_candidate_programs=10, num_threads=4)

teleprompter = BootstrapFewShotWithRandomSearch(metric=metric, **config)
optimized_program = teleprompter.compile(FactInferrerModule(), trainset=trainset)

optimized_program.save("optimized_program.json")