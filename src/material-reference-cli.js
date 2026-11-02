import {materialReference, findMaterialProfile, materialRule} from './material-reference.js';
const args = process.argv.slice(2);
try {
  const command = args.shift();
  if (command === 'list') {
    const query = args.join(' ').toLowerCase();
    console.log(JSON.stringify(materialReference.profiles.filter(p => JSON.stringify(p).toLowerCase().includes(query)).map(p => ({
      id: p.id, label: p.label, ...p.start, status: p.requiredFeatures.length ? 'reference-only' : 'scalar-rule-supported'
    })), null, 2));
  } else if (command === 'show') {
    const id=args.shift(); if(args.length) throw new Error('show 只接受一个 ID');
    console.log(JSON.stringify({source: materialReference.source, ...findMaterialProfile(id)}, null, 2));
  } else if (command === 'rule') {
    const id=args.shift(), options={};
    while(args.length) {
      const key=args.shift();
      if(key === '--replace-textures') {options.replaceTextures=true; continue;}
      if(!['--material','--node','--color'].includes(key) || !args.length || args[0].startsWith('--')) throw new Error('参数错误：'+key);
      const value=args.shift();
      if(key==='--node') (options.nodes??=[]).push(value); else options[key.slice(2)]=value;
    }
    console.log(JSON.stringify(materialRule(id,options),null,2));
  } else throw new Error('用法：npm run material:reference -- list [关键词] | show <id> | rule <id> --material <名称> [--node <节点>] [--color keep|source] [--replace-textures]');
} catch(e) {console.error(e.message);process.exitCode=1;}
