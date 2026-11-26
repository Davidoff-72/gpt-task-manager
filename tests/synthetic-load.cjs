// Synthetic model throughput only; no Chrome tabs, DOM, extension APIs, or endurance measurement.
const {performance}=require('node:perf_hooks'); const D=require('../extension/detector.js');
for (const count of [10,20,30]) {let models=Array.from({length:count},()=>D.initial()); const start=performance.now(); const loops=10000; for(let i=0;i<loops;i++) for(let j=0;j<count;j++) models[j]=D.step(models[j],{stopVisible:true},i).state; console.log(`${count} synthetic models, ${loops*count} transitions: ${(performance.now()-start).toFixed(1)} ms (not a browser load test)`);}
