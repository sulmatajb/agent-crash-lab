import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('Hermes MCP discovery supports both runtime layouts without masking missing dependencies', () => {
  const script = `
import importlib.util, pathlib, sys, tempfile
spec = importlib.util.spec_from_file_location('adapter', ${JSON.stringify(fileURLToPath(new URL('../adapters/hermes.py', import.meta.url)))})
adapter = importlib.util.module_from_spec(spec); spec.loader.exec_module(adapter)
with tempfile.TemporaryDirectory() as folder:
    root = pathlib.Path(folder); package = root / 'tools'; package.mkdir()
    (package / '__init__.py').write_text('')
    (package / 'mcp_tool.py').write_text('register_mcp_servers = "legacy-register"\\nshutdown_mcp_servers = "legacy-shutdown"\\nmcp_prefixed_tool_name = "legacy-name"\\n')
    sys.path.insert(0, folder)
    assert adapter.mcp_runtime() == ('legacy-register', 'legacy-shutdown', 'legacy-name')
    for name, symbol in [('discovery', 'register_mcp_servers'), ('lifecycle', 'shutdown_mcp_servers'), ('schema', 'mcp_prefixed_tool_name')]:
        (package / ('mcp_tool_' + name + '.py')).write_text(symbol + ' = ' + repr(name) + '\\n')
    importlib.invalidate_caches()
    assert adapter.mcp_runtime() == ('discovery', 'lifecycle', 'schema')
    sys.modules.pop('tools.mcp_tool_discovery')
    (package / 'mcp_tool_discovery.py').write_text('import missing_hermes_dependency\\n')
    try:
        adapter.mcp_runtime()
        raise AssertionError('missing dependency was hidden by the legacy facade')
    except ModuleNotFoundError as error:
        assert error.name == 'missing_hermes_dependency'
`;
  const result = spawnSync('python3', ['-B', '-c', script], {
    encoding: 'utf8', timeout: 10000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.equal(result.status, 0, result.stderr);
});
