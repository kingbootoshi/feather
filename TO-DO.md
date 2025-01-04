TO DO:
- test structured output
- implement dynamic variables to system prompt
- add the 'image' logic to addUserMessage, for automatically adding images to a message
- add option for tools to NOT auto execute (tool usages given in outputs, for manual handling of function calls)
- i think cognitive being off doesn't work so fix that
- add chainRunning (option for agent to run again on it's own, chaining tool calls together)

THOUGHTS:
- if an agent chains it's own tools, how can we provide back the first output to a user?
this specific example applies to my discord bot

thinking...
-> outut can read output + if run again is called
-> if run again is called, log agent output then loop the call
-> this is how feather can fit with hearth

solution: have option for turning off auto execute for tools, and then manually calling the tool execute function + dealing with content result