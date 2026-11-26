const fs = require('node:fs'); const {execFileSync} = require('node:child_process');
fs.rmSync('dist',{recursive:true,force:true}); fs.cpSync('extension','dist',{recursive:true});
fs.mkdirSync('release',{recursive:true}); fs.rmSync('release/gpt-task-manager.zip',{force:true});
try {
  if (process.platform === 'win32') execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Compress-Archive -Path 'dist\\*' -DestinationPath 'release\\gpt-task-manager.zip' -Force"]);
  else execFileSync('zip',['-qr','../release/gpt-task-manager.zip','.'],{cwd:'dist'});
  console.log('Built dist/ and release/gpt-task-manager.zip');
} catch(e) {console.error('dist/ built; ZIP creation failed:',e.message); process.exitCode=1;}
