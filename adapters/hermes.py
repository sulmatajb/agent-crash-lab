"""Hermes adapter: real Hermes MCP discovery and AIAgent execution in a fresh profile.

Receives one JSON request on stdin. Emits only CRASHLAB-prefixed JSON records.
Never imports source tools or persists inference credentials in the test profile.
OAuth resolution may refresh the selected source provider credentials.
"""
import contextlib
import hashlib
import importlib.metadata
import importlib.util
import json
import os
from pathlib import Path
import sys
import subprocess

OUTPUT = sys.stdout
SECRETS = []


def emit(kind, **data):
    text = json.dumps({"kind": kind, **data}, default=str)
    for secret in SECRETS:
        if len(secret) > 5:
            text = text.replace(secret, "[REDACTED]")
    OUTPUT.write("CRASHLAB:" + text + "\n")
    OUTPUT.flush()


def resolve_codex_oauth(source):
    # Resolve in a separate process: Hermes caches profile paths at import time.
    # The agent process must import Hermes only AFTER selecting the isolated home.
    env = os.environ.copy()
    env["HERMES_HOME"] = str(source.resolve())
    for key in ["HERMES_PROFILE", "HERMES_CONFIG", "HERMES_ENV"]:
        env.pop(key, None)
    code = """
import contextlib, json, sys
with contextlib.redirect_stdout(sys.stderr):
    from hermes_cli.auth import resolve_codex_runtime_credentials
    credentials = resolve_codex_runtime_credentials()
print(json.dumps({key: credentials.get(key) for key in ['api_key', 'base_url']}))
"""
    try:
        result = subprocess.run([sys.executable, "-c", code], env=env,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                timeout=20, check=True, text=True)
        credentials = json.loads(result.stdout)
        key = credentials.get("api_key")
        if not isinstance(key, str) or not key or len(key) > 16384:
            raise ValueError("Missing OAuth access token")
        SECRETS.append(key)
        # Prevent a source profile override from forwarding this token elsewhere.
        base_url = (credentials.get("base_url") or "").rstrip("/")
        if base_url != "https://chatgpt.com/backend-api/codex":
            raise ValueError("Unsupported OAuth endpoint")
        return {"provider": "openai-codex", "api_mode": "codex_responses",
                "api_key": key, "base_url": base_url}
    except Exception:
        raise RuntimeError("Hermes OpenAI Codex authentication could not be resolved. Sign in on the machine running this trial, then retry.") from None


def main(request):
    import yaml
    from dotenv import dotenv_values
    if request.get("token"):
        SECRETS.append(request["token"])

    source = Path(request["profile"]).expanduser()
    config_file = source / "config.yaml"
    raw = yaml.safe_load(config_file.read_text()) if config_file.exists() else {}
    model_cfg = raw.get("model", {})
    if isinstance(model_cfg, str):
        model_cfg = {"default": model_cfg}
    model = request.get("model") or model_cfg.get("default") or model_cfg.get("model")
    provider = request.get("provider") or model_cfg.get("provider", "auto")
    allowed_credentials = ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "NOUS_API_KEY"]
    source_env = dotenv_values(source / ".env") if (source / ".env").exists() else {}
    for key in allowed_credentials:
        value = os.environ.get(key) or source_env.get(key)
        if value:
            os.environ[key] = value
            SECRETS.append(value)
    explicit_key = model_cfg.get("api_key") or model_cfg.get("api")
    if explicit_key:
        SECRETS.append(explicit_key)
    version = importlib.metadata.version("hermes-agent")
    if request["mode"] == "doctor":
        emit("doctor", hermes_version=version, model=model, provider=provider,
             mcp_available=importlib.util.find_spec("mcp") is not None,
             credential_configured=bool(explicit_key or any(os.environ.get(k) for k in allowed_credentials)),
             source_profile=str(source), configuration_untouched=True,
             note="OpenAI Codex OAuth is supported with --provider openai-codex; doctor does not resolve or refresh OAuth credentials.")
        return

    oauth_runtime = resolve_codex_oauth(source) if request["mode"] == "evaluate" and provider == "openai-codex" else None
    home = Path(request["home"])
    os.environ["HERMES_HOME"] = str(home)
    for key in ["HERMES_PROFILE", "HERMES_CONFIG", "HERMES_ENV"]:
        os.environ.pop(key, None)
    home.mkdir(parents=True, exist_ok=True)
    safe_model = {k: v for k, v in model_cfg.items() if k in ["default", "provider", "base_url", "max_tokens", "context_length"]}
    safe_model.update({"default": model, "provider": provider})
    tools = request["tools"] + ["lab_finish"]
    mcp_config = {"command": request["node"], "args": [request["cli"], "mcp"],
                  "env": {"CRASHLAB_URL": request["url"], "CRASHLAB_TOKEN": request["token"]},
                  "tools": {"include": tools}, "timeout": 30, "connect_timeout": 30}
    config = {"model": safe_model,
              "agent": {"max_turns": request.get("max_turns", 30)},
              "memory": {"memory_enabled": False, "user_profile_enabled": False},
              "tools": {"tool_search": {"enabled": "off"}},
              "plugins": {"enabled": []},
              "mcp_servers": {"crashlab": mcp_config}}
    (home / "config.yaml").write_text(yaml.safe_dump(config))
    # Run directory is outside the repository: no repository AGENTS.md or prior memory.
    os.chdir(home)
    from tools.mcp_tool import register_mcp_servers, shutdown_mcp_servers, mcp_prefixed_tool_name
    from model_tools import get_tool_definitions, handle_function_call
    try:
        register_mcp_servers({"crashlab": mcp_config})
        definitions = get_tool_definitions(enabled_toolsets=["mcp-crashlab"], quiet_mode=True)
        names = sorted(tool["function"]["name"] for tool in definitions)
        expected = sorted(mcp_prefixed_tool_name("crashlab", name) for name in tools)
        if names != expected:
            raise RuntimeError("Tool surface mismatch; refusing to run with missing or extra tools: " + repr(names))
        config_hash = hashlib.sha256(json.dumps({"model": safe_model, "tools": names, "max_turns": request.get("max_turns", 30), "system_prompt": request.get("system_prompt", "")}, sort_keys=True).encode()).hexdigest()
        emit("ready", hermes_version=version, model=model, provider=provider, tools=names,
             configuration_sha256=config_hash, transport="Hermes MCP client → stdio bridge → local simulation")
        if request["mode"] == "probe":
            response = handle_function_call(mcp_prefixed_tool_name("crashlab", "policy_get"), {}, enabled_tools=names, enabled_toolsets=["mcp-crashlab"])
            emit("probe", response=json.loads(response), live_model=False)
            return
        from hermes_cli.runtime_provider import resolve_runtime_provider
        from run_agent import AIAgent
        runtime = oauth_runtime or resolve_runtime_provider(requested=provider, explicit_api_key=explicit_key,
                                           explicit_base_url=safe_model.get("base_url"), target_model=model)
        agent = AIAgent(model=model, provider=runtime.get("provider"), api_key=runtime.get("api_key"),
                        base_url=runtime.get("base_url"), api_mode=runtime.get("api_mode"),
                        enabled_toolsets=["mcp-crashlab"], max_iterations=request.get("max_turns", 30),
                        quiet_mode=True, tool_delay=0, skip_context_files=True, skip_memory=True,
                        load_soul_identity=False, save_trajectories=False, max_tokens=request.get("max_tokens", 2048),
                        fallback_model=None)
        actual = sorted(t["function"]["name"] for t in agent.tools)
        if actual != expected:
            raise RuntimeError("Hermes added unexpected tools after initialization; refusing to run.")
        emit("runtime", model=model, provider=runtime.get("provider"), hermes_version=version)
        result = agent.run_conversation(request["task"], system_message=request.get("system_prompt") or None)
        usage = {k: result.get(k) for k in ["model", "provider", "api_calls", "input_tokens", "output_tokens", "total_tokens", "estimated_cost_usd", "completed", "failed"]}
        emit("result", usage=usage, final_response=result.get("final_response", ""), live_model=True)
        if result.get("failed") or not result.get("completed"):
            raise RuntimeError("Hermes did not complete its model execution; inspect the recorded usage and tool trace.")
    finally:
        shutdown_mcp_servers()


if __name__ == "__main__":
    try:
        request = json.loads(sys.stdin.read())
        # Hermes import chatter never becomes machine-readable adapter output.
        with contextlib.redirect_stdout(sys.stderr):
            main(request)
    except Exception as error:
        emit("error", error_type=type(error).__name__, message=str(error))
        sys.exit(2)
