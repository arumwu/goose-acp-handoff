#!/usr/bin/env node
// stdio ACP wrapper. stdout is reserved for protocol messages.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {ManualHandoff,HandoffStore,TARGETS} from './manual-handoff.mjs';
const args=process.argv.slice(2);
if(args.includes('--help')){
 console.log('Usage: ACP_HANDOFF_STATE_DIR=/private/state node src/cli.mjs -- <upstream ACP command> [args...]\nOptional: GOOSE_HANDOFF_COMMAND, ACP_HANDOFF_TARGETS_FILE');process.exit(0);
}
if(args[0]!=='--'||args.length<2||!process.env.ACP_HANDOFF_STATE_DIR){console.error('State directory and upstream command are required. Use --help.');process.exit(2);}
process.umask(0o077);
const dir=resolve(process.env.ACP_HANDOFF_STATE_DIR);mkdirSync(dir,{recursive:true,mode:0o700});
const lock=join(dir,'.owner-lock');
try{mkdirSync(lock,{mode:0o700});}catch{console.error('State directory is already locked. Do not share it between running wrappers.');process.exit(2);}
writeFileSync(join(lock,'pid'),String(process.pid),{mode:0o600});
let upstream,handoff;let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;handoff?.close();upstream?.kill('SIGTERM');rmSync(lock,{recursive:true,force:true});process.exitCode=code;process.stdin.destroy();}
try{
 const targets=process.env.ACP_HANDOFF_TARGETS_FILE?JSON.parse(readFileSync(process.env.ACP_HANDOFF_TARGETS_FILE,'utf8')):TARGETS;
 if(!Array.isArray(targets)||!targets.length||targets.some(t=>typeof t.value!=='string'||!t.value||typeof t.name!=='string')||new Set(targets.map(t=>t.value)).size!==targets.length)throw new Error('Invalid targets file');
 const store=new HandoffStore(dir),busy=new Set(),pending=new Map();let init={protocolVersion:1,clientCapabilities:{}};
 const send=m=>process.stdout.write(JSON.stringify(m)+'\n');
 handoff=new ManualHandoff({store,send,targets,init:()=>init,isBusy:sid=>busy.has(sid)});
 upstream=spawn(args[1],args.slice(2),{stdio:['pipe','pipe','inherit']});
 upstream.on('error',()=>{console.error('Upstream ACP command failed to start.');stop(1);});
 upstream.on('exit',code=>stop(code??1));
 createInterface({input:upstream.stdout}).on('line',line=>{
  let m;try{m=JSON.parse(line);}catch{return;}
  if(!m.method&&m.id!==undefined){const p=pending.get(m.id);pending.delete(m.id);if(p?.method==='session/prompt')busy.delete(p.sid);
   if(p?.method==='session/list'&&m.result?.sessions)m.result.sessions=m.result.sessions.filter(s=>!store.hidden(s.sessionId));
  }
  send(handoff.outgoing(m));
 });
 createInterface({input:process.stdin}).on('line',async line=>{
  let m;try{m=JSON.parse(line);}catch{return;}
  try{
   if(handoff.reply(m))return;
   if(m.method==='initialize'){if(m.params?.protocolVersion!==1)throw new Error('Unsupported ACP version; upstream not contacted.');init=m.params;}
   if(await handoff.handle(m))return;
   const sid=m.params?.sessionId;
   if(m.method==='session/prompt'){if(busy.has(sid))throw new Error('Session is busy');busy.add(sid);}
   handoff.track(m);if(m.method&&m.id!==undefined)pending.set(m.id,{method:m.method,sid});
   upstream.stdin.write(JSON.stringify(m)+'\n');
  }catch(e){if(m.id!==undefined)send({jsonrpc:'2.0',id:m.id,error:{code:-32000,message:e.message}});}
 }).on('close',()=>stop());
 process.once('SIGTERM',()=>stop());process.once('SIGINT',()=>stop());
}catch(e){console.error(e.message);stop(1);}
