TO DO:
- add unit tests in a single file to ensure everything works
- add talking to an agent in the chatbox gui if enabled

THOUGHTS:
- if an agent chains it's own tools, how can we provide back the first output to a user?
this specific example applies to my discord bot

thinking...
-> outut can read output + if run again is called
-> if run again is called, log agent output then loop the call
-> this is how feather can fit with hearth

solution: have option for turning off auto execute for tools, and then manually calling the tool execute function + dealing with content result