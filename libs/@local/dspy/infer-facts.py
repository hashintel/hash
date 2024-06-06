import dspy

gpt4o = dspy.OpenAI(model='gpt-4o', max_tokens=80_000)
dspy.settings.configure(lm=gpt4o)

class FactInferrer(dspy.Signature):
    """Infer facts about named entities from a piece of context"""
    
    context = dspy.InputField
    facts = dspy.OutputField
  