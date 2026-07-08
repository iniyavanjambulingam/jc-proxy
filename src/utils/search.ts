import { log } from './logger.js';
import { getConfig } from '../config.js';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function decodeDdgUrl(url: string): string {
  if (url.startsWith('//')) url = 'https:' + url;
  try {
    const parsed = new URL(url);
    const uddg = parsed.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
  } catch {}
  return url;
}

async function searchTavily(query: string, apiKey: string): Promise<SearchResult[]> {
  const url = 'https://api.tavily.com/search';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query: query,
      max_results: 5,
    }),
  });
  if (!res.ok) {
    throw new Error(`Tavily Search API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json() as any;
  return (data.results || []).slice(0, 5).map((r: any) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || '',
  }));
}

async function searchBrave(query: string, apiKey: string): Promise<SearchResult[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
  const res = await fetch(url, {
    headers: {
      'X-Subscription-Token': apiKey,
      'Accept': 'application/json',
    }
  });
  if (!res.ok) {
    throw new Error(`Brave Search API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json() as any;
  return (data.web?.results || []).slice(0, 5).map((r: any) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.description || '',
  }));
}

async function searchSearXNG(query: string, baseUrl: string): Promise<SearchResult[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/search?q=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`SearXNG API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json() as any;
  return (data.results || []).slice(0, 5).map((r: any) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || '',
  }));
}

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  };

  let html = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
      if (html.includes('result-link')) break;
    } catch (err: any) {
      if (attempt === 1) throw new Error(`DuckDuckGo scraping error: ${err.message}`);
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const results: SearchResult[] = [];

  // lite.duckduckgo.com uses <a rel="nofollow" class="result-link" href="...">Title</a>
  // followed by <td class="result-snippet">Snippet</td>
  const linkRegex = /<a[^>]*class="result-link"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

  const links: { url: string; title: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(html)) !== null) {
    links.push({
      url: decodeDdgUrl(m[1]),
      title: m[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
    });
    if (links.length >= 5) break;
  }

  const snippets: string[] = [];
  while ((m = snippetRegex.exec(html)) !== null) {
    snippets.push(m[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
    if (snippets.length >= 5) break;
  }

  for (let i = 0; i < links.length; i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] || '',
    });
  }

  return results;
}

export async function performWebSearch(query: string): Promise<string> {
  let braveKey = process.env.BRAVE_API_KEY;
  let searxngUrl = process.env.SEARXNG_URL;
  let tavilyKey = process.env.TAVILY_API_KEY;

  try {
    const cfg = getConfig();
    if (cfg.webSearch?.braveApiKey) braveKey = cfg.webSearch.braveApiKey;
    if (cfg.webSearch?.searxngUrl) searxngUrl = cfg.webSearch.searxngUrl;
    if (cfg.webSearch?.tavilyApiKey) tavilyKey = cfg.webSearch.tavilyApiKey;
  } catch {}
  
  const searchPromises: Promise<{ provider: string; results: SearchResult[] }>[] = [];

  if (tavilyKey) {
    searchPromises.push(
      searchTavily(query, tavilyKey)
        .then(res => ({ provider: 'Tavily', results: res }))
        .catch(err => {
          console.error('[web_search] Tavily failed:', err.message || err);
          return { provider: 'Tavily', results: [] };
        })
    );
  }
  if (braveKey) {
    searchPromises.push(
      searchBrave(query, braveKey)
        .then(res => ({ provider: 'Brave', results: res }))
        .catch(err => {
          console.error('[web_search] Brave failed:', err.message || err);
          return { provider: 'Brave', results: [] };
        })
    );
  }
  if (searxngUrl) {
    searchPromises.push(
      searchSearXNG(query, searxngUrl)
        .then(res => ({ provider: 'SearXNG', results: res }))
        .catch(err => {
          console.error('[web_search] SearXNG failed:', err.message || err);
          return { provider: 'SearXNG', results: [] };
        })
    );
  }

  // Always include DuckDuckGo as a baseline/fallback
  searchPromises.push(
    searchDuckDuckGo(query)
      .then(res => ({ provider: 'DuckDuckGo', results: res }))
      .catch(err => {
        console.error('[web_search] DuckDuckGo failed:', err.message || err);
        return { provider: 'DuckDuckGo', results: [] };
      })
  );

  const allSearchResults = await Promise.all(searchPromises);
  
  // Merge results, remove duplicates by URL
  const uniqueResults = new Map<string, { title: string; url: string; snippet: string; providers: string[] }>();
  
  for (const { provider, results } of allSearchResults) {
    for (const r of results) {
      if (!r.url) continue;
      const normalizedUrl = r.url.replace(/\/$/, '').toLowerCase();
      const existing = uniqueResults.get(normalizedUrl);
      if (existing) {
        if (!existing.providers.includes(provider)) {
          existing.providers.push(provider);
        }
        // Keep the longer snippet
        if (r.snippet.length > existing.snippet.length) {
          existing.snippet = r.snippet;
        }
      } else {
        uniqueResults.set(normalizedUrl, {
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          providers: [provider],
        });
      }
    }
  }

  const mergedResults = Array.from(uniqueResults.values()).slice(0, 8); // return top 8 unique results
  const activeProviders = allSearchResults.filter(x => x.results.length > 0).map(x => x.provider);

  console.log(`[web_search] Merged parallel results from: ${activeProviders.join(', ')}. Unique results found: ${mergedResults.length}`);

  if (mergedResults.length === 0) {
    return `No search results found for query: "${query}"`;
  }

  return mergedResults.map((r, idx) => 
    `[${idx + 1}] Title: ${r.title}\nURL: ${r.url}\nSources: ${r.providers.join(', ')}\nSnippet: ${r.snippet}\n`
  ).join('\n---\n\n');
}
