import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseOptions,lanAddresses} from '../scripts/start.mjs';

test('launcher mode is explicit and invalid ports/extra modes are rejected',()=>{
 assert.deepEqual(parseOptions([]),{mode:null,port:4180,open:true});
 assert.deepEqual(parseOptions(['--lan','--no-open','--port','0']),{mode:'lan',port:0,open:false});
 assert.deepEqual(parseOptions(['--public','--port','4300']),{mode:'public',port:4300,open:true});
 for(const args of [['--public','--lan'],['--port'],['--port','-1'],['--port','NaN'],['--port','65536'],['--port','4180oops'],['--unknown']])assert.throws(()=>parseOptions(args));
});
test('LAN links exclude loopback, IPv6 and unconfigured link-local interfaces',()=>{
 const interfaces={
  loopback:[{family:'IPv4',internal:true,address:'127.0.0.1'}],
  wifi:[{family:'IPv4',internal:false,address:'192.168.1.5'},{family:'IPv6',internal:false,address:'fe80::1'}],
  duplicate:[{family:4,internal:false,address:'192.168.1.5'}],
  disconnected:[{family:'IPv4',internal:false,address:'169.254.1.3'}],
  wired:[{family:'IPv4',internal:false,address:'10.0.0.3'}]
 };
 assert.deepEqual(lanAddresses(4300,interfaces),['http://192.168.1.5:4300','http://10.0.0.3:4300']);
});
