Speaker 1: Got it. I'm going to start.
Lu Nelson (You): So we'll— should we wait for Dora to join?
Speaker 1: Yeah, of course.
Lu Nelson (You): I'll just try and frame: Dora and I talked yesterday, I guess, and what we talked about was, well, the challenge that we face right now if— given that there's a goal to demo something in September with a flow of elicitation, so an eliciting agent that would actually elicit a model for a cyber-physical system.
Lu Nelson (You): And I think there's scraps of this description that are living in different documents and linear issues and stuff like that at this point, but basically, in its most maximalist version, it's like, let's have a demo that shows in which a domain expert basically is interviewed by an agent and a model is elicited, which, like, showcases all the way up to the SD-CPN level of complexity of a cyber-physical model.
Lu Nelson (You): And so defining that is— Request a record to the cloud. Sure.
Speaker 3: Sorry, I'm just requesting so we—
Speaker 4: Recording in progress.
Lu Nelson (You): That's cool. So yeah, so I think then that makes— that gives me just a lot of questions, because in order for, broadly speaking, in order for an eliciting agent to do this job specifically, it doesn't need a checklist or a questionnaire.
Lu Nelson (You): It really actually needs strategies and policies. Like, it needs— it needs strategies, heuristics, policies, things to check, things to look for, how to respond to certain kinds of questions, an ordering of— a kind of strategic ordering of questions in order to let answers inform subsequent questions, this kind of thing.
Lu Nelson (You): So that's kind of why I want to talk to you, because I wanted to sort of see if I could just take a shot at asking you how you would do it.
Lu Nelson (You): If you were trying to model a situation, a system, a process, how do you go about asking questions, let's say, of a domain expert? Where do you start?
Lu Nelson (You): What kinds of questions do you ask? And so on.
Yannis Zachos: Yeah. Before I kind of start answering, I guess I just want to understand a little bit what's the— because I guess there's already an AI assistant within PetriKnot that is kind of doing what you're describing.
Lu Nelson (You): Well, yes and no, because it's— because what it's doing is it's asking you directly for a PetriKnot model, which assumes that you— to some extent, it collapses some of those steps, because it says— it kind of expects you to understand some of the implications of what you might be asking for, or like, why you would ask for a PetriKnot in the first place. I think the point is rather to wind this back a couple of degrees to a point where we're— before we talk about PetriKnots or
Lu Nelson (You): we introduce the PetriKnot as the way to model this thing dynamically and to visualize it dynamically, we're trying to build a— we're just saying we're trying to model this system. So we're trying to capture, essentially, what are all the things we need to know about this system, and then we will project that into a PetriKnot or with some combination of— maybe that can be done in some combination of deterministic and non-deterministic ways to interpret kind of a thorough elicited description of a dynamic system and then
Lu Nelson (You): project that into a PetriKnot. But going directly to a PetriKnot, you have an agent who basically knows about PetriKnots but doesn't necessarily know about any of the— any of the kind of requirements, conditions, or, like, constraints and so on of creating a good model of a cyber-physical system.
Lu Nelson (You): It doesn't know anything about that. It knows— it knows something as training data about PetriKnots, so if you tell it what you want to model, it can maybe generate a reasonable representation of that in terms of places and transitions and so on.
Lu Nelson (You): But it doesn't necessarily know anything about how to effectively elicit and capture a description of a cyber-physical system.
Lu Nelson (You): The PetriKnot projection is a second-degree step, or it's like a later step.
Yannis Zachos: I see.
Yannis Zachos: Okay, yeah, I mean, I'm just trying to envision, you know, what would, like, that elicited specification include that would not be part of the PetriKnot. So what would be the output of the first step of the elicitation agent that, I guess, would then be passed on in a second step to either the existing AI assistant or maybe the existing elicitation agent is going to take care of the entire flow of going from description of a cyber-physical system from, yeah, elicit— so first step, elicitation of a
Yannis Zachos: cyber-physical system, and then representation of that cyber-physical system as the PetriKnot. So I'm just trying to figure out what's the output in the first step that would not fit into the— would not fit into the PetriKnot description of it.
Yannis Zachos: Like, what would not be reflected on the PetriKnot but we would need to elicit in any case.
Lu Nelson (You): Right.
Yannis Zachos: So, I mean, you mentioned constraints and all that, but yeah, I don't know, it's a bit abstract at the moment that I'm struggling to kind of understand exactly what that would look like. I don't know if you have any specific examples in mind that might shed some light on this.
Lu Nelson (You): Let's see. One of the examples that is kind of— and this is sort of called out in the sales document, I believe, is the idea of the sort of decision layer. Like, basically, decision policies are not— it notes this as a gap, that there's an open question whether policies belong in the net or whether some kind of separate policy annotation or object would have to be created.
Lu Nelson (You): So, like, policies in transitions that decide when two transitions want to do the same thing, or like, they want access to the same thing, then there's, like, there's a policy layer required, which currently doesn't have a representation in the net.
Lu Nelson (You): And I think there's a series of other— there's probably a series of other things. Like, what did I come up with here?
Lu Nelson (You): Penalty weights, goals, rationale, unwritten constraints, validation criteria. These are all things that you want to capture in an interview and you want to capture in some type of intermediate representation, but they don't necessarily have a canonical place to live in the PetriKnot.
Lu Nelson (You): Thus, I see PetriKnots more as a projection of an intermediate representation, which remains to be designed. You know, I don't know what that representation contains, but I think figuring out what the schema of that looks like is part of the task that we're facing.
Lu Nelson (You): So one of them is, like, how do you describe to the agent how it should go about doing this, and then also how do you describe what's the output shape that the agent needs to fulfill? It actually needs both of those things.
Yannis Zachos: Yeah, I see. Yeah, yes, I mean, it's always, I think, just having that Petri— so the end goal of producing a PetriKnot in mind, I guess, might be really good for grounding the agent in any case, even in the first elicitation step.
Lu Nelson (You): Yeah.
Yannis Zachos: Because I think it's just going to make things concrete in any case. I think one of the things that I would see as something that's not currently represented on a PetriKnot and is useful and actually hopefully will be represented on a PetriKnot eventually are these kind of business constraints where you're kind of trying to elicit, you know, so on the cyber— on the physical, this would be— I mean, I guess on the physical constraints, physical constraints tend to be differential equations, which are already represented in place
Yannis Zachos: dynamics.
Yannis Zachos: So it might be something like a conservation law, like number of tokens in equals number of tokens out, or it might be— actually, that's not a tech— technically, that's not being represented in the dynamics equation, but it can be something like conservation of momentum, you know, classical physical laws. So that's definitely something.
Yannis Zachos: But again, that would also fit into the place dynamics. So any other physical constraints?
Yannis Zachos: I think there are— there is a subset of physical constraints that are not represented on the PetriKnot. I think one of them is token conservation, that, you know, whatever this transition— I mean, I'm referring to these examples with the— I'm referring to PetriKnots to explain these examples because I think it's a bit easier, but obviously we can just think of a way to abstract away from PetriKnots.
Yannis Zachos: But yeah, so basically, like, a transition would produce the same amount of tokens as it consumed, always, which is something that refers to the construction of the PetriKnot and specifically the Arc weights. So that's definitely something like that.
Yannis Zachos: So the— yeah, just going back to constraints, mostly the physical are the ones that I mentioned. So differential equations and other types of physical laws, usually equation-based.
Yannis Zachos: So most of that is going to be equation-based. The cyber stuff, I think this is where you open up the allowable set of constraints to be a bit more abstract in the sense that they kind of need to encode this business logic.
Yannis Zachos: Business logic meaning that it's— I see business logic as a bit of an abstraction to— that's not— like, business logic captures certain components, perhaps, of a PetriKnot, but that's not— it's not necessarily represented well within a PetriKnot, and it's something that you want to elicit.
Yannis Zachos: Examples of business constraints, I guess, can be— might be, like, internal— might be, like, kind of regulations, perhaps, that would prohibit certain sort of behaviors to be simulated.
Yannis Zachos: So we wouldn't want to be simulate— we wouldn't want to simulate behaviors that are strictly prohibited.
Yannis Zachos: So that's one set of constraints, or regulatory constraints, really. That's the kind of business logic there.
Yannis Zachos: Trying to envision what else would be part of that.
Yannis Zachos: So other types of constraints.
Yannis Zachos: I mean, there might be just— so that's something that we kind of, like, that's the point with Clarion as well, that, you know, there's always the shoes and manuals of how to do processes was the kind of status— you know, modus operandi of things. So there's one thing you could capture, which is not technically a constraint, I guess.
Yannis Zachos: It's more like the theoretical execution of a process.
Lu Nelson (You): I think that's kind of— that's kind of in the zone of what I meant by policies, you know?
Yannis Zachos: Right.
Lu Nelson (You): Like, I think that there are sort of operational— in lots of situations, you're likely to have kind of operational policies, which are maybe just— they range anywhere from local, socially established conventions, almost, to things that might be defined by strict regulations or some kind of strict rules that's just inherited by the situation, or any number of other things, but basically that don't have— that don't have some way of living in the net but might dictate that the net has to be constructed in a certain way, or
Lu Nelson (You): that you basically have to add some logic to the simulation, some kind of arbitrary logic in some way to dictate, like, what happens under these certain special conditions that doesn't have a standard way of being expressed in the STCPN.
Lu Nelson (You): I don't know.
Yannis Zachos: Yeah, I think— sorry, I'm not— I was just going to say that maybe the way I'm envisioning this is, like, you have the theoretical PetriKnot and the actual PetriKnot. Like, theoretically, what you should be doing based on the brochure and the manuals and the policies, and the actual, which is what you're actually doing, you're observing through event logs.
Lu Nelson (You): Yeah.
Yannis Zachos: And it ends up being almost like you have a compliance application use case where you're saying, like, this is what should be happening based on your manuals, and this is what's actually happening based on your event logs.
Yannis Zachos: I think that would be something that's useful. Other things that I think would be useful are data feeds, kind of, because a lot of— I mean, if we're going to go too overweight to deploying this— by the way, sorry, I interrupted you.
Yannis Zachos: I don't know if you wanted to add something on top of—
Lu Nelson (You): Well, I wanted to say, we— I set the meeting only for half an hour, and I didn't know— I don't know if either of you have more time than that, but it's— as I prepared it, I realized quite quickly that I think the discussion could go for a lot longer than half an hour. So I want to see maybe how— if we want to contain this to half an hour, then I want to maybe just try to throw a few questions at you and see how you
Lu Nelson (You): sort of would answer those, because they're helpful to me. So shall we do it that way, or do you want to try?
Yannis Zachos: Yeah, yeah, no, no, no. It's best to— yeah, yeah, yeah, let's stick to that, and then we can always— I mean, and I just want to make sure that this is also useful for generating PetriKnot use cases for DORAS's benefit as well, right? Because I think there's some things that we should elicit potentially, like kinds of questions we should be asking to a PetriKnot that, you know, might be feeding into what an agent will be eliciting.
Yannis Zachos: So the— so like the constraints that we were talking about is something that should be elicited, and also that's something that when we do build a use case for a PetriKnot, like a specific example of a PetriKnot, we should kind of note down these questions that, you know, the PetriKnot should ask, should answer, actually, by simulating.
Lu Nelson (You): Yeah.
Yannis Zachos: Yeah. Just want to make sure that this is also to DORAS's benefit as well. Yeah, please go through the questions that you have.
Lu Nelson (You): Yeah, so I have— I have too many questions, but let me— let me ask a few. I won't— let me see. I will skip these ones.
Lu Nelson (You): Let me just clarify. Do you— have you modeled— have you modeled systems by, like, just by basically talking to somebody from the domain, or, like, what do you typically— what are the inputs you've used in the past in order to sort of build a model of something?
Yannis Zachos: Yeah, I mean, that's a good question because it's a very undocumented process. I mean, typically, in my PhD, what I've done is I usually do a literature review of what's the state-of-the-art representation of a system.
Yannis Zachos: So if I'm modeling, say, traffic, I'd be looking into traffic simulators, for example. Like, you have microscopic, macroscopic, so there's different kind of levels of granularity.
Lu Nelson (You): Right.
Yannis Zachos: So my approach there would be do a literature review. So I guess what the agent would do, perhaps equivalently, if I were to replicate this, would be to do a web crawl of papers, perhaps, on things, because I think.
Lu Nelson (You): Well, we could— we certainly could include that as part of the process, but I think the thing we're— the thing we're really aiming for is a process where a human is at the center of it. So the use case is like— and it's not— this is one that we want to demonstrate is like a cyber-physical, so on, but it applies to a lot of different things that you might want to model. Like, we're also trying— I'm also trying to build this in a way that can
Lu Nelson (You): be generalized. So STCPNs and cyber-physical systems is like a plug-in to this system, right?
Lu Nelson (You): Like, so it's going to describe a lot about, like, what are the specific kinds of things we need to find out, and in what way should we go about finding those things out, and what are the things we definitely have to fulfill as, like, our output to this. And— but that plugs into a system which just generally also has capabilities for understanding how to, like— for pursuing some different strategies of interviewing humans, like setting up questions and trying to sort of order questions by leverage, or— it's
Lu Nelson (You): very— it's all kinds of different things, but basically try to work towards some kind of elicitation goal. So if it's human-oriented, like, let's say— and this is maybe, therefore, not a very fitting thing, but you're modeling some type of production plant, you're talking directly to the master scheduler of the plant, what are the first five questions you ask? Like, what are the— what are the first things you're going to— you're going to probe to try to figure out the shape of this system?
Yannis Zachos: I think the way that I would approach it, if I were to formalize it, would be kind of like trying to generate almost what, I guess, the unstructured and structured ingestion would do for, like— so try to build a knowledge graph of everything.
Lu Nelson (You): Yeah.
Yannis Zachos: Understand entities and connections between entities, and then just have a— like, have a symbolic representation of how these things are connected. So just build a knowledge graph, essentially. So the questions for doing that, I guess, it's almost a bit difficult to ask a practitioner because it's— if the level of abstraction is really high, then it's very difficult to reason— for them to reason, I'd say, I would argue, because I think.
Lu Nelson (You): Yeah, yeah, yeah. No, that's absolutely one of the central challenges of this thing, is, like, how do you— how do you— how do you make a— how do you figure out how to approach people who are not— they're not acquainted with the terminology around PetriKnots or mathematically modeling their system, or in terms of mathematical or logical formalisms, they're not doing any of that. They just know how to run the system.
Lu Nelson (You): They know— they know what the policies are. They know what the analyses are that they usually do.
Lu Nelson (You): Like your document says, like, they've got a spreadsheet and they've got a— they've got a playbook that sort of tells them what to do, right? Like, that's how they know their system.
Lu Nelson (You): So how do you— so what kind of questions do you ask to this person?
Yannis Zachos: I would say— okay, so I would say I would give them first context of, like, let's say this is a production planner, and they obviously might be working on different tasks, but there's a task that's related, perhaps, to, I don't know, a choice of production of planning parameters.
Yannis Zachos: So I would say, describe to me your workflow of— that involves, like, describe to me the workflow for choosing planning parameters.
Yannis Zachos: They're the ones that are choosing the parameters, for example. Let's assume that they are so that we can make this concrete.
Yannis Zachos: So describe your workflow in steps. And then what I would try to do is they give me back some feedback— they give me back some series of steps, and then I kind of— we have this back and forth and reiteratively refine— iteratively refine the description that I'm eliciting under the hood.
Lu Nelson (You): Yeah.
Yannis Zachos: So there's an abstract one, then ideally there's a confidence score behind each part of the workflow, and then I say, okay, for the part of the workflow that is— that has really high— low confidence, ask questions there. Can you please elaborate on this part?
Lu Nelson (You): Right.
Yannis Zachos: Obviously, there comes a point where— where do you stop asking questions, really? And what's the maximally— like, what's the— I guess, the minimum set of questions you need to answer— to ask to get a meaningful representation without tiring the user? Because I guess, since we want this to be human-driven, we want to be mindful of user experience, so.
Lu Nelson (You): True enough.
Yannis Zachos: Yeah, so.
Lu Nelson (You): Also a challenge in itself.
Yannis Zachos: Yeah.
Lu Nelson (You): Yeah.
Yannis Zachos: Yeah.
Lu Nelson (You): We run into that one before too.
Yannis Zachos: So I guess, also, I think what we need to— so apart from giving— so I think initially, when you give context to the person, we should give context not only as to, like, what's the workflow that we're interested in, but also what is the end goal? Like, what are we trying to achieve here? Like, okay, obviously— I mean, for us, we just want to understand what— basically how they work and what rules they follow and what is their thinking strategy behind something.
Lu Nelson (You): Right. And under the hood, we want to identify all the moving parts, and we want to start to map them to our formalisms, right?
Yannis Zachos: Yeah.
Lu Nelson (You): So we want to start to have a sense of, like, what are the places that are involved here? What are the— what are the things that are going to become places? What's going to become transitions?
Lu Nelson (You): What's going to become tokens and token types? Where are those things maybe dynamic?
Lu Nelson (You): Where are those things stochastic, et cetera, et cetera? Like, where are we going to— where are we going to introdu— where do we see the dynamism?
Lu Nelson (You): Where are we going to introduce stochastics and that kind of stuff? Like, this is the thing.
Lu Nelson (You): So we're trying to map those things without confusing them with those terminologies, necessarily.
Yannis Zachos: And I think— yeah, so with regards to that as well, I think the context that we initially provide, which is, like, so far I've just talked about how do you do— how do you choose planning parameters. I would say also, ideally, we either have a set of— an idea of what success is, or we ask them to define success, and then based on— like, obviously, they want to succeed in their job, so we would say something like, okay, how do you succeed in doing this thing? So
Yannis Zachos: just prompting them in directions where they need to formalize their thinking process for how they go about doing things. And then— but I don't know— but I don't know if that's going to be something that we would need to know a priori and provide as initial context in the— before we ask the first question, or if it's something that we would need to elicit as well. Ideally, I think if we can sort of have a very good first prompt that contextualizes as best as possible and specific
Yannis Zachos: — like, makes the question— the line of questioning quite specific, I think that would be great. I don't know how this would go about. We'd probably need some brochures or something that— or at least, like, the organizational chart, right, to understand where this person fits within the company.
Lu Nelson (You): Oh, yeah. Oh, yeah, right. Even information about the person that's being spoken to could be interesting.
Yannis Zachos: Yeah.
Lu Nelson (You): Yeah, of course.
Yannis Zachos: So something to ground the conversation, because obviously we want to do that. Like, we— obviously we want to squeeze the most out of what we've got without asking questions, and then it's more about squeezing the rest out of the person, so.
Lu Nelson (You): Yeah.
Yannis Zachos: Yeah, so I think it's just questions like, how do you make sure you're successful in this? Are you blocked by any other processes or any other people? So we'd give us.
Lu Nelson (You): One strategy is, like, you can also ask them, can you describe a bad day? Like, can you describe when this goes badly? Can you describe either— either, like, a specific bad day that ever happened to you or that you ever witnessed, or maybe the thing that you— like, that keeps you up at night that you're afraid might happen one day, right?
Lu Nelson (You): Like, just describe those things, because they can tell you a lot.
Yannis Zachos: Absolutely. So yeah, average day, best day, worst day pretty much covers 80% of all days, pretty much, right? Maybe 90% even of all days, so.
Yannis Zachos: I guess also, yeah, that's a good point, because, like, you want to capture things that are rarely happening, stuff that we might not even have event logs for.
Lu Nelson (You): Yeah.
Yannis Zachos: For example. So that's a good point.
Lu Nelson (You): Sometimes the intuition about the more kind of, like, black swan type of things is only living in the heads of the people who know that system really well. Like, the data wouldn't even tell you that that's— that that's a possibility, right?
Yannis Zachos: Yeah. And I think, perhaps, then if we see that— like, there might be a line of questioning where you see that they describe a bad day or potentially, like, what's keeping them up at night, and then we almost construct a theoretical scenario of what might happen and how they would deal with it. So if we see them not being creative with their answers, we can just be like, you know, imagine that, you know, you've described to me that you're doing this X, Y, and Z.
Yannis Zachos: Imagine that while you're doing Y, all of a sudden you get a call that, you know.
Lu Nelson (You): Right.
Yannis Zachos: Z is whatever.
Lu Nelson (You): Right.
Yannis Zachos: Like, as specific as possible.
Lu Nelson (You): Yeah.
Yannis Zachos: Perhaps we already know initially what things are likely to go wrong, so part of the question might be, like, where do you— where are you— where are you least confident that things are going to go smoothly?
Lu Nelson (You): Yeah.
Yannis Zachos: In which part of the process you're least confident things are going to go smoothly? And then when they— so they perhaps identify some part of the process, and then we're like, you know, what if this happened? Or we just start coming up with scenarios of how things could potentially go.
Yannis Zachos: I mean, there's always— I mean, there's going to be an unbounded number of scenarios here, so.
Lu Nelson (You): Yeah, yeah, yeah, for sure. But I think you landed on a really interesting thing earlier, which is when you think about what you said about the user experience and not wanting to tire the user too much, is— is— and then you talked about, like, how could you ground the conversation in knowledge about the context and maybe even knowledge about the user that's being spoken to. I think that's a really good idea, because probably to prime this elicitation and set it up well, there probably is at least
Lu Nelson (You): some degree of material that could already be fetched in advance in order to sort of set the agent up so they understand, like, what are we talking about here? What is this— what is this— what does this thing do? What are the potential things that we are thinking about trying to gain insight about or optimize or whatever the goal might be?
Lu Nelson (You): Like, you might be able to identify kind of quite a few of those lines and boundaries first and set a context, and then set up the agent to ask the human, like, more consequential, focused questions, rather than have the human have to provide a lot of exhaustive information that might actually exist in documents or in other descriptions of the system.
Speaker 3: Yeah, because there's also.
Speaker 4: I would ask to anticipate that we would— like, the user would upload data or PDFs process documents that could be used as context, just as you would refer to a code base for, like, prior derivations. And I think it would be really good if we can see what Claude can do now. Say, like, if you said, I want to model a process, like, go through an elicitation process, and see what it naturally does rather than us specifying, like, every single thing, because I think at the moment
Speaker 4: AI is quite good already at, like, modeling processes as PetriKnots. So we should just try and fill any missing gaps rather than doing it from scratch.
Lu Nelson (You): Okay. Yeah, that's worth— it's worth using that as a kind of control example from the beginning. Like, can we— but we do have to figure out a— we do have to figure out a good solution to the problem that we've faced all the way along with elicitation, which is that an honest elicitation takes time.
Lu Nelson (You): Like, it's pretty hard to make them— to do them and then evaluate whether they were any good.
Speaker 4: Yeah.
Lu Nelson (You): Unless you can kind of— because you can't strictly script it, because it'll always be slightly different since it's generative, and it's generative at each step.
Speaker 4: Yeah.
Lu Nelson (You): And so— so it becomes hard to— it becomes hard to, like, you could— you could— you could do it— you could run through it with Claude, and then you could run through it with a more, I don't know, somehow methodical or structured system.
Speaker 4: I agree. Even the same person could give different answers on a different hour in the same process, so it's hard to compare, for sure.
Lu Nelson (You): Right, it's hard to compare, especially since, like, normally in real comparisons you want to do multiples of each one and then be able to, like, really compare those things, but that would take, like, an incredible amount of time. So we have to figure out some reasonable proxy or something for this. But.
Speaker 4: Yeah.
Lu Nelson (You): So.
Speaker 4: Also, one thing on the UX side. I think what Nora pointed out in her Zulip message a while ago, which we should definitely adopt, is that one of the things that makes the elicitation process feel much slower is, like, waiting between questions. And she said that some— she's seen what others might do is, like, you ask— you're thinking a question ahead, so you're asking a question immediately.
Speaker 4: You're not waiting for that turn, but you're, like, thinking what the next question should be based on the current answer, like, the question after that.
Lu Nelson (You): Right.
Speaker 4: So you're, like, reducing— you're reducing— or we should think about, like, batching questions together. So, like, the agent has, like, four questions at a time to ask, and they go through four very quickly, and then it thinks. Like, I think we need to.
Lu Nelson (You): Yeah. That's what I've— that's what I've— that's what I've been doing a little more recently, and I find it works. It works well, but it's also subject to a kind of horizon problem.
Lu Nelson (You): Like, the model can easily generate, like, nine questions for you, but the problem is that after you answer the first three, the fourth, fifth, and sixth already are at risk of being stale, because, like, your answers to the first three might be different than what the model expected.
Speaker 4: For sure.
Lu Nelson (You): And then already the next ones are out of line with that. So sometimes it's good for it to ask you, like, three, maybe four questions at a time.
Speaker 4: Yeah.
Lu Nelson (You): And it's usually, like, good sort of high-impact questions, and then it will think and then come up with, like, three or four more.
Speaker 4: But can you not prompt the agent to batch questions that are almost, like, unrelated to each other in terms of answering— the answer of one will not impact the other, like, to the best of its ability, obviously? It's complicated.
Lu Nelson (You): Yeah.
Speaker 4: It's hard to make that so that.
Lu Nelson (You): Yeah, definitely try to do that.
Yannis Zachos: I can see— I mean, just on that, I think a way I'm— like, implementation-wise, what I'm thinking of here is, I guess, how initially AI was applied, right, where you had— it was applied to, like, chess, where you had, like, trees of decisions that fan out, where here you have lines of questioning that are fanning out.
Lu Nelson (You): Yeah.
Yannis Zachos: And you're just pruning paths along this tree depending on the answers that you get. So perhaps you have— you know, you come up with— maybe you query— you do a mixture of experts approach where you query a bunch of agents to give you different lines of questioning, you reduce them as— or batch them as Dora suggests, and then based— so you decide which line of questioning is going to maximally increase our understanding of the system that we don't already have from ingested information, whether unstructured or structured.
Yannis Zachos: So whatever part of the knowledge graph we are least confident about, and then you ask— you ask that— you start that line of questioning. Depending on the answer, you might prune it, because there might be like, oh, no, no, no, actually we don't do that.
Yannis Zachos: So— and your follow-up questions perhaps depended on— on— assumed that the person was doing X, but they tell you that they're not doing it. So like, okay, let's prune this line of questioning and go to the next one, or adjust dynamically there.
Yannis Zachos: Like, can I— instead of just pruning the entire line of questioning, can I generate new children questions, like, in the tree of things?
Lu Nelson (You): Yeah.
Yannis Zachos: So this kind of tree representation of question— of lines of questioning.
Lu Nelson (You): Yeah.
Yannis Zachos: Sounds to me like— so to formalize it for an agent, right, something that the agent understands and can ground themselves on.
Lu Nelson (You): Yeah. Yeah, it's just— it's just tricky. Like, they— they— they don't necessarily come together strictly in trees.
Lu Nelson (You): Like, it's just the extent to which it would really work, like, sort of branching options is just sometimes less than you might think. Like, sometimes the questions are more open-ended.
Lu Nelson (You): At least necessarily at the beginning, they're more open-ended than you might think, and there isn't really a way to, like, map discrete branches off of those. But yeah, to whatever— to the extent that it's possible, we can try and do that.
Lu Nelson (You): Okay. What I was going to propose, since we're already over the half hour, is what if I put up a Notion document kind of with the questions that I had, and you could answer— you could try answering them or commenting on the questions or, like, whatever, but see— that'll give you also more time to think about it and maybe counterpoint or counterpropose your own better questions or whatever, but that would help to fill in some of those blanks.
Lu Nelson (You): And then I think off of that, I can also generate better questions, and we can, like, converge on something else. But— so it'd be a bit of a churning kind of process, but I think that might be— to do it sort of async might be an efficient way to go.
Yannis Zachos: Just to be clear, you're talking about questions that you would— that the agent would ask or questions?
Lu Nelson (You): Some of the questions I had for you, actually, like, along these lines of— like, these lines of, like, okay, imagine you're the one needing to sort of talk to a human to gather whatever you need to know in order to, like, successfully, comprehensively model this system in the way— according to the— according to the also very important aspects that you want to make sure you model in this system, because you want to make sure your model delivers a greater insight value than their current system of, like,
Lu Nelson (You): spreadsheets and playbooks or whatever, right? So, like, what is the stuff you're looking for and the kinds of— you know, it's basically— it's that— it's that— that's the angle, right? Trying to.
Yannis Zachos: Can— can I suggest that perhaps we can go through the list? I mean, I don't want to keep Dora on the call if she needs to be somewhere else, but can we just go through the list? I can try to answer things now, and if there's something that I think I need to think— have a think about, we can do that async.
Yannis Zachos: But let's— I would rather, like, get the— if there's a question, we can just get out of the way now, if you've got time as well, Lu.
Lu Nelson (You): Okay, well, there are—
Speaker 4: I'm sorry.
Lu Nelson (You): The thing is there— there are quite a few. Like, in a way, like, so the first question I had was, like, your— was the one I said earlier, if you're standing in front of the person who's— the person in charge of, like, allocation, scheduling, whatever, and, you know, what are your— what kinds of things do you ask, and what's— what element, like, what's model facet or structural element does this answer feed? Are you— are you trying to establish structure, color, rates, constraints, objectives?
Lu Nelson (You): Which dependency order would you ask these questions in, i.e., which things are likely to affect— which things— which answers do you want to have upstream of further questions that you want to ask downstream? Which ones are— which sort of effect order are you— are you thinking about in ordering your questions for answers?
Lu Nelson (You): Which kind of answers do you ask for as numbers, and which ones are you looking for as kind of distributions or as— just as stories or scenarios? And this is also that— leads into that question of, like, when do you ask about bad days, good days, and so on?
Lu Nelson (You): How do you elicit things that nobody wrote down? Taxonomies, penalty weights, unwritten constraints.
Lu Nelson (You): What kind of phrasings would you actually use to try to— to try to elicit that from a domain expert? How much of a net do you assemble from recurring structures or recurring motifs, like queues and buffers, resource pools, failure, repair, changeover, inspection, etc., versus inventing fresh things?
Lu Nelson (You): Like, are there kind of macro patterns that you're looking for that you would want to identify that you could specifically kind of label as a feature of the net, even while you're sort of figuring out where the rest of it would be? If so, could we enumerate that as a catalog?
Lu Nelson (You): That's a potentially high-leverage question for the— for the question of, like, the agent's strategy, because if— if nets can be built out of repeatable motifs or— or figures or clusters or something, then you— then that's quite— that's something quite strong. Like, or it's like a— it's another level of abstraction that the— that the model can use for mapping things to, aside from just thinking places, transitions, tokens, and token colors, and so on.
Lu Nelson (You): Like, you could think— you could— it could also look for sort of pattern clusters. Yeah, and, like, how do you understand as you're getting— when you're getting close to being done?
Lu Nelson (You): Like, what kind of— what sort of set of things is, like, minimal to understanding— to being able to say with any degree of confidence that you can build it? Structure, topology, types, colors, rates, distributions, initial markings, data bindings, other validations.
Yannis Zachos: Yeah, I mean.
Lu Nelson (You): You know, so— it goes on and on. Like, there's obviously a lot, right, and we want to try and get it, but— but get the right, yeah, I guess, level of it also for the agent so it's not somehow too massive and overwhelming at the same time.
Yannis Zachos: Yeah, I mean, I mean, these are all excellent questions, but, I mean, to be honest with you, I just— with regards to elicitation of patterns, what I've just done in the past is just use the AI assistant and just use Claude to help me refine the prompt or reverse engineer the prompt based on— like, literally, the only two things I've done is use the AI assistant in Patreon to generate pattern nets and just follow that line of— so it's not like I've— I mean, these are all
Yannis Zachos: excellent questions, but I can't say that I'm anywhere near, you know, knowledgeable enough to give sensible answers that you wouldn't otherwise get from— from Claude, really, on this matter. I mean, yeah, I mean, the only different thing I've done once— I tried it at least— was find a paper of a model, of a pseudo-physical model, and put it in Claude and say, "Reverse engineer the prompt for generating a pattern in a version of this model," which it wasn't— the model wasn't a pattern in a model,
Yannis Zachos: it was a different model. It was like a discrete event simulator or something like that, and I just literally, like, screenshotted it and said to Claude, "Reverse engineer the prompt for generating a pattern for it."
Lu Nelson (You): Yeah, yeah, yeah.
Yannis Zachos: So that— these are literally the only two things I've done. I haven't actually— like, even when we went to Clarion, I mean, we didn't actually do any pattern elicitation from them. I mean, we— they talked about a bunch of different stuff that's very domain-specific and, frankly, I didn't even know beforehand.
Yannis Zachos: So I— I'm afraid I don't have the very, like, refined.
Lu Nelson (You): Okay. No, that's fine. I mean, that's a— that's a very— that's a useful— it's obviously a useful learning in itself, that sort of— so I think we're still then, therefore, somewhere in the process of figuring out how to— how to orient ourselves and figuring out what exactly we need in order to make this viable.
Lu Nelson (You): But I think that this is— for me personally, I'm still working out the viability of these things. We've got— we've got a description of things that we want to have for the September MVP, but in the terms by which it's described, yeah, there's a lot of stuff that's unclear to me as to whether we really have the pieces we need to put together for that, or whether we would just be relying on something as basic as just the model.
Speaker 4: I mean, we definitely have to iterate on this. So I— like, we should build something that we can easily change. And I— I guess, like, in the most basic version, we'd just be doing what the current AI in PetriNorth is doing.
Speaker 4: Like, even just capturing all the assumptions it's made from, like, a one-shot prompt to build that PetriNet and, like, actually store it as, like, a graph and then, like, build on that. Because, like, isn't— I guess, like, in my head, it's like, are we not just prompting the agent to kind of carry out some elicitation process and be like, "Make sure you capture this, XYZ," but then really it's like, we need to refine that.
Speaker 4: Like, we're not really in the position to refine that right now completely.
Lu Nelson (You): Well, how— yeah, no, I agree, we're not. But— but how can we be? Is the question in my mind.
Lu Nelson (You): For sure, yes, we— we can make something— I mean, we can start with something as simple as possible. We can start with something very broad.
Lu Nelson (You): And—
Speaker 4: Yeah.
Lu Nelson (You): But as such, we're still going to be pretty far away from, like, let's— let's elicit a pseudo-physical model that actually showcases STCPNs. Like, an STCPN pseudo-physical model needs to be—
Speaker 4: But why can't you do that, like, one shot already?
Lu Nelson (You): Can you, though? Like, what— what do you—
Speaker 4: I mean, I can describe— I can describe a process, and it will model it as an STCPN.
Lu Nelson (You): It will model it as an STCPN, but it won't necessarily showcase STCPNs. Like, out of the current— out of the current things that we have.
Speaker 4: I— I also don't know if it should always be an STCPN. Sometimes it might be an SPN or a CPN if that is the best way to model something. The goal shouldn't be like, "This needs to be an STCPN."
Lu Nelson (You): Yeah, many of them— well, that's why I say— that's my point. Many of the use cases I think that we have so far, they don't necessarily need to be— they don't necessarily model as STCPNs. They can be normal-colored PetriNets.
Lu Nelson (You): Or maybe they're stochastic— maybe they have stochasticity, but the stochasticity, the dynamism, and the coloring, and all the— and, like, all the features out of the— out of the use cases that we've listed or that we've described or listed as things we might want to describe, there's very few that are fully— like, are fully proving out the full capabilities of STCPNs. When you want— when, you know, the description says, "Showcase STCPNs."
Lu Nelson (You): I'm just pointing it out.
Speaker 4: Okay.
Lu Nelson (You): The goal— the goal statement for September said, "Showcase STCPNs." We're— we're poor on things that showcase STCPNs as such. We don't have anything that really strains that, and building that kind of a model is actually pretty— it's a pretty sophisticated thing.
Lu Nelson (You): I don't know. Maybe— I would— I wouldn't imagine that Claude can do it in one shot, but maybe I'm wrong.
Lu Nelson (You): Because the amount of description you need in order to qualify what's— what's going in there and why does— how does it work and why does it work that way is more than you can do in one shot, unless you literally have the entire thing pre-described effectively, all you're asking. At that point, you're not— you'd skip elicitation and just say, "Project this as a net" and that's fine, but that's a different task.
Lu Nelson (You): If we want an elicitor— if we want to showcase an elicitor agent, then we have to actually elicit it.
Speaker 4: Yeah, I— I understand. I guess what I'm trying to ask is, like, how does this— like, can we build an architecture whereby we can update the way that the elicitor asks these questions easily, rather than committing to something from the get-go?
Lu Nelson (You): Yes, we can do that. Yeah, we can do that.
Speaker 4: Cool. Awesome.
Lu Nelson (You): Okay. All right. I will try to write this up and produce something that maybe will indicate the next questions that we need to figure out.
Speaker 4: Yeah, cool.
Yannis Zachos: Cool stuff.
Lu Nelson (You): All right. Thanks— thanks to both of you.
Yannis Zachos: Thank you.
Speaker 4: Bye.
Yannis Zachos: Thank you, guys. Take care.
Lu Nelson (You): Bye.
Speaker 4: Bye.
Yannis Zachos: Bye-bye.
Speaker 3: Record.
