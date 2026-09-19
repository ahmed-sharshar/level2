#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),Full=require('../full-core.js');
const site=path.resolve(__dirname,'..');
const args=process.argv.slice(2),out=args[0]?path.resolve(args[0]):path.join(site,'collection-tasks.json');
if(fs.existsSync(out))throw new Error('Refusing to overwrite existing tasks. Use a new output filename.');
const read=name=>JSON.parse(fs.readFileSync(path.join(site,name),'utf8'));
const dataset=read('dataset.json'),catalogue=read('catalogue.json'),tasks=Full.createTasks(dataset,catalogue);
const errors=Full.validateTasks(tasks,dataset,catalogue);if(errors.length)throw new Error(errors.join('\n'));
fs.writeFileSync(out,JSON.stringify(tasks,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output:out,task_id:tasks.task_id,episodes:tasks.layout.episodes.length,approved:false}));
