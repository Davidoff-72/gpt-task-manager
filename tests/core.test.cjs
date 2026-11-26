const {test} = require('node:test');
const assert = require('node:assert/strict');
const {transition} = require('../extension/core.js');
const go = (s,type,time=100,id='task-1') => transition(s,{type,conversation:'/c/1'},time,id);
const active = s => go(go(s,'SUBMIT'),'OBSERVE_ACTIVE');
test('completion requires observed start and happens once',()=>{let s={status:'IDLE'}; assert.equal(go(s,'FINISH').status,'IDLE'); s=active(s); assert.equal(s.taskId,'task-1'); s=go(s,'FINISH',200); assert.equal(s.status,'COMPLETED'); assert.equal(s.unread,true); assert.deepEqual(go(s,'FINISH',300),s);});
test('stop, error, and suspension cannot turn into completion',()=>{for(const type of ['STOP','ERROR','RATE_LIMITED','SUSPEND','UNCERTAIN']) {let s=active({status:'IDLE'}); s=go(s,type); assert.notEqual(go(s,'FINISH').status,'COMPLETED',type);}});
test('reset on route or reload invalidates old task',()=>{let s=active({status:'IDLE'}); s=go(s,'RESET'); assert.equal(s.taskId,null); assert.equal(go(s,'FINISH').status,'UNKNOWN');});
test('new active task clears unread and assigns new id',()=>{let s=go(active({status:'IDLE'}),'FINISH'); s=go(s,'SUBMIT',300); s=go(s,'OBSERVE_ACTIVE',300,'task-2'); assert.equal(s.taskId,'task-2'); assert.equal(s.unread,false);});
test('duplicate active observation preserves task identity',()=>{let s=active({status:'IDLE'}); assert.deepEqual(go(s,'OBSERVE_ACTIVE',200,'other'),s);});
test('read preserves completion metadata',()=>{let s=go(active({status:'IDLE'}),'FINISH',200); s=go(s,'READ'); assert.equal(s.unread,false); assert.equal(s.completedAt,200);});

test('same-conversation reload, idle, suspend and read preserve completion independently of unread',()=>{let s=go({status:'IDLE',conversation:'/c/1'},'SUBMIT');s=go(s,'OBSERVE_ACTIVE');s=go(s,'FINISH',200);const task=s.taskId;s=go(s,'IDLE',300);assert.equal(s.status,'COMPLETED');assert.equal(s.unread,true);s=go(s,'SUSPEND');assert.equal(s.status,'COMPLETED');assert.equal(s.monitoringSuspended,true);s=go(s,'RESET');assert.equal(s.status,'COMPLETED');assert.equal(s.taskId,task);assert.equal(s.unread,true);s=go(s,'READ');assert.equal(s.status,'COMPLETED');assert.equal(s.unread,false);});
test('new submission alone never manufactures a running task or clears completed',()=>{let s=go(active({status:'IDLE',conversation:'/c/1'}),'FINISH');s=go(s,'SUBMIT',200);assert.equal(s.status,'COMPLETED');assert.equal(s.unread,true);s=go(s,'UNCERTAIN',300);assert.equal(s.status,'COMPLETED');assert.equal(s.pendingSubmit,false);});
test('late or missing submission cannot start a new task',()=>{let s={status:'COMPLETED',unread:true};assert.equal(go(s,'OBSERVE_ACTIVE').status,'COMPLETED');s=go(s,'SUBMIT',100);assert.equal(go(s,'OBSERVE_ACTIVE',120101).status,'COMPLETED');});
test('route change does not preserve another conversation completion',()=>{let s=go(active({status:'IDLE',conversation:'/c/other'}),'FINISH');s=go(s,'RESET');assert.equal(s.status,'UNKNOWN');assert.equal(s.unread,false);});
test('unrelated alerts do not erase unread completion; a new submitted request can surface an error',()=>{let s=go(active({status:'IDLE',conversation:'/c/1'}),'FINISH');s=go(s,'ERROR');assert.equal(s.status,'COMPLETED');assert.equal(s.unread,true);s=go(s,'SUBMIT');s=go(s,'ERROR');assert.equal(s.status,'ERROR');});
