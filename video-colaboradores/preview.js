const { chromium } = require('/Users/michelfaria/Documents/Site ZCheck/ibr-checklists-app/node_modules/playwright');
const path=require('path'), fs=require('fs');
const TS = process.argv.slice(2).map(Number);
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
  await p.goto('file://'+path.join(__dirname,'video.html'));
  await p.waitForFunction(()=>typeof window.__seek==='function');
  fs.mkdirSync(path.join(__dirname,'preview'),{recursive:true});
  for(const t of TS){
    await p.evaluate(x=>window.__seek(x),t);
    await p.screenshot({path:path.join(__dirname,'preview',`t${String(t).replace('.','_')}.jpg`),type:'jpeg',quality:80});
  }
  await b.close(); console.log('ok');
})();
