/**
 * NEXUS AI - AI Agent Service (TNT LLM Pattern)
 * Autonomous multi-step reasoning and tool execution
 * Implements ReAct (Reasoning + Acting) pattern
 */

'use strict';

const groqService = require('./groq.service');
const vectorStore = require('./vectorStore.service');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/errors');

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const AGENT_TOOLS = {
  web_search: {
    name: 'web_search',
    description: 'Search the web for current information, news, or facts',
    parameters: { query: 'string - the search query' },
    execute: async (args) => {
      // In production, integrate with Serper/Google Search API
      const { query } = args;
      return `Search results for "${query}": [In production, real web search results would appear here. Integrate with Serper API: https://serper.dev]`;
    },
  },

  calculate: {
    name: 'calculate',
    description: 'Perform mathematical calculations, including complex expressions',
    parameters: { expression: 'string - mathematical expression to evaluate' },
    execute: async (args) => {
      try {
        const math = require('mathjs');
        const result = math.evaluate(args.expression);
        return `Result: ${result}`;
      } catch (err) {
        return `Calculation error: ${err.message}`;
      }
    },
  },

  summarize_text: {
    name: 'summarize_text',
    description: 'Summarize a long piece of text into key points',
    parameters: {
      text: 'string - text to summarize',
      style: 'string - "brief" | "comprehensive" | "bullet" | "executive"',
    },
    execute: async (args) => {
      const result = await groqService.summarize(args.text, {
        style: args.style || 'comprehensive',
      });
      return result.content;
    },
  },

  search_documents: {
    name: 'search_documents',
    description: "Search the user's uploaded documents for relevant information",
    parameters: {
      query: 'string - what to search for',
      userId: 'string - user ID for namespace isolation',
    },
    execute: async (args) => {
      const results = await vectorStore.search(args.query, args.userId, { topK: 3 });
      if (!results.length) return 'No relevant documents found';

      return results.map(r =>
        `[${r.metadata.filename}, p.${r.metadata.page}] (score: ${r.score.toFixed(2)})\n${r.text}`
      ).join('\n\n');
    },
  },

  extract_data: {
    name: 'extract_data',
    description: 'Extract structured data (tables, lists, key-value pairs) from text',
    parameters: {
      text: 'string - text containing data to extract',
      format: 'string - "json" | "csv" | "list"',
    },
    execute: async (args) => {
      const messages = [{
        role: 'user',
        content: `Extract all structured data from the following text and return as ${args.format || 'json'}.\n\nText:\n${args.text}`,
      }];
      const result = await groqService.complete(messages, { temperature: 0.1 });
      return result.content;
    },
  },

  analyze_sentiment: {
    name: 'analyze_sentiment',
    description: 'Analyze the sentiment and tone of a piece of text',
    parameters: { text: 'string - text to analyze' },
    execute: async (args) => {
      const messages = [{
        role: 'user',
        content: `Analyze the sentiment of this text. Return: overall sentiment (positive/negative/neutral), confidence (0-1), key emotional indicators, and tone.\n\nText: ${args.text}`,
      }];
      const result = await groqService.complete(messages, { temperature: 0.1 });
      return result.content;
    },
  },
};

class AgentService {
  constructor() {
    this.maxSteps = 10;
    this.tools = AGENT_TOOLS;
  }

  /**
   * Execute an agent task with full ReAct loop
   * @param {string} task - The user's task
   * @param {string} userId - User ID for document search
   * @param {Function} onStep - Callback for step updates (streaming)
   */
  async executeTask(task, userId, onStep = null) {
    const steps = [];
    const startTime = Date.now();

    logger.info(`Agent task started: ${task.slice(0, 100)}`);

    const availableTools = Object.values(this.tools).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    // Inject userId into document search tool
    const enrichedContext = { userId };

    for (let step = 0; step < this.maxSteps; step++) {
      try {
        // Get next action from LLM
        const reasoning = await groqService.agentReason(task, availableTools, steps);

        const currentStep = {
          stepNumber: step + 1,
          thought: reasoning.thought,
          action: reasoning.action,
          args: reasoning.args,
          observation: null,
          timestamp: new Date().toISOString(),
        };

        // Emit step update for real-time streaming
        if (onStep) {
          await onStep({ type: 'step_start', step: currentStep });
        }

        // FINISH condition
        if (reasoning.action === 'FINISH' || !reasoning.action) {
          currentStep.observation = 'Task completed';
          steps.push(currentStep);

          if (onStep) {
            await onStep({ type: 'complete', step: currentStep, finalAnswer: reasoning.final_answer });
          }

          return {
            success: true,
            finalAnswer: reasoning.final_answer || reasoning.thought,
            steps,
            executionTime: Date.now() - startTime,
            toolsUsed: [...new Set(steps.map(s => s.action).filter(a => a !== 'FINISH'))],
          };
        }

        // Execute tool
        const tool = this.tools[reasoning.action];
        if (!tool) {
          currentStep.observation = `Tool "${reasoning.action}" not found. Available: ${Object.keys(this.tools).join(', ')}`;
        } else {
          try {
            const toolArgs = { ...reasoning.args, ...enrichedContext };
            const toolResult = await tool.execute(toolArgs);
            currentStep.observation = String(toolResult).slice(0, 2000); // Limit observation size
          } catch (toolError) {
            currentStep.observation = `Tool error: ${toolError.message}`;
            logger.warn(`Tool ${reasoning.action} failed:`, toolError);
          }
        }

        steps.push(currentStep);

        if (onStep) {
          await onStep({ type: 'step_complete', step: currentStep });
        }

        // Safety check: detect loops
        if (this._detectLoop(steps)) {
          break;
        }

      } catch (error) {
        logger.error(`Agent step ${step} error:`, error);
        break;
      }
    }

    // Max steps reached - generate final answer from steps
    const finalAnswer = await this._generateFinalAnswer(task, steps);

    return {
      success: true,
      finalAnswer,
      steps,
      executionTime: Date.now() - startTime,
      toolsUsed: [...new Set(steps.map(s => s.action).filter(a => a !== 'FINISH'))],
      warning: 'Max steps reached',
    };
  }

  /**
   * Generate a final synthesized answer from all steps
   */
  async _generateFinalAnswer(task, steps) {
    const stepsContext = steps.map(s =>
      `Step ${s.stepNumber}: ${s.thought}\nAction: ${s.action}\nResult: ${s.observation}`
    ).join('\n\n');

    const messages = [{
      role: 'user',
      content: `Based on these research steps, provide a comprehensive final answer to the original task.

ORIGINAL TASK: ${task}

RESEARCH PERFORMED:
${stepsContext}

Provide a clear, comprehensive answer based on the gathered information.`,
    }];

    const result = await groqService.complete(messages, { temperature: 0.5 });
    return result.content;
  }

  /**
   * Detect if agent is stuck in a loop
   */
  _detectLoop(steps) {
    if (steps.length < 3) return false;
    const recent = steps.slice(-3);
    const actions = recent.map(s => `${s.action}:${JSON.stringify(s.args)}`);
    return actions[0] === actions[1] || actions[1] === actions[2];
  }

  /**
   * Get available tool descriptions for display
   */
  getToolDescriptions() {
    return Object.values(this.tools).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }
}

module.exports = new AgentService();
