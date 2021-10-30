# Graphs & Nodes

Graphs and nodes are the main module you need to understand to use Control.

At the most basic level they are easy to understand. Nodes represent a "step" of the graph,
and the graph represents the "path" every step will take place on.

There are many real-world examples of flow-based automation you can check out.
Postman recently shipped their flows feature, and you can also check node-red website or even GitHub actions (step based CI).

Control aims to bring this powerful tool to every developer in a easy-to-understand and easy-to-configure manner.

## General developer information

As a developer you will not often need to use the Graph and Node classes manually.

Instead you will surely configure graphs (flows) with existing nodes and create new nodes.

As a matter of fact Control comes with some basic nodes (of which one can run any Nodejs script) that can
help you get started and even be enough for simple setups.

---
### Rules & Info

* A graph must have only one entry node (if there are multiple entries, make multiple graphs)
* A graph has a mutable context which is propagated to every node on the flow
* A graph can have as many leaves (end nodes) as it needs
* A flow (running a graph) is considered done
* Nodes run as many times as they have parents (if two nodes point to the same child, it will run twice)
* Nodes propagate their outputs to their children and to every other subsequent node
* Nodes are state machines with pre-defined transitions and should not be forced to a specific state.
* Nodes have a `TYPE` property, that is used to map the graph configuration and instanciate the correct node.

## Writing Nodes

If you need some examples, take a look at some of the [standard nodes here](/tree/master/lib/nodes/generic.js).

Writing nodes is quite straightforward. You only need to override some methods and you can use your nodes.
The first thing to know is how Node methods are used in a flow and how to override them.

### Methods

When a graph is executed, it will run nodes one by one following the flow of the graph. Nodes can decide if
they need to stop their execution (and therefore their whole branch) or execute their code and let the flow run.

Nodes can also perform clean up operations, but these won't affect the execution of the Graph (unless they throw an error);

The methods you can override are:

|Method name|Required|Return|Signature|Description|
|:-:|:-:|:-|
|`pre_run`| No (defaults to `true`)| Scalar or Promise |`pre_run({ inputs, outputs, context })`| The `pre_run()` method let's the graph know if this node stops the current flow. If the `pre_run` method returns `false` the Node will stop the flow. If it returns anything else it will let the flow continue |
| `post_run` | No (defaults to `true`) | Scalar or Promise | `post_run({ inputs, outputs, context })` | The `post_run()` method executes any necessary cleanup on the Node. The result is ignored |
| `run` | Yes | Scalar or Promise | `run({ inputs, outputs, context })` | The `run` method is the main method of a Node. It takes the `inputs` parameters, which is the result of the previous node, as well as the `outputs` stack (indexed by node id) and the current flow context. This method executes the node and performs any necessary actions it needs |

> If the `pre_run` or `run` methods throw, Control will let the error propagate up.

If we wanted to write a node to turn on a light for example:
```js
class TurnOnLight extends Node {
	static TYPE = 'turn-light-on';

	pre_run({ inputs }) {
		if(!inputs.shouldTurnOn) {
			// If the previous node told us to not turn on the light
			// we can stop the flow and not run this node
			return false;
		}

		return true;
	}

	run() {
		const light = new Light(this.config.light_id);
		// Return a promise after the light has turned on
		// and continue the flow;
		return light.turnOn();
	}

	// No cleanup needed
	// post_run() {}
}
```

## Writing plugins

Plugins are collection of nodes stored in their own repos (or packages).

Plugins can have as many nodes as they wish and as many files as they wish. However a single directory is required to
allow Control to read the Nodes present there.

* If you have multiple nodes in a single file, you should export them in an object
	```js
	module.exports{ MyFirstNode, MySecondNode, MyThirdNode };
	```
* If you have a single Node in a file, you should directly export the class:
	```js
	module.exports = MySpecialNode;
	```

### Configuration for NPM packages
When publishing a control node plugin, you should add a `control` configuration key on your `package.json`, for example:
```json
{
  "name": "my-control-plugin",
  "version": "1.0.0",
  "control": {
  	"directory": "./nodes"
  }
}

```

Please note that plugins can have their own dependencies, as they are installed via `npm i`.
