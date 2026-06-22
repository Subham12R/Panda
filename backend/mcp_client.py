"""MCP (Model Context Protocol) client utilities for Panda."""

import asyncio
import contextlib
import logging

logger = logging.getLogger("pandas.mcp")


def _extract_text(result) -> str:
    if not result or not result.content:
        return ""
    parts = []
    for item in result.content:
        if hasattr(item, "text"):
            parts.append(str(item.text))
        elif hasattr(item, "data"):
            parts.append(f"[Binary: {getattr(item, 'mimeType', 'unknown')}]")
        else:
            parts.append(str(item))
    return "\n".join(p for p in parts if p)


@contextlib.asynccontextmanager
async def open_mcp_sessions(connections: list[dict]):
    """
    Opens sessions to all enabled MCP servers.

    Yields:
        (tool_list, tool_routing)
        - tool_list: tools in Anthropic API format (name, description, input_schema)
        - tool_routing: {qualified_name: (session, original_name)}
    """
    try:
        from mcp import ClientSession
        from mcp.client.sse import sse_client
        from mcp.client.stdio import stdio_client, StdioServerParameters
    except ImportError:
        logger.warning(
            "mcp package not installed — MCP tools unavailable. "
            "Run: pip install mcp"
        )
        yield [], {}
        return

    tool_list: list[dict] = []
    tool_routing: dict = {}

    async with contextlib.AsyncExitStack() as stack:
        for conn in connections:
            if not conn.get("is_enabled"):
                continue
            name = conn.get("name", "unknown")
            conn_type = conn.get("connection_type", "sse")
            try:
                if conn_type in ("sse", "http"):
                    url = conn.get("url", "").strip()
                    if not url:
                        logger.warning(f"MCP '{name}': no URL configured, skipping")
                        continue
                    headers: dict = {}
                    if conn.get("api_key"):
                        headers["Authorization"] = f"Bearer {conn['api_key']}"
                    read, write = await stack.enter_async_context(
                        sse_client(url, headers=headers)
                    )

                elif conn_type == "stdio":
                    cmd_str = conn.get("command", "").strip()
                    if not cmd_str:
                        logger.warning(f"MCP '{name}': no command configured, skipping")
                        continue
                    parts = cmd_str.split()
                    params = StdioServerParameters(command=parts[0], args=parts[1:])
                    read, write = await stack.enter_async_context(stdio_client(params))

                else:
                    logger.warning(f"MCP '{name}': unknown type '{conn_type}', skipping")
                    continue

                session = await stack.enter_async_context(ClientSession(read, write))
                await asyncio.wait_for(session.initialize(), timeout=10.0)
                tools_resp = await asyncio.wait_for(session.list_tools(), timeout=10.0)

                for tool in tools_resp.tools:
                    qname = tool.name
                    if qname in tool_routing:
                        qname = f"{name}_{tool.name}"
                    tool_routing[qname] = (session, tool.name)
                    tool_list.append({
                        "name": qname,
                        "description": tool.description or f"Tool from {name}",
                        "input_schema": (
                            dict(tool.inputSchema)
                            if tool.inputSchema
                            else {"type": "object", "properties": {}}
                        ),
                    })

                logger.info(
                    f"MCP '{name}': connected ({len(tools_resp.tools)} tools)"
                )

            except asyncio.TimeoutError:
                logger.warning(f"MCP '{name}': connection timed out, skipping")
            except Exception as e:
                logger.warning(f"MCP '{name}': failed to connect — {e}")

        yield tool_list, tool_routing


async def invoke_tool(
    tool_routing: dict,
    tool_name: str,
    tool_input: dict,
) -> str:
    """Invoke a named MCP tool and return its text result."""
    entry = tool_routing.get(tool_name)
    if not entry:
        return f"[Error: tool '{tool_name}' not found]"
    session, original_name = entry
    try:
        result = await asyncio.wait_for(
            session.call_tool(original_name, tool_input or {}),
            timeout=30.0,
        )
        return _extract_text(result) or "(tool returned no output)"
    except asyncio.TimeoutError:
        return f"[Error: tool '{tool_name}' timed out after 30s]"
    except Exception as e:
        return f"[Error invoking '{tool_name}': {e}]"
