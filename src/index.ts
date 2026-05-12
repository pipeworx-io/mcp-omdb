interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * OMDb MCP — IMDB-derived movie / TV / episode data (BYO key)
 *
 * Adds IMDB ratings + cross-reference IDs that TVMaze / `movies` don't surface
 * cleanly. Free tier: 1,000 daily lookups per key.
 *
 * API: https://www.omdbapi.com
 * Auth: ?apikey= query param. BYO (1k/day is tight for shared platform use).
 *
 * Tools:
 * - search_titles:    keyword search (returns up to 10 per page)
 * - get_by_title:     single title by name + optional year/type
 * - get_by_imdb_id:   single title by IMDB ID (e.g., "tt0111161")
 */


const BASE_URL = 'https://www.omdbapi.com';

const tools: McpToolExport['tools'] = [
  {
    name: 'search_titles',
    description:
      'Search OMDb (IMDB-derived) by keyword. Returns up to 10 results per page with title, year, IMDB ID, type, poster.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Title keyword' },
        year: { type: 'number', description: 'Restrict to a release year' },
        type: { type: 'string', description: 'movie | series | episode', enum: ['movie', 'series', 'episode'] },
        page: { type: 'number', description: '1-100 (default 1)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_by_title',
    description:
      'Fetch a single title by exact name. Returns full record: rated, released, runtime, director, writer, cast, plot, awards, ratings (IMDB / RT / Metacritic), box office, IMDB ID, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Exact title' },
        year: { type: 'number', description: 'Optional release-year filter' },
        type: { type: 'string', description: 'movie | series | episode', enum: ['movie', 'series', 'episode'] },
        plot: { type: 'string', description: 'short | full (default short)', enum: ['short', 'full'] },
      },
      required: ['title'],
    },
  },
  {
    name: 'get_by_imdb_id',
    description: 'Fetch a single title by its IMDB ID (e.g., "tt0111161" = The Shawshank Redemption). Returns full record.',
    inputSchema: {
      type: 'object',
      properties: {
        imdb_id: { type: 'string', description: 'IMDB ID with leading "tt"' },
        plot: { type: 'string', description: 'short | full (default short)', enum: ['short', 'full'] },
      },
      required: ['imdb_id'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = (args._apiKey as string | undefined)?.trim();
  if (!apiKey) {
    throw new Error(
      'OMDb is BYO-only. Pass ?_apiKey=<key> on the gateway URL. Free tier 1,000 lookups/day — register at https://www.omdbapi.com/apikey.aspx.',
    );
  }
  switch (name) {
    case 'search_titles':
      return search(apiKey, args);
    case 'get_by_title':
      return getByTitle(apiKey, args);
    case 'get_by_imdb_id':
      return getByImdbId(apiKey, args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function reqStr(args: Record<string, unknown>, key: string, example: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`Required argument "${key}" is missing or empty. Pass a string like ${example}.`);
  }
  return v;
}

async function omdbGet<T>(params: URLSearchParams): Promise<T> {
  const res = await fetch(`${BASE_URL}/?${params}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OMDb error: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { Response?: string; Error?: string };
  if (data.Response === 'False') {
    throw new Error(`OMDb: ${data.Error ?? 'unknown error'}`);
  }
  return data as T;
}

interface OmdbSearchHit {
  Title?: string;
  Year?: string;
  imdbID?: string;
  Type?: string;
  Poster?: string;
}

async function search(apiKey: string, args: Record<string, unknown>) {
  const query = reqStr(args, 'query', '"inception"');
  const params = new URLSearchParams({ apikey: apiKey, s: query });
  if (args.year) params.set('y', String(args.year));
  if (args.type) params.set('type', String(args.type));
  if (args.page) params.set('page', String(args.page));

  const data = await omdbGet<{ Search?: OmdbSearchHit[]; totalResults?: string }>(params);
  return {
    query,
    total: data.totalResults ? Number(data.totalResults) : 0,
    returned: data.Search?.length ?? 0,
    results: (data.Search ?? []).map((r) => ({
      title: r.Title ?? null,
      year: r.Year ?? null,
      imdb_id: r.imdbID ?? null,
      type: r.Type ?? null,
      poster: r.Poster && r.Poster !== 'N/A' ? r.Poster : null,
    })),
  };
}

interface OmdbDetail {
  Title?: string;
  Year?: string;
  Rated?: string;
  Released?: string;
  Runtime?: string;
  Genre?: string;
  Director?: string;
  Writer?: string;
  Actors?: string;
  Plot?: string;
  Language?: string;
  Country?: string;
  Awards?: string;
  Poster?: string;
  Ratings?: { Source?: string; Value?: string }[];
  Metascore?: string;
  imdbRating?: string;
  imdbVotes?: string;
  imdbID?: string;
  Type?: string;
  DVD?: string;
  BoxOffice?: string;
  Production?: string;
  Website?: string;
  totalSeasons?: string;
}

function normalizeDetail(d: OmdbDetail) {
  const naOr = (v?: string) => (v && v !== 'N/A' ? v : null);
  return {
    title: naOr(d.Title),
    year: naOr(d.Year),
    rated: naOr(d.Rated),
    released: naOr(d.Released),
    runtime: naOr(d.Runtime),
    genres: d.Genre ? d.Genre.split(',').map((g) => g.trim()) : [],
    director: naOr(d.Director),
    writer: naOr(d.Writer),
    actors: d.Actors ? d.Actors.split(',').map((a) => a.trim()) : [],
    plot: naOr(d.Plot),
    language: naOr(d.Language),
    country: naOr(d.Country),
    awards: naOr(d.Awards),
    poster: naOr(d.Poster),
    ratings: (d.Ratings ?? []).map((r) => ({ source: r.Source ?? null, value: r.Value ?? null })),
    metascore: d.Metascore && d.Metascore !== 'N/A' ? Number(d.Metascore) : null,
    imdb_rating: d.imdbRating && d.imdbRating !== 'N/A' ? Number(d.imdbRating) : null,
    imdb_votes: d.imdbVotes && d.imdbVotes !== 'N/A' ? Number(d.imdbVotes.replace(/,/g, '')) : null,
    imdb_id: naOr(d.imdbID),
    type: naOr(d.Type),
    box_office: naOr(d.BoxOffice),
    production: naOr(d.Production),
    total_seasons: d.totalSeasons && d.totalSeasons !== 'N/A' ? Number(d.totalSeasons) : null,
    imdb_url: d.imdbID ? `https://www.imdb.com/title/${d.imdbID}/` : null,
  };
}

async function getByTitle(apiKey: string, args: Record<string, unknown>) {
  const title = reqStr(args, 'title', '"the godfather"');
  const params = new URLSearchParams({ apikey: apiKey, t: title });
  if (args.year) params.set('y', String(args.year));
  if (args.type) params.set('type', String(args.type));
  if (args.plot) params.set('plot', String(args.plot));

  const data = await omdbGet<OmdbDetail>(params);
  return normalizeDetail(data);
}

async function getByImdbId(apiKey: string, args: Record<string, unknown>) {
  const imdbId = reqStr(args, 'imdb_id', '"tt0111161"');
  const params = new URLSearchParams({ apikey: apiKey, i: imdbId });
  if (args.plot) params.set('plot', String(args.plot));

  const data = await omdbGet<OmdbDetail>(params);
  return normalizeDetail(data);
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
