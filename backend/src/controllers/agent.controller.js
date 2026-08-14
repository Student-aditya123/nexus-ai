/**
 * NEXUS AI - Agent Controller
 * Autonomous AI task execution with real-time streaming
 */

'use strict';

const agentService = require('../services/ai/agent.service');
const { AppError, asyncHandler } = require('../utils/errors');
const logger = require('../utils/logger');

exports.executeTask = asyncHandler(async (req, res) => {
  const { task, stream = true } = req.body;
  const userId = req.user._id.toString();

  if (!task?.trim()) throw new AppError('Task description is required', 400);
  if (task.length > 2000) throw new AppError('Task description too long (max 2000 chars)', 400);

  logger.info(`Agent task: "${task.slice(0, 80)}" by user ${userId}`);

  if (stream) {
    // SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const sendEvent = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent({ type: 'started', task });

    const result = await agentService.executeTask(
      task,
      userId,
      async (stepUpdate) => {
        sendEvent(stepUpdate);
        // Small delay for UI rendering
        await new Promise(r => setTimeout(r, 50));
      }
    );

    sendEvent({
      type: 'finished',
      result: {
        finalAnswer: result.finalAnswer,
        steps: result.steps,
        executionTime: result.executionTime,
        toolsUsed: result.toolsUsed,
      },
    });

    res.end();
  } else {
    // Synchronous execution
    const result = await agentService.executeTask(task, userId);

    res.json({
      success: true,
      data: result,
    });
  }
});

exports.getTools = asyncHandler(async (req, res) => {
  const tools = agentService.getToolDescriptions();

  res.json({
    success: true,
    data: tools,
  });
});
