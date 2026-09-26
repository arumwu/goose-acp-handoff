import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('../src/cli.mjs',import.meta.url));
const upstream=`import {createInterface} from 'node:readline';createInterface({input:process.stdin}).on('line',l=>{const m=JSON.parse(l);const result=m.method==='initialize'?{protocolVersion:1}:m.method==='session/new'?{sessionId:'fake-session',configOptions:[]}:{stopReason:'end_turn'};console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result}));});`;
function start(dir){return spawn(process.execPath,[cli,'--',process.execPath,'--input-type=module','-e',upstream],{env:{...process.env,ACP_HANDOFF_STATE_DIR:dir},stdio:['pipe','pipe','pipe']});}
function client(p){let seq=0;const pending=new Map();createInterface({input:p.stdout}).on('line',line=>{const m=JSON.parse(line);const q=pending.get(m.id);if(q){clearTimeout(q.timer);pending.delete(m.id);q.resolve(m);}});return (method,params)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(new Error('fixture timeout')),5000);pending.set(id,{resolve,timer});p.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
async function close(p){const exited=new Promise(r=>p.once('exit',r));p.stdin.end();await exited;}
test('stdio wrapper exposes handoff selector on new session and releases owner lock',async()=>{const dir=mkdtempSync(join(tmpdir(),'handoff-cli-'));const p=start(dir);try{const call=client(p);assert.equal((await call('initialize',{protocolVersion:1,clientCapabilities:{}})).result.protocolVersion,1);const r=await call('session/new',{cwd:'/synthetic',mcpServers:[]});assert.equal(r.result.configOptions[0].id,'_handoff_provider');await close(p);assert.equal(existsSync(join(dir,'.owner-lock')),false);}finally{p.kill();rmSync(dir,{recursive:true,force:true});}});
test('unsupported client protocol receives explicit error',async()=>{const dir=mkdtempSync(join(tmpdir(),'handoff-cli-'));const p=start(dir);try{const call=client(p);assert.match((await call('initialize',{protocolVersion:999})).error.message,/Unsupported ACP version/);await close(p);}finally{p.kill();rmSync(dir,{recursive:true,force:true});}});
test('second wrapper cannot share the same live state directory',async()=>{const dir=mkdtempSync(join(tmpdir(),'handoff-cli-'));const first=start(dir);let second;try{await client(first)('initialize',{protocolVersion:1});second=start(dir);let err='';second.stderr.on('data',b=>err+=b);const code=await new Promise(r=>second.once('exit',r));assert.equal(code,2);assert.match(err,/already locked/);await close(first);}finally{first.kill();second?.kill();rmSync(dir,{recursive:true,force:true});}});
