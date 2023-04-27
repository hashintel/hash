import structlog.stdlib
from beartype import beartype
from .io_types import Input, Output, OutputMessage, TypeEnum, Message
from langchain.chat_models import ChatOpenAI
from langchain.callbacks.base import CallbackManager
from langchain.callbacks.streaming_stdout import StreamingStdOutCallbackHandler
from langchain.schema import HumanMessage, SystemMessage, AIMessage

logger = structlog.stdlib.get_logger(__name__)

def mapInputMessagesToOutputMessages(message):
    return OutputMessage(type=message.type, content=message.content)
    
def mapInputMessagesToMessagePrompts(message):
    if message.type == TypeEnum.AI_MESSAGE:
        return AIMessage(content=message.content)
    if message.type == TypeEnum.HUMAN_MESSAGE:
        return HumanMessage(content=message.content)

@beartype
def main(input: Input) -> Output:
    """
    Main function of the agent
    :param agent_input: Input defined in `io_types.ts`
    :return: Output defined in `io_types.ts`
    """

    systemPrompts = [SystemMessage(content="You are ChatGPT, a large language model trained by OpenAI."), 
                SystemMessage(content="Answer as concisely as possible with react code only."),
                SystemMessage(content="Do NOT include an explanation or any text that is not part of the code block you are generating."),
                SystemMessage(content="Return code blocks as ```jsx\n{code...}\n```."),
                SystemMessage(content="Use the 'sx' prop to style MUI elements. For example, a button with a purple background should be <Button sx={{\"background: \"purple\"}} />."),
                SystemMessage(content="Generate a react component using MUI components."),
                SystemMessage(content="Return the list of dependencies that should be installed in the react project as an array. For example if '@mui/material' and 'axios' should be installed you should return `Dependencies: ['@mui/material', 'axios']`."),
                SystemMessage(content="Dependencies should be included after closing the code block. The message you return should have the following format: ```jsx\n{code...}\n```\nDependencies: [{dependency1}, {dependency2}, ...].")]
    
    chat = ChatOpenAI(model="gpt-3.5-turbo", streaming=True, callback_manager=CallbackManager([StreamingStdOutCallbackHandler()]), verbose=True, temperature=0)
    prompts = systemPrompts + list(map(mapInputMessagesToMessagePrompts, input.messages))
    response = chat(prompts)
    return Output(messages=list(map(mapInputMessagesToOutputMessages, input.messages)) + [OutputMessage(type=TypeEnum.AI_MESSAGE, content=response.content)])

if __name__ == "HASH":
    """This is used when running the agent from the server or the agent orchestrator"""
    # `IN` and `OUT` are defined by the agent orchestrator
    global IN, OUT
    OUT = main(IN)

if __name__ == "__main__":
    """This is used when running the agent from the command line"""
    from ... import setup

    setup("dev")
    
    print("Describe your application:")
    IN = input("")
    message = Message(type=TypeEnum.HUMAN_MESSAGE, content=IN)
    output = main((Input(messages=[message])))

    while(True):
        print("Anything else?")
        IN = input("")
        output = main(Input(messages=output.messages + [Message(type=TypeEnum.HUMAN_MESSAGE, content=IN)]))
