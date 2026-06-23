import asyncio
import json
import logging
import os
import uuid

from dotenv import load_dotenv

load_dotenv()  # must run before local imports so env vars (SERPER_API_KEY etc.) are available

from fastapi import FastAPI, File, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from context_manager import build_context, summarize_overflow
from database import (
    create_folder,
    create_mcp_connection,
    create_provider,
    create_session,
    delete_folder,
    delete_mcp_connection,
    delete_provider,
    delete_session,
    get_all_user_settings,
    get_chunks_for_session,
    get_folders,
    get_mcp_connections,
    get_mcp_connections_with_keys,
    get_provider_config,
    get_providers,
    get_session,
    get_session_messages,
    get_sessions,
    get_usage_stats,
    get_user_setting,
    init_db,
    log_usage,
    mask_key,
    rename_folder,
    rename_session,
    save_message,
    set_session_folder,
    set_user_setting,
    toggle_mcp_connection,
    toggle_pin_session,
    update_mcp_connection,
    update_provider,
)
from mcp_client import invoke_tool, open_mcp_sessions
from providers.registry import get_provider
from research_agent import run_research_agent
from file_processor import SUPPORTED_EXTENSIONS, chunk_text, extract_text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pandas")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

backend_ready = False

@app.on_event("startup")
async def startup_event():
    global backend_ready
    logger.info("Initializing database...")
    init_db()
    backend_ready = True
    # Run keyring migration in background so it never blocks the health endpoint
    from database import _migrate_from_keyring
    asyncio.create_task(asyncio.to_thread(_migrate_from_keyring))


class CreateSessionRequest(BaseModel):
    id: str
    title: str


class RenameSessionRequest(BaseModel):
    title: str


class ProviderRequest(BaseModel):
    name: str
    provider_type: str
    model: str
    base_url: str = ""
    api_key: str = ""
    is_active: bool = False


class McpConnectionRequest(BaseModel):
    name: str
    connection_type: str = "sse"  # sse | http | stdio
    url: str = ""
    command: str = ""
    api_key: str = ""
    is_enabled: bool = True


@app.get("/api/sessions")
def list_sessions():
    try:
        return get_sessions()
    except Exception as e:
        logger.error(f"Error listing sessions: {e}")
        return {"error": str(e)}


@app.post("/api/sessions")
def api_create_session(req: CreateSessionRequest):
    try:
        create_session(req.id, req.title)
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Error creating session: {e}")
        return {"error": str(e)}


@app.put("/api/sessions/{session_id}")
def api_rename_session(session_id: str, req: RenameSessionRequest):
    try:
        rename_session(session_id, req.title)
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Error renaming session: {e}")
        return {"error": str(e)}


@app.delete("/api/sessions/{session_id}")
def api_delete_session(session_id: str):
    try:
        delete_session(session_id)
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Error deleting session: {e}")
        return {"error": str(e)}


@app.get("/api/sessions/{session_id}/messages")
def list_session_messages(session_id: str):
    try:
        return get_session_messages(session_id)
    except Exception as e:
        logger.error(f"Error loading session messages: {e}")
        return {"error": str(e)}


@app.put("/api/sessions/{session_id}/pin")
def api_pin_session(session_id: str):
    try:
        pinned = toggle_pin_session(session_id)
        return {"pinned": pinned}
    except Exception as e:
        return {"error": str(e)}


@app.put("/api/sessions/{session_id}/folder")
async def api_set_session_folder(session_id: str, req: Request):
    try:
        body = await req.json()
        set_session_folder(session_id, body.get("folder_id"))
        return {"status": "ok"}
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/folders")
def api_get_folders():
    try:
        return get_folders()
    except Exception as e:
        return {"error": str(e)}


@app.post("/api/folders")
async def api_create_folder(req: Request):
    try:
        body = await req.json()
        folder_id = str(uuid.uuid4())
        create_folder(folder_id, body.get("name", "New Folder"))
        return {"status": "ok", "id": folder_id, "name": body.get("name", "New Folder")}
    except Exception as e:
        return {"error": str(e)}


@app.put("/api/folders/{folder_id}")
async def api_rename_folder(folder_id: str, req: Request):
    try:
        body = await req.json()
        rename_folder(folder_id, body.get("name", ""))
        return {"status": "ok"}
    except Exception as e:
        return {"error": str(e)}


@app.delete("/api/folders/{folder_id}")
def api_delete_folder(folder_id: str):
    try:
        delete_folder(folder_id)
        return {"status": "ok"}
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/settings/user")
def api_get_user_settings():
    try:
        s = get_all_user_settings()
        return {
            "name": s.get("name", ""),
            "email": s.get("email", ""),
            "avatar": s.get("avatar", ""),
        }
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/settings/integrations")
def api_get_integrations():
    try:
        serper_key = get_user_setting("serper_api_key", "")
        return {
            "serper_configured": bool(serper_key),
            "serper_api_key_masked": mask_key(serper_key),
        }
    except Exception as e:
        return {"error": str(e)}


@app.put("/api/settings/integrations")
async def api_update_integrations(req: Request):
    try:
        body = await req.json()
        key = body.get("serper_api_key", "").strip()
        if key == "__clear__":
            set_user_setting("serper_api_key", "")
        elif key:
            set_user_setting("serper_api_key", key)
        return {"status": "ok"}
    except Exception as e:
        return {"error": str(e)}


@app.put("/api/settings/user")
async def api_update_user_settings(req: Request):
    try:
        body = await req.json()
        for key in ("name", "email", "avatar"):
            if key in body:
                set_user_setting(key, body[key])
        return {"status": "ok"}
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/stats/usage")
def api_get_usage_stats():
    try:
        return get_usage_stats()
    except Exception as e:
        return {"error": str(e)}


@app.post("/api/sessions/{session_id}/upload")
async def upload_file(session_id: str, file: UploadFile = File(...)):
    from database import save_chunk
    from embedder import embed
    filename = file.filename or "file"
    ext = ("." + filename.lower().rsplit(".", 1)[-1]) if "." in filename else ""
    if ext not in SUPPORTED_EXTENSIONS:
        return {"error": f"Unsupported type '{ext}'. Allowed: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"}
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        return {"error": "File too large (max 20 MB)"}
    try:
        text = extract_text(filename, data)
        if not text.strip():
            return {"error": "No text could be extracted from this file"}
        chunks = chunk_text(text)
        for chunk in chunks:
            emb = embed(chunk)
            save_chunk(str(uuid.uuid4()), session_id, chunk, emb, source=filename)
        logger.info(f"Indexed {filename}: {len(chunks)} chunks for session {session_id}")
        return {"filename": filename, "chunks": len(chunks)}
    except ValueError as e:
        return {"error": str(e)}
    except Exception as e:
        logger.error(f"File upload error: {e}")
        return {"error": "Failed to process file"}


@app.get("/api/sessions/{session_id}/files")
def list_session_files(session_id: str):
    from database import get_session_sources
    try:
        return get_session_sources(session_id)
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/providers")
def api_get_providers():
    try:
        return get_providers()
    except Exception as e:
        logger.error(f"Error loading providers: {e}")
        return {"error": str(e)}


@app.post("/api/providers")
def api_create_provider(req: ProviderRequest):
    try:
        provider_id = str(uuid.uuid4())
        create_provider(provider_id, req.dict())
        return {"status": "ok", "id": provider_id}
    except Exception as e:
        logger.error(f"Error creating provider: {e}")
        return {"error": str(e)}


@app.put("/api/providers/{provider_id}")
def api_update_provider(provider_id: str, req: ProviderRequest):
    try:
        update_provider(provider_id, req.dict())
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Error updating provider: {e}")
        return {"error": str(e)}


@app.delete("/api/providers/{provider_id}")
def api_delete_provider(provider_id: str):
    try:
        delete_provider(provider_id)
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Error deleting provider: {e}")
        return {"error": str(e)}


@app.get("/api/mcp-connections")
def api_get_mcp_connections():
    try:
        return get_mcp_connections()
    except Exception as e:
        return {"error": str(e)}


@app.post("/api/mcp-connections")
def api_create_mcp_connection(req: McpConnectionRequest):
    try:
        connection_id = str(uuid.uuid4())
        create_mcp_connection(connection_id, req.dict())
        return {"status": "ok", "id": connection_id}
    except Exception as e:
        return {"error": str(e)}


@app.put("/api/mcp-connections/{connection_id}")
def api_update_mcp_connection(connection_id: str, req: McpConnectionRequest):
    try:
        update_mcp_connection(connection_id, req.dict())
        return {"status": "ok"}
    except Exception as e:
        return {"error": str(e)}


@app.put("/api/mcp-connections/{connection_id}/toggle")
def api_toggle_mcp_connection(connection_id: str):
    try:
        is_enabled = toggle_mcp_connection(connection_id)
        return {"is_enabled": is_enabled}
    except Exception as e:
        return {"error": str(e)}


@app.delete("/api/mcp-connections/{connection_id}")
def api_delete_mcp_connection(connection_id: str):
    try:
        delete_mcp_connection(connection_id)
        return {"status": "ok"}
    except Exception as e:
        return {"error": str(e)}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "ready": backend_ready,
    }


def parse_mode(user_text: str):
    if user_text.startswith("[Search:") and user_text.endswith("]"):
        return "research", user_text[8:-1].strip()
    if user_text.startswith("[Plan:") and user_text.endswith("]"):
        return "plan", user_text[6:-1].strip()
    if user_text.startswith("[Think:") and user_text.endswith("]"):
        return "think", user_text[7:-1].strip()
    return "chat", user_text


def build_system_prompt(mode: str, existing_summary: str):
    system_content = (
        "You are Pandas AI, a helpful desktop assistant.\n\n"
        "CRITICAL: Absolutely NO emojis or emoticons in any response. Never use 😊, 🙂, 🎉, ✅, ❌, or any other emoji.\n"
        "STRICT FORMATTING INSTRUCTIONS:\n"
        "- Do not use emojis under any circumstances.\n"
        "- Do not use em dashes under any circumstances.\n"
        "Use clear sections and short paragraphs when the answer is complex.\n\n"
        "When indexed file content is provided below in the 'Relevant context' section, "
        "use it to answer the user's questions about those files. "
        "Do not say you cannot access files — the file content is right here in the context."
    )

    if mode == "research":
        system_content += (
            "\n\nRESEARCH MODE:\n"
            "Plan the answer, identify what information is needed, state any limits, "
            "then synthesize a structured result. If you do not have live source access, "
            "say so and separate known facts from assumptions."
        )
    elif mode == "agent":
        system_content += (
            "\n\nAGENT MODE:\n"
            "Break the task into visible steps, do the useful work available in this chat, "
            "and finish with a concise result and next action."
        )
    elif mode == "think":
        system_content += (
            "\n\nDEEP THINK MODE:\n"
            "Reason carefully, but keep private chain-of-thought private. Provide a brief "
            "decision trace with assumptions, approach, and conclusion."
        )

    if existing_summary:
        system_content += f"\n\nSummary of older conversation:\n{existing_summary}"

    return system_content


def workflow_steps(mode: str):
    if mode == "research":
        return [
            "Planning research path",
            "Gathering available context",
            "Checking evidence gaps",
            "Synthesizing structured answer",
        ]
    if mode == "agent":
        return [
            "Understanding request",
            "Choosing next action",
            "Executing available step",
            "Preparing result",
        ]
    if mode == "think":
        return [
            "Parsing the problem",
            "Reviewing conversation context",
            "Weighting tradeoffs",
            "Writing final answer",
        ]
    return [
        "Reading conversation context",
        "Gathering relevant information",
        "Generating response",
    ]


async def _run_with_mcp(
    websocket: WebSocket,
    session_id: str,
    request_id: str,
    provider_config: dict,
    prompt_context: list[dict],
    steps: list[str],
) -> str | None:
    """
    Runs the agentic MCP tool loop.
    Returns the final response text, or None to fall through to regular generation.
    """
    connections = get_mcp_connections_with_keys()
    if not connections:
        return None

    provider_type = provider_config.get("provider_type", "")

    async with open_mcp_sessions(connections) as (tool_list, tool_routing):
        if not tool_list:
            return None

        system_prompt = next(
            (m["content"] for m in prompt_context if m["role"] == "system"), ""
        )
        messages = [m for m in prompt_context if m["role"] != "system"]
        tool_steps = list(steps)
        full_response = ""
        MAX_ITER = 10

        async def _send_tool_workflow(active_step: str) -> None:
            nonlocal tool_steps
            tool_steps = tool_steps + [active_step]
            await websocket.send_json({
                "type": "workflow",
                "session_id": session_id,
                "request_id": request_id,
                "steps": [
                    {
                        "id": f"step-{i}",
                        "text": s,
                        "status": "running" if i == len(tool_steps) - 1 else "completed",
                    }
                    for i, s in enumerate(tool_steps)
                ],
            })

        # ── Anthropic path ─────────────────────────────────────────────────────
        if provider_type == "anthropic":
            import anthropic as _ant
            client = _ant.AsyncAnthropic(api_key=provider_config.get("api_key", ""))
            model_name = provider_config.get("model", "claude-sonnet-4-6")

            for _ in range(MAX_ITER):
                response = await client.messages.create(
                    model=model_name,
                    max_tokens=4096,
                    system=system_prompt,
                    messages=messages,
                    tools=tool_list,
                )

                if response.stop_reason == "tool_use":
                    messages.append({"role": "assistant", "content": response.content})
                    tool_results = []
                    for block in response.content:
                        if block.type != "tool_use":
                            continue
                        await _send_tool_workflow(f"Tool: {block.name}")
                        result_text = await invoke_tool(
                            tool_routing, block.name, dict(block.input)
                        )
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": result_text,
                        })
                    messages.append({"role": "user", "content": tool_results})

                else:
                    for block in response.content:
                        text = getattr(block, "text", None)
                        if text:
                            full_response += text
                            await websocket.send_json({
                                "type": "delta",
                                "text": text,
                                "session_id": session_id,
                                "request_id": request_id,
                            })
                    break

        # ── OpenAI-compatible path ─────────────────────────────────────────────
        elif provider_type in ("openai_compatible", "ollama"):
            from openai import AsyncOpenAI
            import json as _json

            client_oa = AsyncOpenAI(
                api_key=provider_config.get("api_key") or "not-needed",
                base_url=provider_config.get("base_url", ""),
            )
            model_name = provider_config.get("model", "")
            openai_tools = [
                {
                    "type": "function",
                    "function": {
                        "name": t["name"],
                        "description": t["description"],
                        "parameters": t["input_schema"],
                    },
                }
                for t in tool_list
            ]

            for _ in range(MAX_ITER):
                response_oa = await client_oa.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    tools=openai_tools,
                    tool_choice="auto",
                    max_tokens=4096,
                )
                choice = response_oa.choices[0]

                if choice.finish_reason == "tool_calls" and choice.message.tool_calls:
                    messages.append(choice.message.model_dump())
                    for tc in choice.message.tool_calls:
                        try:
                            tool_input = _json.loads(tc.function.arguments or "{}")
                        except Exception:
                            tool_input = {}
                        await _send_tool_workflow(f"Tool: {tc.function.name}")
                        result_text = await invoke_tool(
                            tool_routing, tc.function.name, tool_input
                        )
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tc.id,
                            "content": result_text,
                        })
                else:
                    text = choice.message.content or ""
                    full_response = text
                    if text:
                        await websocket.send_json({
                            "type": "delta",
                            "text": text,
                            "session_id": session_id,
                            "request_id": request_id,
                        })
                    break

        else:
            logger.info(
                f"MCP: provider type '{provider_type}' does not support tool calling"
            )
            return None

        return full_response or None


async def run_generation(websocket: WebSocket, payload: dict):
    user_text = payload.get("text", "").strip()
    model = payload.get("model")
    provider_id = payload.get("provider_id")
    session_id = payload.get("session_id") or str(uuid.uuid4())
    request_id = payload.get("request_id") or str(uuid.uuid4())

    if not user_text:
        return

    mode, clean_text = parse_mode(user_text)
    if not get_session(session_id):
        create_session(session_id, "New Chat")

    save_message(str(uuid.uuid4()), session_id, "user", clean_text)
    await websocket.send_json({
        "type": "accepted",
        "session_id": session_id,
        "request_id": request_id,
        "mode": mode,
    })

    db_messages = get_session_messages(session_id)
    session_data = get_session(session_id)
    existing_summary = session_data["summary"] if session_data else ""
    active_messages, overflow_messages = build_context(db_messages, existing_summary)
    provider_config = get_provider_config(provider_id)
    provider = get_provider(model, provider_config)

    if mode in ("plan", "research"):
        try:
            await run_research_agent(websocket, session_id, request_id, clean_text, provider)
        except asyncio.CancelledError:
            await websocket.send_json({"type": "stopped", "session_id": session_id, "request_id": request_id})
            raise
        except Exception as e:
            logger.error(f"Research agent error: {e}")
            await websocket.send_json({"type": "error", "message": str(e), "session_id": session_id, "request_id": request_id})
        return

    rag_context = ""
    if mode in ("chat", "think"):
        try:
            from embedder import cosine_similarity, embed
            query_emb = embed(clean_text)
            raw_chunks = get_chunks_for_session(session_id)
            if raw_chunks:
                scored = [
                    (cosine_similarity(query_emb, c["embedding"]), c["content"])
                    for c in raw_chunks
                    if c["embedding"]
                ]
                top_chunks = [c for _, c in sorted(scored, reverse=True)[:5]]
                if top_chunks:
                    sources = sorted(set(c["source"] for c in raw_chunks if c.get("source")))
                    header = f"Indexed files: {', '.join(sources)}\n\n" if sources else ""
                    rag_context = header + "Relevant context from this session:\n\n" + "\n\n---\n\n".join(top_chunks)
        except Exception as e:
            logger.warning(f"RAG retrieval skipped: {e}")

    steps = workflow_steps(mode)
    for index, step in enumerate(steps):
        await websocket.send_json({
            "type": "workflow",
            "session_id": session_id,
            "request_id": request_id,
            "steps": [
                {
                    "id": f"step-{i}",
                    "text": item,
                    "status": "completed" if i < index else "running" if i == index else "pending",
                }
                for i, item in enumerate(steps)
            ],
        })
        if index < len(steps) - 1:
            await asyncio.sleep(0.15)

    system_prompt = build_system_prompt(mode, existing_summary)
    if rag_context:
        system_prompt += f"\n\n{rag_context}"

    prompt_context = [{"role": "system", "content": system_prompt}] + [
        {"role": m["role"], "content": m["content"]}
        for m in active_messages
    ]

    # ── MCP agentic tool loop ──────────────────────────────────────────────────
    try:
        mcp_response = await _run_with_mcp(
            websocket, session_id, request_id,
            provider_config or {}, prompt_context, steps,
        )
    except asyncio.CancelledError:
        await websocket.send_json({"type": "stopped", "session_id": session_id, "request_id": request_id})
        raise
    except Exception as e:
        logger.warning(f"MCP tool loop error, falling back to regular generation: {e}")
        mcp_response = None

    if mcp_response is not None:
        save_message(str(uuid.uuid4()), session_id, "assistant", mcp_response)
        input_chars = sum(len(m.get("content", "")) for m in prompt_context)
        try:
            log_usage(str(uuid.uuid4()), session_id,
                      getattr(provider, "model", "unknown"),
                      (provider_config or {}).get("provider_type", "unknown"),
                      input_chars, len(mcp_response))
        except Exception:
            pass
        await websocket.send_json({
            "type": "done",
            "session_id": session_id,
            "request_id": request_id,
            "steps": [{"id": f"step-{i}", "text": item, "status": "completed"} for i, item in enumerate(steps)],
        })
        if overflow_messages:
            asyncio.create_task(summarize_overflow(session_id, existing_summary, overflow_messages))
        return

    # ── Regular streaming generation ───────────────────────────────────────────
    full_response = ""
    try:
        async for chunk in provider.generate(prompt_context):
            full_response += chunk
            await websocket.send_json({
                "type": "delta",
                "text": chunk,
                "session_id": session_id,
                "request_id": request_id,
            })

        save_message(str(uuid.uuid4()), session_id, "assistant", full_response)

        # Track usage (chars; UI converts to ~tokens at 4 chars/token)
        input_chars = sum(len(m.get("content", "")) for m in prompt_context)
        try:
            log_usage(str(uuid.uuid4()), session_id, provider.model, provider_config.get("provider_type", "unknown") if provider_config else "unknown", input_chars, len(full_response))
        except Exception:
            pass

        await websocket.send_json({
            "type": "done",
            "session_id": session_id,
            "request_id": request_id,
            "steps": [
                {"id": f"step-{i}", "text": item, "status": "completed"}
                for i, item in enumerate(steps)
            ],
        })

        if overflow_messages:
            asyncio.create_task(summarize_overflow(session_id, existing_summary, overflow_messages))
    except asyncio.CancelledError:
        await websocket.send_json({
            "type": "stopped",
            "session_id": session_id,
            "request_id": request_id,
        })
        raise
    except Exception as e:
        logger.error(f"Generation error: {e}")
        await websocket.send_json({
            "type": "error",
            "message": str(e),
            "session_id": session_id,
            "request_id": request_id,
        })


@app.websocket("/ws/chat")
async def chat_ws(websocket: WebSocket):
    await websocket.accept()
    tasks: dict[str, asyncio.Task] = {}

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                payload = {"text": raw}

            message_type = payload.get("type", "chat")
            if message_type == "stop":
                request_id = payload.get("request_id")
                task = tasks.get(request_id)
                if task and not task.done():
                    task.cancel()
                continue

            if message_type == "plan_approve":
                from research_agent import approve_plan
                approve_plan(payload.get("request_id", ""))
                continue

            if message_type == "plan_decline":
                from research_agent import decline_plan
                decline_plan(payload.get("request_id", ""))
                continue

            request_id = payload.get("request_id") or str(uuid.uuid4())
            payload["request_id"] = request_id
            task = asyncio.create_task(run_generation(websocket, payload))
            tasks[request_id] = task
            task.add_done_callback(lambda done_task, rid=request_id: tasks.pop(rid, None))
    except WebSocketDisconnect:
        for task in tasks.values():
            task.cancel()
    except Exception as e:
        logger.warning(f"WebSocket closed: {e}")
        for task in tasks.values():
            task.cancel()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="info",
    )