import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

const skillSchema = z.object({
  name: z.string().describe('Short name for the skill'),
  description: z.string().describe('What this skill does'),
  trigger: z.string().describe('When this skill should activate'),
  steps: z.array(z.object({
    action: z.string().describe('What this step does'),
    toolName: z.string().optional().describe('Tool to use, if any'),
    condition: z.string().optional().describe('When to execute this step'),
  })).describe('Ordered steps to execute'),
  tools: z.array(z.string()).describe('List of tool names this skill uses'),
  outputFormat: z.string().optional().describe('Expected output format'),
});

export type ParsedSkill = z.infer<typeof skillSchema>;

export async function parseSkillFromNL(
  userDescription: string,
  availableTools: string[]
): Promise<ParsedSkill> {
  const result = await generateObject({
    model: google('gemini-2.5-flash'),
    schema: skillSchema,
    prompt: `Parse the following natural language description into a structured skill definition.

Available tools: ${availableTools.join(', ') || 'none connected yet'}

User's description:
"${userDescription}"

Create a structured skill with a name, description, trigger condition, ordered steps (with tool names where applicable), and expected output format.`,
  });

  return result.object;
}
