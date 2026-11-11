import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculateStandings, filterMatches, getStandingsCaption} from '../league.js';
const data = JSON.parse(fs.readFileSync(new URL('../data/league-data.json',import.meta.url)));
test('demo standings reconcile with the 12 completed matches',()=>{
 const rows=calculateStandings(data.teams,data.matches,data.points);
 assert.equal(rows.length,8);
 assert.equal(rows.reduce((s,r)=>s+r.played,0),24);
 assert.equal(rows.reduce((s,r)=>s+r.goalsFor,0),rows.reduce((s,r)=>s+r.goalsAgainst,0));
 assert.equal(rows.reduce((s,r)=>s+r.difference,0),0);
 assert.deepEqual(rows.map(r=>r.points),[7,7,6,5,4,4,0,0]);
 assert.equal(rows[0].id,'verde');
 assert.equal(rows[0].goalsFor,9);assert.equal(rows[0].goalsAgainst,4);
 assert.ok(rows.every(r=>r.played===3 && r.won+r.drawn+r.lost===r.played));
});
test('unplayed and malformed scores do not become results',()=>{
 const teams=[{id:'a'},{id:'b'}];
 const base={home:'a',away:'b',status:'finished',homeScore:1,awayScore:0};
 const rows=calculateStandings(teams,[{...base,status:'scheduled'},{...base,homeScore:null},{...base,homeScore:-1},{...base,away:'unknown'}]);
 assert.ok(rows.every(r=>r.played===0 && r.points===0));
});
test('ranking breaks ties on goal difference then goals scored; exact ties share a rank',()=>{
 const teams=[{id:'a'},{id:'b'},{id:'c'},{id:'d'}];
 const games=[{home:'a',away:'c',homeScore:2,awayScore:0,status:'finished'},{home:'b',away:'d',homeScore:3,awayScore:1,status:'finished'}];
 assert.deepEqual(calculateStandings(teams,games).map(r=>r.id),['b','a','d','c']);
 assert.deepEqual(calculateStandings(teams,[]).map(r=>r.rank),[1,1,1,1]);
});
test('team and round filters retain correct home/away fixtures',()=>{
 const upcoming=filterMatches(data.matches,{status:'scheduled',team:'verde'});
 assert.equal(upcoming.length,1);assert.equal(upcoming[0].away,'libre');
 assert.equal(filterMatches(data.matches,{status:'finished',round:2}).length,4);
 assert.equal(filterMatches(data.matches,{status:'scheduled',team:'azul'})[0].home,'buddy');
});
test('standings caption correctly reflects match completion status',()=>{
 // 1. 保存済みサンプルデータ：第3節全4試合終了（第1〜2節も全試合終了、demoモード）
 assert.equal(getStandingsCaption(data.matches, {demo: data.mode === 'demo'}), 'サンプル 第3節終了時点');
 assert.equal(getStandingsCaption(data.matches, {demo: false}), '第3節終了時点');

 // 2. 終了試合なし（開幕前）
 const unplayed = data.matches.map(m => ({...m, status: 'scheduled', homeScore: null, awayScore: null}));
 assert.equal(getStandingsCaption(unplayed), 'シーズン開幕前');
 assert.equal(getStandingsCaption(unplayed, {demo: true}), 'サンプル シーズン開幕前');

 // 3. 部分終了：第4節の4試合中1試合終了
 const partialRound4 = [
   ...data.matches.filter(m => m.round <= 3),
   {id:'m13',round:4,status:'finished',homeScore:2,awayScore:1,home:'verde',away:'libre'},
   {id:'m14',round:4,status:'scheduled',homeScore:null,awayScore:null,home:'unite',away:'roots'},
   {id:'m15',round:4,status:'scheduled',homeScore:null,awayScore:null,home:'nova',away:'sol'},
   {id:'m16',round:4,status:'scheduled',homeScore:null,awayScore:null,home:'buddy',away:'azul'}
 ];
 assert.equal(getStandingsCaption(partialRound4), '第4節・1/4試合終了');
 assert.equal(getStandingsCaption(partialRound4, {demo: true}), 'サンプル 第4節・1/4試合終了');

 // 4. 全試合終了：第4節の全4試合終了
 const fullRound4 = [
   ...data.matches.filter(m => m.round <= 3),
   {id:'m13',round:4,status:'finished',homeScore:2,awayScore:1,home:'verde',away:'libre'},
   {id:'m14',round:4,status:'finished',homeScore:0,awayScore:0,home:'unite',away:'roots'},
   {id:'m15',round:4,status:'finished',homeScore:1,awayScore:3,home:'nova',away:'sol'},
   {id:'m16',round:4,status:'finished',homeScore:2,awayScore:0,home:'buddy',away:'azul'}
 ];
 assert.equal(getStandingsCaption(fullRound4), '第4節終了時点');

 // 5. 未消化試合あり：第3節に1試合未消化（延期等）があり、第4節が全試合終了
 const postponed = fullRound4.map(m => m.id === 'm12' ? {...m, status: 'scheduled', homeScore: null, awayScore: null} : m);
 assert.equal(getStandingsCaption(postponed), '第4節終了時点（未消化1試合）');
});
