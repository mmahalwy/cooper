import 'server-only';
import { Composio } from '@composio/core';
import type { Integration } from './integrations-catalog';

let cachedIntegrations: Integration[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Map Composio category slugs/names to our fixed UI categories. */
const CATEGORY_MAP: Record<string, string> = {
  'analytics': 'Analytics',
  'business-intelligence': 'Analytics',
  'crm': 'CRM',
  'sales-&-crm': 'CRM',
  'contact-management': 'CRM',
  'communication': 'Communication',
  'team-chat': 'Communication',
  'email': 'Communication',
  'phone-&-sms': 'Communication',
  'developer-tools': 'Development',
  'developer-tools-&-devops': 'Development',
  'databases': 'Development',
  'project-management': 'Project Management',
  'productivity-&-project-management': 'Project Management',
  'task-management': 'Project Management',
  'marketing': 'Marketing',
  'marketing-automation': 'Marketing',
  'social-media-marketing': 'Marketing',
  'payment-processing': 'Finance',
  'accounting': 'Finance',
  'taxes': 'Finance',
  'hr-talent-&-recruitment': 'HR',
  'human-resources': 'HR',
  'productivity': 'Productivity',
  'notes': 'Productivity',
  'documents': 'Productivity',
  'spreadsheets': 'Productivity',
  'calendar': 'Productivity',
  'file-management-&-storage': 'Productivity',
};

function mapCategory(rawName: string, slug: string): string {
  return CATEGORY_MAP[slug] ?? CATEGORY_MAP[rawName.toLowerCase()] ?? 'Other';
}

/**
 * Fetch all available integrations from Composio's toolkit catalog.
 * Results are cached in-memory for 10 minutes.
 */
export async function getIntegrations(): Promise<Integration[]> {
  if (cachedIntegrations && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedIntegrations;
  }

  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    console.warn('[integrations-catalog] COMPOSIO_API_KEY not set');
    return cachedIntegrations ?? [];
  }

  try {
    const composio = new Composio({ apiKey });
    const toolkits = await composio.toolkits.get({});

    cachedIntegrations = toolkits
      .filter((tk) => !tk.isLocalToolkit)
      .map((tk) => {
        const firstCat = tk.meta.categories?.[0];
        const categoryName = firstCat
          ? mapCategory(firstCat.name, firstCat.slug)
          : 'Other';
        return {
          id: tk.slug,
          name: tk.name,
          description: tk.meta.description ?? '',
          category: categoryName,
          logo: tk.meta.logo,
          composioApp: tk.slug,
          toolCount: tk.meta.toolsCount ?? 0,
          authSchemes: tk.authSchemes,
        };
      });

    cacheTimestamp = Date.now();
    console.log(`[integrations-catalog] Loaded ${cachedIntegrations.length} integrations from Composio`);
    return cachedIntegrations;
  } catch (error) {
    console.error('[integrations-catalog] Failed to fetch from Composio:', error);
    return cachedIntegrations ?? [];
  }
}
