/**
 * A2A Agent Card Type Definitions
 * Based on Google A2A v0.3 Specification
 * @see https://github.com/google/A2A
 */

import { z } from 'zod';

// ============================================
// Security Schemes
// ============================================

export const SecuritySchemeTypeSchema = z.enum(['apiKey', 'http', 'oauth2', 'openIdConnect']);

export type SecuritySchemeType = z.infer<typeof SecuritySchemeTypeSchema>;

export const ApiKeySecuritySchemeSchema = z.object({
  type: z.literal('apiKey'),
  name: z.string(),
  in: z.enum(['header', 'query', 'cookie']),
  description: z.string().optional(),
});

export const HttpSecuritySchemeSchema = z.object({
  type: z.literal('http'),
  scheme: z.string(),
  bearerFormat: z.string().optional(),
  description: z.string().optional(),
});

export const OAuth2SecuritySchemeSchema = z.object({
  type: z.literal('oauth2'),
  flows: z.object({
    implicit: z.object({
      authorizationUrl: z.string(),
      scopes: z.record(z.string()),
    }).optional(),
    password: z.object({
      tokenUrl: z.string(),
      scopes: z.record(z.string()),
    }).optional(),
    clientCredentials: z.object({
      tokenUrl: z.string(),
      scopes: z.record(z.string()),
    }).optional(),
    authorizationCode: z.object({
      authorizationUrl: z.string(),
      tokenUrl: z.string(),
      scopes: z.record(z.string()),
    }).optional(),
  }),
  description: z.string().optional(),
});

export const SecuritySchemeSchema = z.discriminatedUnion('type', [
  ApiKeySecuritySchemeSchema,
  HttpSecuritySchemeSchema,
  OAuth2SecuritySchemeSchema,
]);

export type SecurityScheme = z.infer<typeof SecuritySchemeSchema>;
export type ApiKeySecurityScheme = z.infer<typeof ApiKeySecuritySchemeSchema>;
export type HttpSecurityScheme = z.infer<typeof HttpSecuritySchemeSchema>;
export type OAuth2SecurityScheme = z.infer<typeof OAuth2SecuritySchemeSchema>;

// ============================================
// Agent Skill
// ============================================

export const AgentSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  inputModes: z.array(z.string()), // e.g., ["text", "file", "data"]
  outputModes: z.array(z.string()),
  examples: z.array(z.unknown()).optional(),
});

export type AgentSkill = z.infer<typeof AgentSkillSchema>;

// ============================================
// Protocol Binding
// ============================================

export const ProtocolBindingSchema = z.object({
  protocol: z.string(), // e.g., "a2a", "mcp"
  url: z.string(),
  version: z.string().optional(),
  security: z.array(z.string()).optional(), // Reference to security scheme names
});

export type ProtocolBinding = z.infer<typeof ProtocolBindingSchema>;

// ============================================
// Agent Capabilities
// ============================================

export const AgentCapabilitiesSchema = z.object({
  streaming: z.boolean().default(false),
  pushNotifications: z.boolean().default(false),
  extendedAgentCard: z.boolean().default(false),
});

export type AgentCapabilities = z.infer<typeof AgentCapabilitiesSchema>;

// ============================================
// Agent Identity
// ============================================

export const AgentIdentitySchema = z.object({
  name: z.string(),
  description: z.string(),
  url: z.string(), // Base URL for A2A endpoint
  version: z.string(),
  documentationUrl: z.string().optional(),
  provider: z.object({
    organization: z.string(),
    url: z.string(),
  }).optional(),
});

export type AgentIdentity = z.infer<typeof AgentIdentitySchema>;

// ============================================
// Agent Card (Full)
// ============================================

export const AgentCardSchema = z.object({
  identity: AgentIdentitySchema,
  capabilities: AgentCapabilitiesSchema,
  securitySchemes: z.record(SecuritySchemeSchema).optional(),
  skills: z.array(AgentSkillSchema).default([]),
  interfaces: z.array(ProtocolBindingSchema).default([]),
  metadata: z.record(z.unknown()).optional(),
});

export type AgentCard = z.infer<typeof AgentCardSchema>;

// ============================================
// Helper Functions
// ============================================

export function createAgentCard(
  identity: AgentIdentity,
  options: {
    capabilities?: Partial<AgentCapabilities>;
    skills?: AgentSkill[];
    interfaces?: ProtocolBinding[];
    securitySchemes?: Record<string, SecurityScheme>;
    metadata?: Record<string, unknown>;
  } = {}
): AgentCard {
  return AgentCardSchema.parse({
    identity,
    capabilities: {
      streaming: options.capabilities?.streaming ?? false,
      pushNotifications: options.capabilities?.pushNotifications ?? false,
      extendedAgentCard: options.capabilities?.extendedAgentCard ?? false,
    },
    securitySchemes: options.securitySchemes,
    skills: options.skills ?? [],
    interfaces: options.interfaces ?? [],
    metadata: options.metadata,
  });
}

export function createAgentSkill(
  id: string,
  name: string,
  description: string,
  options: {
    tags?: string[];
    inputModes?: string[];
    outputModes?: string[];
  } = {}
): AgentSkill {
  return AgentSkillSchema.parse({
    id,
    name,
    description,
    tags: options.tags ?? [],
    inputModes: options.inputModes ?? ['text'],
    outputModes: options.outputModes ?? ['text'],
  });
}