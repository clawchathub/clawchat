#!/usr/bin/env node
import { ClawNode } from './node.js';

async function main() {
  console.log('ClawChat Node v0.0.1');

  const node = new ClawNode();

  try {
    await node.init();
    await node.start();
  } catch (error) {
    console.error('Failed to start ClawNode:', error);
    process.exit(1);
  }
}

main();
