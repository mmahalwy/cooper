/**
 * Streaming status — human-friendly progress messages during tool execution.
 * 
 * Maps tool names to user-facing status messages that stream alongside the response.
 */

// Known tool → status message mappings
const TOOL_STATUS_MAP: Record<string, string> = {
  // Composio tools
  'COMPOSIO_MULTI_EXECUTE_TOOL': 'Executing action...',
  'COMPOSIO_SEARCH_TOOLS': 'Searching available tools...',
  'COMPOSIO_GET_TOOL_SCHEMAS': 'Loading tool details...',
  // Built-in tools
  'save_knowledge': 'Saving to memory...',
  'create_skill': 'Creating new skill...',
  'list_skills': 'Checking skills...',
  'create_schedule': 'Setting up schedule...',
  'list_schedules': 'Checking schedules...',
  'update_schedule': 'Updating schedule...',
  'delete_schedule': 'Removing schedule...',
  'run_subtasks': 'Running parallel subtasks...',
  'execute_code': 'Executing code...',
  'install_packages': 'Installing packages...',
  // Web search
  'web_search': 'Searching the web...',
  'google_search': 'Searching Google...',
};

type ToolArgs = Record<string, unknown>;

function extractIntegrationService(args?: ToolArgs): string | null {
  const instruction = typeof args?.instruction === 'string' ? args.instruction : '';
  if (!instruction) return null;

  const lower = instruction.toLowerCase();
  const services = [
    'github',
    'slack',
    'google calendar',
    'calendar',
    'gmail',
    'notion',
    'linear',
    'jira',
    'posthog',
  ];

  const match = services.find((service) => lower.includes(service));
  if (!match) return null;

  return match
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get a human-friendly status message for a tool call.
 * Tries to be specific based on tool inputs when possible.
 */
export function getToolStatus(toolName: string, args?: ToolArgs): string {
  if (toolName === 'use_integration') {
    const service = extractIntegrationService(args);
    return service ? `Working with ${service}...` : 'Working with an integration...';
  }

  // For Composio multi-execute, try to extract the specific action
  if (toolName === 'COMPOSIO_MULTI_EXECUTE_TOOL' && args?.tools) {
    const actions = (args.tools as Array<{ tool_slug?: string }>)
      .map(t => t.tool_slug)
      .filter(Boolean);

    if (actions.length > 0) {
      const slug = actions[0]!;
      // Extract service name from slug (e.g., SLACK_SEND_MESSAGE → Slack)
      const service = slug.split('_')[0];
      const serviceName = service.charAt(0) + service.slice(1).toLowerCase();
      
      if (slug.match(/SEARCH|LIST|GET|FETCH|FIND/i)) {
        return `Searching ${serviceName}...`;
      }
      if (slug.match(/SEND|CREATE|POST|WRITE/i)) {
        return `Sending via ${serviceName}...`;
      }
      if (slug.match(/UPDATE|EDIT|MODIFY/i)) {
        return `Updating ${serviceName}...`;
      }
      return `Using ${serviceName}...`;
    }
  }

  return TOOL_STATUS_MAP[toolName] || `Using ${toolName}...`;
}

/**
 * Track tool execution steps and generate aggregate status.
 */
export class StatusTracker {
  private toolCalls: string[] = [];
  private startTime = Date.now();

  recordToolCall(toolName: string): void {
    this.toolCalls.push(toolName);
  }

  getStepCount(): number {
    return this.toolCalls.length;
  }

  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }

  getSummary(): string {
    const elapsed = Math.round(this.getElapsedMs() / 1000);
    return `Completed ${this.toolCalls.length} steps in ${elapsed}s`;
  }
}
