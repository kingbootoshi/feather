TO DO:
- test structured output
- implement dynamic variables to system prompt
- add the 'add image' logic to addUserMessage
- add chainRunning

THOUGHTS:
- if an agent chains it's own tools, how can we provide back the first output to a user?
this specific example applies to my discord bot

-> outut can read output + if run again is called
-> if run again is called, log agent output then loop the call
-> this is how feather can fit with hearth