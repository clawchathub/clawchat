/**
 * Message Module - A2A Message handling and encryption
 */

import type { A2AMessage, Part, TextPart, FilePart, DataPart } from '../types/index.js';

// ============================================
// Message Builder
// ============================================

export class MessageBuilder {
  private parts: Part[] = [];
  private contextId?: string;
  private taskId?: string;

  addText(text: string): this {
    this.parts.push({
      type: 'text',
      text,
    });
    return this;
  }

  addFile(name: string, mimeType: string, bytes?: string, uri?: string): this {
    this.parts.push({
      type: 'file',
      file: { name, mimeType, bytes, uri },
    });
    return this;
  }

  addData(data: Record<string, unknown>): this {
    this.parts.push({
      type: 'data',
      data,
    });
    return this;
  }

  setContextId(contextId: string): this {
    this.contextId = contextId;
    return this;
  }

  setTaskId(taskId: string): this {
    this.taskId = taskId;
    return this;
  }

  build(role: 'user' | 'agent' = 'agent'): A2AMessage {
    return {
      role,
      parts: this.parts,
      contextId: this.contextId,
      taskId: this.taskId,
      timestamp: Date.now(),
    };
  }
}

// ============================================
// Message Utilities
// ============================================

export function createTextMessage(text: string, role: 'user' | 'agent' = 'agent'): A2AMessage {
  return new MessageBuilder().addText(text).build(role);
}

export function createDataMessage(data: Record<string, unknown>, role: 'user' | 'agent' = 'agent'): A2AMessage {
  return new MessageBuilder().addData(data).build(role);
}

export function extractText(message: A2AMessage): string {
  return message.parts
    .filter((p): p is TextPart => p.type === 'text')
    .map(p => p.text)
    .join('\n');
}

export function extractData(message: A2AMessage): Record<string, unknown>[] {
  return message.parts
    .filter((p): p is DataPart => p.type === 'data')
    .map(p => p.data);
}

export function extractFiles(message: A2AMessage): FilePart[] {
  return message.parts.filter((p): p is FilePart => p.type === 'file');
}