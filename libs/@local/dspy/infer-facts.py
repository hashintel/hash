import dspy
from dspy.teleprompt import BootstrapFewShotWithRandomSearch
import json
import random
from pydantic import BaseModel, Field
from typing import List, Optional

# Define the types we will need to refer to in the DSPy program signature's input and output fields
class Fact(BaseModel):
    text: str = Field(description="A single fact expressed as a [subject] [predicate] [object] sentence")
    prepositionalPhrases: List[str] = Field(description="A list of prepositional phrases that provide additional context to the predicate in the fact")
    objectEntityLocalId: Optional[str] = Field(description="The localId of the entity that is the object if the fact, if any. Facts don't need to have entities as their object", default = None)

class EntitySummary(BaseModel):
    localId: str = Field(description="The localId of the entity")
    name: str = Field(description="The name of the entity")

# Define the DSPy Signature, which represents the input -> output expectations of the program
class FactInferrer(dspy.Signature):
    """Infer facts about named entities from a piece of context"""
    
    context: str = dspy.InputField()
    # subjectEntity: EntitySummary = dspy.InputField(description="The entity that must be the subject of the facts", format=dict)
    subjectEntity: str = dspy.InputField(desc="The entity that must be the subject of the facts")
    # potentialObjectEntities: List[EntitySummary] = dspy.InputField(description="The entities that could be the object of the facts", required=False, format=list)

    facts = dspy.OutputField(desc=f"a list of Fact objects, each of which should confirm to the schema {Fact.model_json_schema()}", format=list)
  
# Load the language model to use
gpt4o = dspy.OpenAI(model='gpt-4o', max_tokens=4_000)
dspy.settings.configure(lm=gpt4o)

with open("inputs.json") as f:
    input_data = json.load(f)

def cache_busting_config():
    return dict(temperature=0.7 + 0.0001 * random.uniform(-1, 1))

# predictor = dspy.Predict(FactInferrer, **cache_busting_config())

# pred = predictor(**input_data[1])

# print("Simple predictor answer:")
# print(f"{pred.facts}")

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

pred = cot(**input_data[1])

print("Chain of Thought answer:")
print(f"{pred}")

with open("examples.json") as f:
    examples = json.load(f)

trainset = [dspy.Example(**item).with_inputs("context", "subjectEntity") for item in examples]

# Define the signature for automatic assessments.
class Assess(dspy.Signature):
    """Assess the quality of facts produced."""

    assessed_context = dspy.InputField()
    assessed_subject = dspy.InputField()

    facts = dspy.InputField(format=list)

    assessment_question = dspy.InputField()

    assessment_answer = dspy.OutputField(desc="Yes or No")

def metric(example, pred, trace=None):
    context, subjectEntity, facts = example.context, example.subjectEntity, pred.facts

    format = f"Does the text for every entry in facts begin with '${subjectEntity}'?"
    singular = "Does the text for every entry in facts describe one subject, one predicate, and one object?"
    faithful = f"Does every fact appear in the assessed context?"

    print (f"Subject: {subjectEntity}, Facts: {facts}, Context: {context}")
    
    with dspy.context(lm=gpt4o):
        format =  dspy.Predict(Assess)(assessed_context=context, assessed_subject=subjectEntity, assessment_question=format, facts=facts)
        singular =  dspy.Predict(Assess)(assessed_context=context, assessed_subject=subjectEntity, assessment_question=singular, facts=facts)
        faithful =  dspy.Predict(Assess)(assessed_context=context, assessed_subject=subjectEntity, assessment_question=faithful, facts=facts)

    print(f"Format answer: {format.assessment_answer}, Singular answer: {singular.assessment_answer}, Faithful answer: {faithful.assessment_answer}")

    format, singular, faithful = [m.assessment_answer.lower() == 'yes' for m in [format, singular, faithful]]

    print(f"Format: {format}, Singular: {singular}, Faithful: {faithful}")

    score = format + singular + faithful

    print(f"Score: {score}")

    if trace is not None: return score >= 3
    return score / 3.0

# Set up the optimizer: we want to "bootstrap" (i.e., self-generate) 8-shot examples of your program's steps.
# The optimizer will repeat this 10 times (plus some initial attempts) before selecting its best attempt on the devset.
config = dict(max_bootstrapped_demos=4, max_labeled_demos=4, num_candidate_programs=6, num_threads=4)

teleprompter = BootstrapFewShotWithRandomSearch(metric=metric, **config)
optimized_program = teleprompter.compile(FactInferrerModule(), trainset=trainset)

optimized_program.save("optimized_program.json")