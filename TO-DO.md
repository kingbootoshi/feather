TO DO:
- test structured output
- make the output a direct string if not structured output
- implement dynamic variables
- add the image function to message
- add chainRunning

THOUGHTS:
- if an agent chains it's own tools, how can we provide back the first output to a user?
this specific example applies to my discord bot

-> outut can read output + if run again is called
-> if run again is called, log agent output then loop the call
-> this is how feather can fit with hearth