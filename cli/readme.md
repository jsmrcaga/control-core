# Control CLI

The Control CLI makes use of the power of `worker_threads` to run flows in parallel.

You can configure yor execution via CLI flags or via a config file (`js` or `json`) and you can also
configure a custom renderer for your output.

## Lexicon:
* **Graph**: A Control graph configuration (collection of linked nodes)
* **Task**: A Worker task, meant to execute a graph

## Basic usage

Example:

```sh
control\
	-g ./test/cli/live-test/graph.json\
	-n ./test/cli/live-test/nodes\
	-t 3
```

```
Options:
    -g, --graphs	Path to the graph(s) configuration file (only JSON accepted)
    -c, --config	Configuration file (for graphs, local nodes and plugins)
    -o, --output	File to write output to (all nodes output)
    -n, --nodes		Directory to find custom nodes
    -t, --threads	Maximum number of threads
    -r, --respawn	If dead threads should automatically respawn
    -i, --idle		Maximum time a thread can be idle before killing it (incompatible with respawn)
    --verbose		Verbose logging
    --renderer		Path to a custom renderer
```

## Configuration via file

The configuration file can have any of the flags defined above. However only "full" flags will  be read (ie: `graph` instead of `g`. `g` will be ignored)

When using a file, any flag used on the CLI will have higher priority. If you set the max number of threads to 3 in the file, but call `control -t 6`, 6 threads will be spawned.

## Custom renderer

Writing a custom renderer is a pretty straightforward process, there are two methods to override, but Control gives you full control
over how and what you render.

### Constructor
Every renderer is instanciated with all the options and variables passed to the CLI as well as the list of graphs and the list of tasks passed to the worker pool.

The `graphs` argument is the list of graphs read from the configuration file
The `tasks` is a map of `[task_id]: { graph, status, time, end_time }` allowing you to track every task and the time it took.

### Methods

#### `pre_render`:
`pre_render` is called on the constructor of every renderer. You can use this method to create any necessary objects to your renderer.

#### `init`:
The `init` method is called with the `worker_pool` as the only argument. The default renderer adds event listeners in order to draw the graphs. We would advice to read the code of the 
standard renderer to understand how it operates.

#### `finish`
The finish method is called when all graphs have been executed and all flows finished. It will be called with some timing info:
* start & end: the start and end times (hrtime) of the graphs execution (post worker initialization)
* cold_start & cold_end: the worker initialization times
