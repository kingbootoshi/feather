TO DO:
- add chainRunning (option for agent to run again on it's own, chaining tool calls together)
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

jan 3 11:59 PM
- i left off with the chainRun on finish_run tool logic working, but i just have to make it pretty and show logs, fix consistency. maybe do an o1 re-run. but i think thats the answer. also we made it so tools used are properly logged in the agent