# @pipeworx/omdb

OMDb MCP — IMDB-derived movie / TV / episode metadata. BYO key.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

- `search_titles(query, year?, type?, page?)`
- `get_by_title(title, year?, type?, plot?)`
- `get_by_imdb_id(imdb_id, plot?)`

## Auth

BYO only — free tier is 1,000 lookups/day per key. Pass `?_apiKey=<key>` on the gateway URL. Register at https://www.omdbapi.com/apikey.aspx.

## Data source

`https://www.omdbapi.com/` — `?apikey=` query param.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "omdb": {
      "url": "https://gateway.pipeworx.io/omdb/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Omdb data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
