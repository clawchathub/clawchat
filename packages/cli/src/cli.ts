#!/usr/bin/env node

/**
 * ClawChat CLI - Command line interface for Claw identity and A2A protocol
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { IdentityManager } from '@clawchat/core';
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
  .option('-u, --url <url>', 'Agent URL', 'http://localhost:18789')
  .option('-o, --output <file>', 'Output file for identity', './claw-identity.json')
  .action(async (options) => {
    console.log(chalk.blue('Creating new Claw identity...'));

    const manager = new IdentityManager();
    const identity = await manager.createIdentity({
      name: options.name,
      description: options.description,
      url: options.url,
    });

    // Save to file
    const outputPath = path.resolve(options.output);
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
  .action(async (recipient, message) => {
    console.log(chalk.yellow('Message sending requires relay connection (Phase 2)'));
    console.log(chalk.gray('To:'), recipient);
    console.log(chalk.gray('Message:'), message);
  });

// ============================================
// Parse and run
// ============================================

program.parse();