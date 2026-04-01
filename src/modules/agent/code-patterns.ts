/**
 * Code patterns for common tasks — injected into system prompt
 * when the user's request matches certain patterns.
 */

export const CODE_PATTERNS: Record<string, string> = {
  'data_analysis': `
# Example: Analyze data
import pandas as pd
data = pd.read_csv('data.csv')  # or create DataFrame from provided data
print(data.describe())
print(data.groupby('category').agg({'value': ['mean', 'sum', 'count']}))`,

  'chart': `
# Example: Create a chart
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')
plt.figure(figsize=(10, 6))
plt.bar(categories, values)
plt.title('Title')
plt.savefig('chart.png', dpi=150, bbox_inches='tight')
print('Chart saved to chart.png')`,

  'web_request': `
# Example: Fetch data from an API
import requests
response = requests.get('https://api.example.com/data')
data = response.json()
print(json.dumps(data, indent=2))`,
};

export function getRelevantPatterns(userMessage: string): string[] {
  const patterns: string[] = [];
  const lower = userMessage.toLowerCase();

  if (lower.match(/chart|graph|plot|visualiz/)) patterns.push('chart');
  if (lower.match(/data|analyz|csv|spreadsheet|numbers/)) patterns.push('data_analysis');
  if (lower.match(/api|fetch|scrape|download|url|http/)) patterns.push('web_request');

  return patterns;
}
