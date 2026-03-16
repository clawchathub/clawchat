#!/usr/bin/env node

/**
 * ClawChat CLI - Command line interface for Claw identity and A2A protocol
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { IdentityManager, DEFAULT_A2A_PORT, DEFAULT_RELAY_PORT } from '@clawchat/core';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

program
  .name('claw')
  .description('ClawChat CLI - Manage Claw identities and communicate via A2A protocol')
  .version('0.0.1');

// ============================================
// Identity Commands
// ============================================

const identityCmd = program.command('identity')
  .description('Manage Claw identities');

identityCmd.command('create')
  .description('Create a new Claw identity')
  .option('-n, --name <name>', 'Agent name', 'MyClaw')
  .option('-d, --description <description>', 'Agent description', 'A ClawChat agent')
  .option('-u, --url <url>', 'Agent URL', `http://localhost:${DEFAULT_A2A_PORT}`)
  .option('-o, --output <file>', 'Output file for identity', './claw-identity.json')
  .action(async (options) => {
    const outputPath = path.resolve(options.output);

    if (fs.existsSync(outputPath)) {
      console.log(chalk.red(`✗ Identity file already exists: ${outputPath}`));
      console.log(chalk.gray('Use a different --output path or delete the existing file'));
      process.exit(1);
    }

    console.log(chalk.blue('Creating new Claw identity...'));

    const manager = new IdentityManager();
    const identity = await manager.createIdentity({
      name: options.name,
      description: options.description,
      url: options.url,
    });

    // Save to file
    fs.writeFileSync(outputPath, manager.exportIdentity()!);

    console.log(chalk.green('✓ Identity created successfully!'));
    console.log();
    console.log(chalk.gray('Public Key:'), identity.publicKey);
    console.log(chalk.gray('Agent Name:'), identity.agentCard.identity.name);
    console.log(chalk.gray('Saved to:'), outputPath);
  });

identityCmd.command('show')
  .description('Show current identity details')
  .option('-i, --input <file>', 'Identity file', './claw-identity.json')
  .action(async (options) => {
    const inputPath = path.resolve(options.input);

    if (!fs.existsSync(inputPath)) {
      console.log(chalk.red('✗ Identity file not found:', inputPath));
      console.log(chalk.gray('Run `claw identity create` to create a new identity'));
      return;
    }

    const manager = new IdentityManager();
    const identityJson = fs.readFileSync(inputPath, 'utf-8');
    const identity = await manager.importIdentity(identityJson);

    console.log(chalk.blue('Claw Identity'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(chalk.gray('Public Key:'), identity.publicKey);
    console.log(chalk.gray('Version:'), identity.version);
    console.log(chalk.gray('Created:'), new Date(identity.createdAt).toISOString());
    console.log();
    console.log(chalk.blue('Agent Card'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(chalk.gray('Name:'), identity.agentCard.identity.name);
    console.log(chalk.gray('Description:'), identity.agentCard.identity.description);
    console.log(chalk.gray('URL:'), identity.agentCard.identity.url);
    console.log(chalk.gray('Capabilities:'));
    console.log(chalk.gray('  - Streaming:'), identity.agentCard.capabilities.streaming ? '✓' : '✗');
    console.log(chalk.gray('  - Push Notifications:'), identity.agentCard.capabilities.pushNotifications ? '✓' : '✗');
  });

identityCmd.command('export')
  .description('Export public Agent Card')
  .option('-i, --input <file>', 'Identity file', './claw-identity.json')
  .option('-o, --output <file>', 'Output file for Agent Card', './agent.json')
  .action(async (options) => {
    const inputPath = path.resolve(options.input);

    if (!fs.existsSync(inputPath)) {
      console.log(chalk.red('✗ Identity file not found:', inputPath));
      return;
    }

    const manager = new IdentityManager();
    const identityJson = fs.readFileSync(inputPath, 'utf-8');
    await manager.importIdentity(identityJson);

    const outputPath = path.resolve(options.output);
    fs.writeFileSync(outputPath, manager.getAgentCardJson()!);

    console.log(chalk.green('✓ Agent Card exported to:'), outputPath);
  });

// ============================================
// Card Commands
// ============================================

const cardCmd = program.command('card')
  .description('Manage Agent Cards');

cardCmd.command('publish')
  .description('Publish Agent Card to .well-known directory')
  .option('-i, --input <file>', 'Identity file', './claw-identity.json')
  .option('-d, --directory <dir>', 'Output directory', './public')
  .action(async (options) => {
    const inputPath = path.resolve(options.input);

    if (!fs.existsSync(inputPath)) {
      console.log(chalk.red('✗ Identity file not found:', inputPath));
      return;
    }

    const manager = new IdentityManager();
    const identityJson = fs.readFileSync(inputPath, 'utf-8');
    await manager.importIdentity(identityJson);

    const outputDir = path.resolve(options.directory, '.well-known');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'agent.json');
    fs.writeFileSync(outputPath, manager.getAgentCardJson()!);

    console.log(chalk.green('✓ Agent Card published to:'), outputPath);
    console.log(chalk.gray('Access at: /.well-known/agent.json'));
  });

// ============================================
// Message Commands (placeholder for Phase 2)
// ============================================

const messageCmd = program.command('message')
  .description('Send and receive A2A messages');

messageCmd.command('send')
  .description('Send a message to another Claw')
  .argument('<recipient>', 'Recipient public key or URL')
  .argument('<message>', 'Message content')
  .option('-i, --identity <file>', 'Identity file', './claw-identity.json')
  .option('-r, --relay <url>', 'Relay URL', `ws://localhost:${DEFAULT_RELAY_PORT}`)
  .action(async (recipient, message, options) => {
    const inputPath = path.resolve(options.identity);

    if (!fs.existsSync(inputPath)) {
      console.log(chalk.red('✗ Identity file not found:'), inputPath);
      console.log(chalk.gray('Run `claw identity create` first'));
      return;
    }

    console.log(chalk.blue('Sending message...'));

    try {
      const { IdentityManager } = await import('@clawchat/core');
      const { A2AClient } = await import('@clawchat/p2p');

      const manager = new IdentityManager();
      const identity = await manager.importIdentity(fs.readFileSync(inputPath, 'utf-8'));

      const client = new A2AClient({
        relayUrl: options.relay,
        agentCard: identity.agentCard,
        publicKey: identity.publicKey,
        privateKey: identity.privateKey!,
      });

      await client.connect();
      await client.sendText(recipient, message);

      console.log(chalk.green('✓ Message sent!'));
      console.log(chalk.gray('To:'), recipient);
      console.log(chalk.gray('Message:'), message);

      client.disconnect();
    } catch (error: any) {
      console.log(chalk.red('✗ Failed to send message:'), error.message);
    }
  });

// ============================================
// Node Commands (Phase 2)
// ============================================

const nodeCmd = program.command('node')
  .description('Manage Claw node');

nodeCmd.command('start')
  .description('Start the Claw node')
  .option('--foreground', 'Run in foreground', true)
  .option('-c, --config <path>', 'Config file path', '.env')
  .action(async (options) => {
    console.log(chalk.blue('Starting Claw node...'));

    try {
      // Dynamic import to handle optional @clawchat/node dependency
      const { ClawNode } = await import('@clawchat/node');
      const node = new ClawNode();
      await node.init();
      await node.start();
    } catch (error: any) {
      if (error.code === 'MODULE_NOT_FOUND') {
        console.log(chalk.yellow('Node package not installed. Run: pnpm install'));
        console.log(chalk.gray('Or use: claw node start --foreground'));
      } else {
        console.log(chalk.red('Failed to start node:'), error.message);
      }
      process.exit(1);
    }
  });

nodeCmd.command('status')
  .description('Check node status')
  .option('-p, --port <port>', 'Health check port', '18792')
  .action(async (options) => {
    try {
      const response = await fetch(`http://localhost:${options.port}/health`);
      if (response.ok) {
        const data = await response.json() as any;
        console.log(chalk.green('✓ Node is running'));
        console.log(chalk.gray('Status:'), data.status);
        console.log(chalk.gray('Uptime:'), `${Math.floor(data.uptime / 1000)}s`);
        console.log();
        console.log(chalk.blue('Components:'));
        for (const [name, status] of Object.entries(data.components)) {
          const s = status as any;
          const icon = s.status === 'ok' ? '✓' : s.status === 'degraded' ? '⚠' : '✗';
          const color = s.status === 'ok' ? 'green' : s.status === 'degraded' ? 'yellow' : 'red';
          console.log(chalk.gray(`  ${name}:`), chalk[color](`${icon} ${s.status}`));
        }
      } else {
        console.log(chalk.red('✗ Node is not responding'));
        console.log(chalk.gray(`Health check failed: ${response.status}`));
      }
    } catch {
      console.log(chalk.red('✗ Cannot connect to node'));
      console.log(chalk.gray('Is the node running? Run: claw node start'));
    }
  });

// ============================================
// Chat Command (Phase 2)
// ============================================

program.command('chat')
  .description('Interactive chat with another agent')
  .argument('<publicKey>', 'Recipient agent public key')
  .action(async (publicKey) => {
    console.log(chalk.blue(`Chatting with ${publicKey.slice(0, 16)}...`));
    console.log(chalk.gray('Type your message and press Enter. Ctrl+C to exit.'));
    console.log();

    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // For now, this is a stub since relay connection needs full setup
    console.log(chalk.yellow('Note: Chat requires a running relay server and loaded identity.'));
    console.log(chalk.gray('Run `claw node start` first, then use this command.'));

    const prompt = () => {
      rl.question(chalk.cyan('You: '), async (input) => {
        if (input.trim() === '') {
          prompt();
          return;
        }

        try {
          // Dynamic import for @clawchat/node
          const { ClawNode } = await import('@clawchat/node');
          const node = new ClawNode();
          await node.init();
          await node.start();

          const client = node.getClient();
          await client.sendText(publicKey, input.trim());
          console.log(chalk.green('Message sent!'));
        } catch (error: any) {
          console.log(chalk.red('Failed to send:'), error.message);
        }

        prompt();
      });
    };

    prompt();

    rl.on('close', () => {
      console.log(chalk.gray('\nGoodbye!'));
      process.exit(0);
    });
  });

// ============================================
// Parse and run
// ============================================

program.parse();