from langchain import  PromptTemplate, OpenAI, LLMChain
from langchain.chat_models import ChatOpenAI
from .io_types import *


def main(input: Input) -> Output:
    """
    Main function of the agent
    :param agent_input: Input defined in `io_types.ts`
    :return: Output defined in `io_types.ts`
    """

    template = """Generate the following react component using MUI components: {user_prompt}."""
    prompt = PromptTemplate(template=template, input_variables=["user_prompt"])
    llm_chain = LLMChain(prompt=prompt, llm=OpenAI(model_name="gpt-3.5-turbo", temperature=0), verbose=True)
    result = llm_chain.predict(user_prompt=input.user_prompt)
    return Output(result=result)


if __name__ == "HASH":
    """This is used when running the agent from the server or the agent orchestrator"""

    # `IN` and `OUT` are defined by the agent orchestrator
    global IN, OUT
    OUT = main(IN)

if __name__ == "__main__":
    """This is used when running the agent from the command line"""
    from ... import setup
    from logging import getLogger

    setup()
    print("Describe your application:")
    IN = input("")
    output = main((Input(user_prompt=IN)))
    print(output.result)
    getLogger().info(f"output: {output.result}")
