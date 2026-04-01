/**
 * GitHub API helpers — direct REST calls using the Composio-managed OAuth token.
 */

const GITHUB_API = 'https://api.github.com';

export async function getGitHubToken(orgId: string): Promise<string | null> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return null;

  try {
    const resp = await fetch(
      'https://backend.composio.dev/api/v1/connectedAccounts?showActiveOnly=true',
      { headers: { 'x-api-key': apiKey } }
    );
    const data = await resp.json();
    const githubAccount = (data.items || []).find(
      (item: any) => item.appName === 'github' && item.status === 'ACTIVE'
    );
    if (!githubAccount?.id) return null;

    const tokenResp = await fetch(
      `https://backend.composio.dev/api/v1/connectedAccounts/${githubAccount.id}`,
      { headers: { 'x-api-key': apiKey } }
    );
    const tokenData = await tokenResp.json();
    return tokenData?.connectionParams?.access_token || null;
  } catch (error) {
    console.error('[code/github] Failed to get GitHub token:', error);
    return null;
  }
}

async function githubFetch(token: string, path: string): Promise<any> {
  const resp = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Cooper-AI',
    },
  });
  if (!resp.ok) {
    throw new Error(`GitHub API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

export async function getRepoTree(
  token: string,
  owner: string,
  repo: string,
  path: string = ''
): Promise<Array<{ name: string; path: string; type: 'file' | 'dir'; size?: number }>> {
  const apiPath = path
    ? `/repos/${owner}/${repo}/contents/${path}`
    : `/repos/${owner}/${repo}/contents`;

  const data = await githubFetch(token, apiPath);
  const items = Array.isArray(data) ? data : [];

  return items.map((item: any) => ({
    name: item.name,
    path: item.path,
    type: item.type === 'dir' ? 'dir' : 'file',
    size: item.size,
  }));
}

export async function getFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<{ content: string; lines: number }> {
  const query = ref ? `?ref=${ref}` : '';
  const data = await githubFetch(token, `/repos/${owner}/${repo}/contents/${path}${query}`);

  if (data.type !== 'file' || !data.content) {
    throw new Error(`${path} is not a file`);
  }

  const content = Buffer.from(data.content, 'base64').toString('utf-8');
  const lines = content.split('\n').length;

  const numbered = content
    .split('\n')
    .map((line, i) => `${String(i + 1).padStart(4)} | ${line}`)
    .join('\n');

  return { content: numbered, lines };
}

export async function searchCode(
  token: string,
  owner: string,
  repo: string,
  query: string
): Promise<Array<{ path: string; matches: string[] }>> {
  const encoded = encodeURIComponent(`${query} repo:${owner}/${repo}`);
  const data = await githubFetch(token, `/search/code?q=${encoded}&per_page=10`);

  return (data.items || []).map((item: any) => ({
    path: item.path,
    matches: (item.text_matches || []).map((m: any) => m.fragment).filter(Boolean),
  }));
}

export async function createPR(
  token: string,
  owner: string,
  repo: string,
  head: string,
  base: string,
  title: string,
  body: string
): Promise<{ url: string; number: number }> {
  const resp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'Cooper-AI',
    },
    body: JSON.stringify({ title, body, head, base }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to create PR: ${resp.status} ${err}`);
  }

  const data = await resp.json();
  return { url: data.html_url, number: data.number };
}

export async function getDefaultBranch(
  token: string,
  owner: string,
  repo: string
): Promise<string> {
  const data = await githubFetch(token, `/repos/${owner}/${repo}`);
  return data.default_branch || 'main';
}
