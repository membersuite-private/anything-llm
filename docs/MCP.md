# MCP Tool Integration

GrowthZone Intelligence includes 39 reporting tools that connect to your Snowflake data warehouse via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). These tools let Claude query live business data — membership, revenue, events, and more — directly in conversation.

## How It Works

1. MCP servers are defined in a local config file
2. When the app starts, it connects to configured MCP servers
3. Tools appear in the **Agent Skills** page and the **Tools menu** in chat
4. When Claude needs data, it calls the appropriate tool
5. The tool queries Snowflake and returns structured results
6. Claude interprets the data and presents it in the conversation

## Configuration

MCP servers are configured in:

```
server/storage/plugins/anythingllm_mcp_servers.json
```

This file is **not committed** to version control — it contains local file paths to MCP server executables.

Example configuration:

```json
{
  "mcpServers": {
    "gz-reporting": {
      "command": "node",
      "args": ["/path/to/gz-reporting-mcp1/dist/index.js"],
      "env": {
        "SNOWFLAKE_ACCOUNT": "...",
        "SNOWFLAKE_USER": "...",
        "SNOWFLAKE_PASSWORD": "..."
      }
    }
  }
}
```

## Tool Categories

### Membership (7 tools)

| Tool | Description |
|------|-------------|
| `gz_report_members` | Member roster with status, email, membership details |
| `gz_report_churn` | Membership change history — joins, renewals, drops |
| `nccdp_cert_volumes` | Certification volumes by program |
| `nccdp_cert_retention` | Certification retention/churn rates |
| `nccdp_active_certs` | Active certification counts by program |
| `nccdp_active_groups` | Organizations with active certifications |
| `nccdp_professions` | Applicant profession distribution |

### Revenue & Invoicing (3 tools)

| Tool | Description |
|------|-------------|
| `gz_report_revenue` | Revenue by period with line-item detail |
| `gz_report_invoices` | Invoice and accounts receivable detail |
| `nccdp_sales_recon` | Sales reconciliation — revenue by program with refunds |

### Events (1 tool)

| Tool | Description |
|------|-------------|
| `gz_report_events` | Event listing with dates, status, attendance |

### Payments (1 tool)

| Tool | Description |
|------|-------------|
| `gz_report_payments` | Payment detail with type, gateway, processing fees |

### Financial (1 tool)

| Tool | Description |
|------|-------------|
| `gz_report_financial` | Monthly GL account rollup |

### Gong Analytics (5 tools)

| Tool | Description |
|------|-------------|
| Gong call listing | Recent calls with metadata |
| Gong call detail | Full call transcript and analysis |
| Gong deal tracking | Deal-level call activity |
| Gong team stats | Team call volume and metrics |
| Gong conversation intelligence | Topic and keyword analysis |

### GTM Pipeline (16 tools)

| Tool | Description |
|------|-------------|
| Pipeline stages | Deal flow by stage |
| Deal detail | Individual deal information |
| Forecast rollup | Revenue forecasting |
| Activity tracking | Sales activity metrics |
| ... and 12 more | Comprehensive GTM coverage |

### Utility (5 tools)

| Tool | Description |
|------|-------------|
| `gz_report_catalog` | List all available GZ reporting tools |
| `nccdp_report_catalog` | List all NCCDP reporting tools |
| `nccdp_kpi_summary` | All-in-one KPI dashboard |
| `nccdp_refunds` | Refund counts by program |
| `nccdp_care_settings` | Care setting distribution |

## Using Tools in Chat

Tools are available in two ways:

1. **Automatic** — When Claude determines it needs data to answer a question, it calls the appropriate tool. For example, asking "How many active members do we have?" triggers `gz_report_members`.

2. **Agent Skills page** — The admin UI shows all connected MCP tools under Settings → Agent Skills. You can enable/disable individual tools.

3. **Tools menu** — In the chat interface, the tools icon shows available tools that can be explicitly invoked.

## Adding New MCP Servers

1. Edit `server/storage/plugins/anythingllm_mcp_servers.json`
2. Add a new entry under `mcpServers` with the server command and arguments
3. Restart the application
4. New tools will appear in Agent Skills

Example — adding a HubSpot MCP server:

```json
{
  "mcpServers": {
    "gz-reporting": { "..." : "..." },
    "hubspot": {
      "command": "node",
      "args": ["/path/to/hubspot-mcp/index.js"],
      "env": {
        "HUBSPOT_API_KEY": "..."
      }
    }
  }
}
```

## Source Repository

The GZ reporting tools are maintained in the `gz-reporting-mcp1` repository. That repo contains the Snowflake queries, tool definitions, and MCP server implementation.

## Snowflake Connection

MCP tools connect to Snowflake using credentials passed via environment variables in the MCP server config. The connection is managed by the MCP server process — GrowthZone Intelligence itself does not connect to Snowflake directly.

Required Snowflake environment variables (set in MCP server config):
- `SNOWFLAKE_ACCOUNT`
- `SNOWFLAKE_USER`
- `SNOWFLAKE_PASSWORD`
- `SNOWFLAKE_DATABASE` (optional, defaults vary by tool)
- `SNOWFLAKE_WAREHOUSE` (optional)
