/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph"





export type AIChatBlock = Entity<AIChatBlockProperties>


export type AIChatBlockAIChatMessageLinks = { linkEntity: AIChatMessage; rightEntity: AIChatRequestV2 | AIChatResponseV2 }

export type AIChatBlockOutgoingLinkAndTarget = AIChatBlockAIChatMessageLinks | AIChatBlockRootAIChatRequestLinks

export type AIChatBlockOutgoingLinksByLinkEntityTypeId = { "http://localhost:3000/@alice/types/entity-type/ai-chat-message/v/1": AIChatBlockAIChatMessageLinks, "http://localhost:3000/@alice/types/entity-type/root-ai-chat-request/v/1": AIChatBlockRootAIChatRequestLinks }




/**
 * AI Chat Block
 */
export type AIChatBlockProperties = {
"http://localhost:3000/@alice/types/property-type/chat-ai-model/"?: ChatAIModelPropertyValue
"http://localhost:3000/@alice/types/property-type/preset-system-prompt-id/"?: PresetSystemPromptIDPropertyValue
}


export type AIChatBlockRootAIChatRequestLinks = { linkEntity: RootAIChatRequest; rightEntity: AIChatRequestV2 }


export type AIChatMessage = Entity<AIChatMessageProperties> & { linkData: LinkData }


export type AIChatMessageOutgoingLinkAndTarget = never

export type AIChatMessageOutgoingLinksByLinkEntityTypeId = {  }

/**
 * AI Chat Message
 */
export type AIChatMessageProperties = (AIChatMessageProperties1 & AIChatMessageProperties2)
export type AIChatMessageProperties1 = LinkProperties


export type AIChatMessageProperties2 = {

}



export type AIChatRequestV2 = Entity<AIChatRequestV2Properties>


export type AIChatRequestV2OutgoingLinkAndTarget = AIChatRequestV2ResponseLinks

export type AIChatRequestV2OutgoingLinksByLinkEntityTypeId = { "http://localhost:3000/@alice/types/entity-type/response/v/1": AIChatRequestV2ResponseLinks }




/**
 * AI Chat Request
 */
export type AIChatRequestV2Properties = {
"http://localhost:3000/@alice/types/property-type/message-content/"?: MessageContentPropertyValue
"http://localhost:3000/@alice/types/property-type/active/"?: ActivePropertyValue
}


export type AIChatRequestV2ResponseLinks = { linkEntity: Response; rightEntity: AIChatResponseV1 }


export type AIChatRequestV3 = Entity<AIChatRequestV3Properties>


export type AIChatRequestV3OutgoingLinkAndTarget = AIChatRequestV3ResponseLinks

export type AIChatRequestV3OutgoingLinksByLinkEntityTypeId = { "http://localhost:3000/@alice/types/entity-type/response/v/1": AIChatRequestV3ResponseLinks }




/**
 * AI Chat Request
 */
export type AIChatRequestV3Properties = {
"http://localhost:3000/@alice/types/property-type/message-content/"?: MessageContentPropertyValue
"http://localhost:3000/@alice/types/property-type/active/"?: ActivePropertyValue
}


export type AIChatRequestV3ResponseLinks = { linkEntity: Response; rightEntity: AIChatResponseV2 }


export type AIChatRequestV4 = Entity<AIChatRequestV4Properties>


export type AIChatRequestV4OutgoingLinkAndTarget = AIChatRequestV4ResponseLinks

export type AIChatRequestV4OutgoingLinksByLinkEntityTypeId = { "http://localhost:3000/@alice/types/entity-type/response/v/1": AIChatRequestV4ResponseLinks }




/**
 * AI Chat Request
 */
export type AIChatRequestV4Properties = {
"http://localhost:3000/@alice/types/property-type/message-content/": MessageContentPropertyValue
"http://localhost:3000/@alice/types/property-type/active/": ActivePropertyValue
}


export type AIChatRequestV4ResponseLinks = { linkEntity: Response; rightEntity: AIChatResponseV2 }


export type AIChatResponseV1 = Entity<AIChatResponseV1Properties>


export type AIChatResponseV1OutgoingLinkAndTarget = never

export type AIChatResponseV1OutgoingLinksByLinkEntityTypeId = {  }

/**
 * AI Chat Response
 */
export type AIChatResponseV1Properties = {

}



export type AIChatResponseV2 = Entity<AIChatResponseV2Properties>


export type AIChatResponseV2OutgoingLinkAndTarget = AIChatResponseV2RequestLinks

export type AIChatResponseV2OutgoingLinksByLinkEntityTypeId = { "http://localhost:3000/@alice/types/entity-type/request/v/1": AIChatResponseV2RequestLinks }




/**
 * AI Chat Response
 */
export type AIChatResponseV2Properties = {
"http://localhost:3000/@alice/types/property-type/message-content/"?: MessageContentPropertyValue
"http://localhost:3000/@alice/types/property-type/active/"?: ActivePropertyValue
}


export type AIChatResponseV2RequestLinks = { linkEntity: Request; rightEntity: AIChatRequestV2 }


export type AIChatResponseV4 = Entity<AIChatResponseV4Properties>


export type AIChatResponseV4OutgoingLinkAndTarget = AIChatResponseV4RequestLinks

export type AIChatResponseV4OutgoingLinksByLinkEntityTypeId = { "http://localhost:3000/@alice/types/entity-type/request/v/1": AIChatResponseV4RequestLinks }




/**
 * AI Chat Response
 */
export type AIChatResponseV4Properties = {
"http://localhost:3000/@alice/types/property-type/message-content/": MessageContentPropertyValue
"http://localhost:3000/@alice/types/property-type/active/": ActivePropertyValue
}


export type AIChatResponseV4RequestLinks = { linkEntity: Request; rightEntity: AIChatRequestV3 }

/**
 * Active
 */
export type ActivePropertyValue = Boolean




export type BlockEntity = AIChatBlock



export type BlockEntityOutgoingLinkAndTarget = AIChatBlockOutgoingLinkAndTarget


/**
 * A True or False value
 */
export type Boolean = boolean


/**
 * A Chat AI Model
 */
export type ChatAIModelPropertyValue = Text




export type Link = Entity<LinkProperties>


export type LinkOutgoingLinkAndTarget = never

export type LinkOutgoingLinksByLinkEntityTypeId = {  }

export type LinkProperties = {

}


/**
 * Message Content
 */
export type MessageContentPropertyValue = Text



/**
 * Preset System Prompt ID
 */
export type PresetSystemPromptIDPropertyValue = Text




export type Request = Entity<RequestProperties> & { linkData: LinkData }


export type RequestOutgoingLinkAndTarget = never

export type RequestOutgoingLinksByLinkEntityTypeId = {  }

/**
 * Request
 */
export type RequestProperties = (RequestProperties1 & RequestProperties2)
export type RequestProperties1 = LinkProperties


export type RequestProperties2 = {

}



export type Response = Entity<ResponseProperties> & { linkData: LinkData }


export type ResponseOutgoingLinkAndTarget = never

export type ResponseOutgoingLinksByLinkEntityTypeId = {  }

/**
 * Response
 */
export type ResponseProperties = (ResponseProperties1 & ResponseProperties2)
export type ResponseProperties1 = LinkProperties


export type ResponseProperties2 = {

}



export type RootAIChatRequest = Entity<RootAIChatRequestProperties> & { linkData: LinkData }


export type RootAIChatRequestOutgoingLinkAndTarget = never

export type RootAIChatRequestOutgoingLinksByLinkEntityTypeId = {  }

/**
 * Root AI Chat Request
 */
export type RootAIChatRequestProperties = (RootAIChatRequestProperties1 & RootAIChatRequestProperties2)
export type RootAIChatRequestProperties1 = LinkProperties


export type RootAIChatRequestProperties2 = {

}


/**
 * An ordered sequence of characters
 */
export type Text = string

