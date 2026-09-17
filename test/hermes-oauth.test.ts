import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('OAuth resolver isolates profile imports, redacts tokens and rejects credential forwarding', () => {
  const script = `
import importlib.util, os, pathlib, tempfile, json, contextlib, io
spec=importlib.util.spec_from_file_location('adapter',${JSON.stringify(fileURLToPath(new URL('../adapters/hermes.py',import.meta.url)))})
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as folder:
    root=pathlib.Path(folder); package=root/'hermes_cli';package.mkdir();(package/'__init__.py').write_text('')
    auth=package/'auth.py'
    os.environ['PYTHONPATH']=folder
    os.environ['HERMES_HOME']='wrong-home'
    os.environ['HERMES_PROFILE']='wrong-profile'
    source=root/'source';source.mkdir()
    secret='synthetic-oauth-test-token'
    auth.write_text("import os\\ndef resolve_codex_runtime_credentials():\\n    assert os.environ['HERMES_HOME']=="+repr(str(source.resolve()))+"\\n    assert 'HERMES_PROFILE' not in os.environ\\n    print('library chatter')\\n    return "+repr({'api_key':secret,'base_url':'https://chatgpt.com/backend-api/codex'})+"\\n")
    runtime=module.resolve_codex_oauth(source)
    assert runtime['api_key']==secret and runtime['api_mode']=='codex_responses'
    assert os.environ['HERMES_HOME']=='wrong-home'
    assert list(source.iterdir())==[]
    output=io.StringIO();module.OUTPUT=output;module.emit('error',message=secret)
    assert secret not in output.getvalue() and '[REDACTED]' in output.getvalue()
    for body in ["return "+repr({'api_key':secret,'base_url':'https://other.example/codex'}),"raise RuntimeError("+repr(secret)+")", "return {}"]:
        auth.write_text('def resolve_codex_runtime_credentials():\\n    '+body+'\\n')
        try:module.resolve_codex_oauth(source);raise AssertionError('accepted invalid credentials')
        except RuntimeError as error:assert secret not in str(error) and 'authentication could not be resolved' in str(error)
print('OAuth isolation and redaction checks passed')
`;
  const result=spawnSync('python3',['-B','-c',script],{encoding:'utf8',timeout:15000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/checks passed/);
});
