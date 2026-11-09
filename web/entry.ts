// Browser entry: the same engine, scenarios and reference scripts the CLI uses.
import { newRun, callTool, finishRun, evaluate, toolDefinitions } from '../src/engine.js';
import { scenarios, policy, task } from '../src/scenarios.js';
import { runScripted } from '../src/agents.js';
(globalThis as any).CrashLab = { newRun, callTool, finishRun, evaluate, runScripted, scenarios, policy, task, tools: Object.keys(toolDefinitions) };
