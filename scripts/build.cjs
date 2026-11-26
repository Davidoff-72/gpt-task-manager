const fs = require('node:fs'); const {execFileSync} = require('node:child_process');
fs.rmSync('dist',{recursive:true,force:true}); fs.cpSync('extension','dist',{recursive:true});
try {fs.mkdirSync('release',{recursive:true}); fs.rmSync('release/gpt-task-manager.zip',{force:true}); execFileSync('zip',['-qr','../release/gpt-task-manager.zip','.'],{cwd:'dist'}); console.log('Built dist/ and release/gpt-task-manager.zip');} catch(e) {console.error('dist/ built; ZIP requires the zip utility:',e.message); process.exitCode=1;}
