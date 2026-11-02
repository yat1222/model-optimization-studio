import fs from 'node:fs/promises';
import path from 'node:path';
import {catalog,presetById,preparePreset,exportPreset} from './material-maker.js';
const args=process.argv.slice(2);
try {
  const command=args.shift();
  if(command==='list') {
    const q=args.join(' ').toLowerCase();
    console.log(JSON.stringify(catalog.presets.filter(p=>JSON.stringify(p).toLowerCase().includes(q)),null,2));
  } else if(command==='inspect') {
    const id=args.shift();presetById(id);
    const {graph}=await preparePreset({id,size:512,uv:'preserve'});
    console.log(JSON.stringify({id,nodes:graph.nodes.map(n=>({node:n.name,numericParameters:Object.fromEntries(Object.entries(n.parameters??{}).filter(([,v])=>typeof v==='number'))}))},null,2));
  } else if(command==='export') {
    const id=args.shift(), options={};
    while(args.length) {const key=args.shift();if(!['--size','--out','--material-maker'].includes(key)||!args.length)throw new Error('参数错误：'+key);options[key]=args.shift();}
    const out=path.resolve(options['--out']??'output');await fs.mkdir(out,{recursive:true});
    const directory=await fs.mkdtemp(path.join(out,'material-'));
    const manifest=await exportPreset({id,size:Number(options['--size']??512),seed:0,uv:'preserve'},directory,{binary:options['--material-maker']});
    console.log(JSON.stringify({directory,manifest},null,2));
  } else throw new Error('用法：npm run materials -- list [关键词] | inspect <id> | export <id> [--size 512] [--material-maker /path/to/program] [--out output]');
} catch(e) {console.error(e.message);process.exitCode=1;}
