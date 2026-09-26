
"use strict";
/* ================= CONSTANTS ================= */
const ASSETS=['bc','spec','pref','bond','warr'];
const ANAME={bc:'Blue Chip',spec:'Speculative',pref:'Preferred',bond:'Bonds',warr:'Warrants'};
const ASH={bc:'BC',spec:'SPEC',pref:'PF',bond:'BOND',warr:'WARR'};
const APER={bc:1,spec:1,pref:1,bond:10,warr:1};           // $ per quote point
const STARTP={bc:40,spec:20,pref:50,bond:90,warr:5};      // starting quotes
const MOVE={
 bull:{bc:[14,11,8,6,4,2],spec:[44,22,10,4,0,-2],pref:[10,8,6,4,2,0],bond:[28,22,16,12,8,4],warr:[8,5,3,2,1,0]},
 mixed:{bc:[7,6,4,0,-2,-4],spec:[20,10,5,0,-6,-15],pref:[6,4,2,0,-1,-3],bond:[14,12,8,0,-4,-8],warr:[4,2,1,0,-1,-3]},
 bear:{bc:[-2,-3,-5,-7,-10,-13],spec:[-4,-7,-11,-16,-22,-50],pref:[0,-1,-2,-3,-5,-7],bond:[-4,-6,-10,-14,-20,-26],warr:[-1,-1,-2,-2,-4,-8]}};
const MOMMOD={bc:[0,0,1,2,4],spec:[0,2,5,10,18],pref:[0,0,1,3,5],bond:[0,0,2,4,8],warr:[0,1,3,6,10]};
const DIRA={buy:'buy',marginbuy:'buy',cover:'buy',exercise:'buy',sell:'sell',short:'sell'};
const PHASES=['trading','execute','event','market','moves','firesale','bubble','endround'];
const PHLBL={trading:'Tabs',execute:'Execute',event:'Event',market:'Market',moves:'Moves',firesale:'Fire Sale',bubble:'Bubble',endround:'End Round'};
function imbThreshold(n){ if(n<=4)return 2; if(n<=6)return 3; if(n<=8)return 4; if(n<=10)return 5; return 6; }
/* Movement columns scale with player count: 4-6 players -> Buy 3+ max (classic card);
   larger games extend the card (e.g. 10 players -> Buy 5+ / Sell 4+), extrapolating values. */
function maxBuyCol(n){ return Math.max(3, Math.round(n/2)); }
function maxSellCol(n){ return Math.max(2, Math.round(n/2)-1); }
function moveCols(regime, asset, n){
  const t=MOVE[regime][asset]; // [buy3+,buy2,buy1,sell0,sell1,sell2+]
  const mB=maxBuyCol(n), mS=maxSellCol(n), cols=[];
  const bStep=t[0]-t[1], sStep=t[5]-t[4];
  for(let k=mB;k>=1;k--) cols.push({label:'Buy '+(k===mB?k+'+':k), val: k>=3 ? t[0]+(k-3)*bStep : t[3-k]});
  cols.push({label:'Sell 0', val:t[3]});
  for(let k=1;k<=mS;k++) cols.push({label:'Sell '+(k===mS?k+'+':k), val: k<=2 ? t[3+k] : t[5]+(k-2)*sStep});
  return cols;
}
function colForDyn(net,n){
  const mB=maxBuyCol(n), mS=maxSellCol(n);
  if(net>=mB) return 0;
  if(net>=1) return mB-net;
  if(net===0) return mB;
  const s=-net;
  return s>=mS ? mB+mS : mB+s;
}
/* ================= HOUSE RULES ================= */
const RULES=[
 ['splits','Stock splits','BC ≥ 80 and Spec ≥ 100 split 2-for-1; conversion ratios adjust.'],
 ['warrants','Warrant exercise','Exercise warrants into Speculative shares.'],
 ['warrant_decay','Warrant decay','Warrants lose 1 quote point at end of round when Spec doesn\'t rise.'],
 ['margin','Margin buying','50% cash / 50% loan with maintenance calls.'],
 ['short','Short selling','New shorts need 50% collateral held. Covering always allowed.'],
 ['firesale','Fire sales','Discounted execution when selling is crowded.'],
 ['momentum','Momentum tracker','−4…+4 regime tracker that modifies price moves.'],
 ['bubble','Bubble indicator','Bubble score, threshold, and bubble event decks.'],
 ['randomBubble','Random bubble threshold','Each game rolls a hidden threshold between N and N+8 by player count (6–14 standard).'],
 ['randevents','Random events','1d12 roll each round with the 15-card event deck.'],
 ['pflow','Persistent flow','Imbalance tabs carry into the next round.'],
 ['mmtabs','Market-maker tabs','Auto random tabs for 4–5 player games.'],
 ['conversions','Conversions','Preferred → Blue Chip and Bond → Blue Chip.'],
 ['pctMoves','Percent movements','Trend Card moves as % of current price (each card value ÷ that asset\'s starting price). Off by default.']
];
const RULES_OFF_DEFAULT=['pctMoves'];
function allTrue(){ const o={}; RULES.forEach(r=>o[r[0]]=!RULES_OFF_DEFAULT.includes(r[0])); return o; }
function ruleOn(k){ return (S&&S.rules)?!!S.rules[k]:true; }
function setRule(k,v){
  if(!S) return; S.rules=S.rules||allTrue(); S.rules[k]=v;
  const lbl=(RULES.find(r=>r[0]===k)||[k,k])[1];
  if(k==='randomBubble'){
    if(v){ ensureBubbleRange(); rollBubbleThreshold();
      feed('🎲 Random bubble threshold ON — hidden threshold rolled between '+S.bubbleLo+'–'+S.bubbleHi+'.'); }
    else { S.bubbleThreshold=12; feed('🎲 Fixed bubble threshold 12 restored.'); }
  }
  feed('🎲 House rule: '+lbl+' '+(v?'ON':'OFF')+'.');
  
}
function ensureBubbleRange(){
  if(S.bubbleLo==null||S.bubbleHi==null){ S.bubbleLo=S.players.length; S.bubbleHi=S.players.length+8; }
  if(S.bubbleThreshold==null) S.bubbleThreshold=12;
}
function rollBubbleThreshold(){
  ensureBubbleRange();
  const lo=Math.max(1,S.bubbleLo), hi=Math.max(lo,S.bubbleHi);
  S.bubbleThreshold=lo+Math.floor(Math.random()*(hi-lo+1));
}
function setBubbleRange(lo,hi){
  if(!S) return;
  lo=Math.max(1,Math.round(Number(lo)||0)); hi=Math.max(1,Math.round(Number(hi)||0));
  if(hi<lo) hi=lo;
  S.bubbleLo=lo; S.bubbleHi=hi;
  if(ruleOn('randomBubble')){ rollBubbleThreshold(); feed('🎲 Bubble threshold range set to '+lo+'–'+hi+'. New hidden threshold rolled.'); }
  else feed('🎲 Bubble threshold range set to '+lo+'–'+hi+' (applies when random threshold is on).');
  
}
/* ================= EVENT DECKS ================= */
const RANDEVENTS=[
 {n:'Emergency Rate Cuts',m:{bc:8,pref:6,bond:10,spec:6,warr:2},d:'Momentum +1.',fx:'mom1'},
 {n:'Index Inclusion',m:{bc:6,pref:4,spec:2,warr:1},d:'Next round: +2 Buy tabs on Blue Chip and Preferred.',fx:'idxin'},
 {n:'Short Covering Rally',m:{bc:4,pref:2,spec:16,warr:6},d:'ALL open shorts forced-cover at current prices.',fx:'allcover'},
 {n:'Sovereign Rescue Package',m:{bc:10,pref:8,bond:6,spec:4,warr:2},d:'Bubble −2.',fx:'bubm2'},
 {n:'Foreign Investment Surge',m:{bc:8,pref:6,bond:4,spec:8,warr:3},d:'Bubble +2. Double market-maker tabs next round.',fx:'surge'},
 {n:'Presidential Tariffs',m:{bc:-10,pref:-8,bond:-4,spec:-14,warr:-4},d:'No special rule.'},
 {n:'Volatility Spike',m:{warr:6},d:'Roll d6: odd → Spec −10, even → Spec +10. Bubble +2.',fx:'vol'},
 {n:'Banking Crisis',m:{bc:-12,pref:-14,bond:8,spec:-18,warr:-6},d:'No new Margin Buys next round.',fx:'nomargin'},
 {n:'Flash Crash',m:{bc:-8,pref:-10,bond:2,spec:-22,warr:-8},d:'Next round Fire Sale: 30% roll / 50% automatic.',fx:'flash'},
 {n:'Index Deletion',m:{bc:-8,pref:-6,bond:2,spec:-2,warr:-1},d:'Next round: +2 Sell tabs on Blue Chip and Preferred.',fx:'idxdel'},
 {n:'Speculative Options Expiry',m:{},d:'All Warrants expire at end of next round. Bubble −1.',fx:'optexp'},
 {n:'Bubble Psychology Shift',m:{},d:'Bubble +3. Momentum +1.',fx:'psych'},
 {n:'Rumor of War',m:{bc:-6,pref:-6,bond:4,spec:-10,warr:-4},d:'Next round: d6 follow-up (1–3 recovery, 4–5 none, 6 escalation).',fx:'war'},
 {n:'Institutional Rotation',m:{},d:'Roll d6 for outcome. Next round Bubble cannot increase.',fx:'rotation'},
 {n:'Media Frenzy',m:{},d:'Next 2 rounds: two d12 Random Event rolls.',fx:'media'}
];
const BUBBLE_DECKS={
 bull:[
  {n:'Government Buyout',m:{bc:10,pref:6,bond:4,spec:4,warr:2},d:'All Blue Chip shorts must cover.',fx:'bccover'},
  {n:'Retail Frenzy',m:{bc:2,bond:-8,spec:20,warr:6},d:'Bubble +1.',fx:'bubp1'},
  {n:'Productivity Boom',m:{bc:8,pref:5,bond:-6,spec:12,warr:4},d:'Momentum +1.',fx:'mom1'},
  {n:'Short Squeeze Mania',m:{bc:4,pref:2,spec:22,warr:8},d:'ALL open shorts forced-cover.',fx:'allcover'},
  {n:'Central Bank Liquidity Flood',m:{bc:10,pref:8,bond:6,spec:14,warr:5},d:'Next round: ignore Fire Sale checks.',fx:'nofire'}],
 bear:[
  {n:'Flight to Safety',m:{bc:-8,pref:-10,bond:14,spec:-18,warr:-6},d:'Next round: Bond Buy tabs count double.',fx:'bonddouble'},
  {n:'Margin Panic',m:{bc:-10,pref:-8,bond:4,spec:-28,warr:-8},d:'Margin loans immediately due.',fx:'panic'},
  {n:'Credit Freeze',m:{bc:-12,pref:-14,bond:8,spec:-20,warr:-6},d:'No new Margin Buys next round.',fx:'nomargin'},
  {n:'Inflation Crisis',m:{bc:-18,pref:-20,bond:-6,spec:-26,warr:-8},d:'Each player loses 10% of held cash.',fx:'inflation'},
  {n:'Systemic Market Collapse',m:{bc:-24,pref:-26,bond:-12,spec:-40,warr:-10},d:'Next round: all Fire Sale checks automatic.',fx:'autofire'}],
 mixed:[
  {n:'Sector Rotation',m:{bc:8,pref:10,bond:2,spec:-12,warr:-4},d:'Next round: Spec Buy imbalance does not generate Bubble.',fx:'specnobub'},
  {n:'Commodity Shock',m:{bc:-4,pref:-6,bond:-14,spec:10,warr:3},d:'No special rule.'},
  {n:'Uncertain Recovery',m:{bc:4,pref:2,bond:4,spec:-6,warr:-2},d:'Next round: Bubble cannot increase.',fx:'bubfreeze'},
  {n:'Defensive Rotation',m:{bc:10,pref:12,bond:6,spec:-15,warr:-5},d:'Preferred +2 movement next round.',fx:'pref2'},
  {n:'Market Exhaustion',m:{bc:-2,pref:4,bond:6,spec:-12,warr:-6},d:'Bubble −1 now. Momentum set to −2 entering next round.',fx:'exhaust'}]
};
/* ================= STATE ================= */
let S=null;
function load(){ try{ const r=localStorage.getItem(LSKEY); if(!r) return false;
  const o=JSON.parse(r); S=o.S; ui=o.ui||ui; return !!(S&&S.players); }catch(e){ return false; } }
function uid(){ return 'p'+Math.random().toString(36).slice(2,9); }
function gcode(){ const c='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<4;i++) s+=c[Math.floor(Math.random()*c.length)]; return s; }
function blankHold(){ const o={}; ASSETS.forEach(a=>o[a]=0); return o; }
function blankMoves(){ const o={}; ASSETS.forEach(a=>o[a]=0); return o; }
/* ================= UTILS ================= */
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function fmt(n){ const v=Math.round(n); return (v<0?'-$':'$')+Math.abs(v).toLocaleString('en-US'); }
function fmtN(n){ return (n>0?'+':'')+n; }
function unitVal(a){ return S.prices[a]*APER[a]; }
function d6(){ return 1+Math.floor(Math.random()*6); }
function d12(){ return 1+Math.floor(Math.random()*12); }
function feed(t){ const s=String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); S.feed.unshift({r:S.round,t:s}); if(S.feed.length>300) S.feed.length=300; }
function player(pid){ return S.players.find(p=>p.id===pid); }
function longVal(p){ let v=0; ASSETS.forEach(a=>v+=(p.hold[a]||0)*unitVal(a)); return v; }
function shortLiab(p){ let v=0; ASSETS.forEach(a=>v+=(p.short[a]||0)*unitVal(a)); return v; }
function netWorth(p){ return p.cash+longVal(p)+(p.collat||0)-shortLiab(p)-(p.loan||0)-loansOwed(p.id)+loansDue(p.id); }
function marginExcess(p){ return 0.5*longVal(p)-(p.loan||0); }
function shortExcess(p){ return (p.collat||0)-0.5*shortLiab(p); }
function inventory(a){ let l=0,s=0; S.players.forEach(p=>{ l+=(p.hold[a]||0); s+=(p.short[a]||0); }); return S.outstanding[a]-l-s; }
function convRatio(){ return Math.pow(2,S.bcSplits||0); }
/* ================= TABS ================= */
function tabCounts(){
  const t={}; ASSETS.forEach(a=>t[a]={buy:0,sell:0});
  const add=(a,dir)=>{ if(t[a]&&dir) t[a][dir]++; };
  (S.tabs.persistent||[]).forEach(x=>add(x.asset,x.dir));
  (S.tabs.mm||[]).forEach(x=>add(x.asset,x.dir));
  (S.tabs.sched||[]).forEach(x=>add(x.asset,x.dir));
  Object.keys(S.trades||{}).forEach(pid=>{
    const tr=S.trades[pid]||{};
    ASSETS.forEach(a=>{
      const e=tr[a]; if(!e||!e.action) return;
      if(e.action==='exercise'){ add('spec','buy'); return; }
      const dir=DIRA[e.action]; if(dir) add(a,dir);
    });
  });
  if(S.bondBuyDouble) t.bond.buy*=2;
  return t;
}
function netTabs(a){ const t=tabCounts(); return t[a].buy-t[a].sell; }
/* ================= TRADE VALIDATION & ENTRY ================= */
function tradeError(pid,asset,action,qty){
  const p=player(pid); if(!p) return 'Unknown player.';
  if(action==='marginbuy'&&!ruleOn('margin')) return 'Margin buying is disabled (house rules).';
  if(action==='short'&&!ruleOn('short')) return 'Short selling is disabled (house rules).';
  if(action==='exercise'&&!ruleOn('warrants')) return 'Warrants are disabled (house rules).';
  if((action==='convPref'||action==='convBond')&&!ruleOn('conversions')) return 'Conversions are disabled (house rules).';
  if(!(qty>0)) return 'Enter a quantity above 0.';
  if(!Number.isInteger(qty)) return 'Whole shares only.';
  if(asset!=='bond'&&(action==='buy'||action==='sell'||action==='short'||action==='cover'||action==='marginbuy'||action==='exercise')&&qty%10!==0)
    return 'Stocks and warrants trade in lots of 10 (bonds singly).';
  const v=unitVal(asset), hold=p.hold[asset]||0;
  const tr=S.trades[pid]||{};
  if(asset==='spec'&&tr.warr&&tr.warr.action==='exercise'&&(action==='sell'||action==='short'))
    return 'Exercising warrants this round: cannot sell/short Spec.';
  if(asset==='warr'&&action==='exercise'&&tr.spec&&(tr.spec.action==='sell'||tr.spec.action==='short'))
    return 'Cannot exercise while selling/shorting Spec.';
  if(action==='buy'){
    if(p.cash<qty*v) return 'Needs '+fmt(qty*v)+' cash.';
    if(inventory(asset)<qty) return 'Bank has only '+inventory(asset)+' available.';
  }else if(action==='marginbuy'){
    if(S.noMarginBuy) return 'Margin buys are blocked this round.';
    if(p.cash<qty*v/2) return 'Needs '+fmt(qty*v/2)+' cash (50% down).';
    if(inventory(asset)<qty) return 'Bank has only '+inventory(asset)+' available.';
  }else if(action==='sell'){
    let avail=hold;
    if(asset==='spec'&&p.freshSpec&&p.freshSpec.round===S.round-1) avail=Math.max(0,avail-p.freshSpec.qty);
    if(qty>avail) return 'You can sell at most '+avail+'.';
  }else if(action==='short'){
    if(inventory(asset)<qty) return 'Bank has only '+inventory(asset)+' available to borrow.';
  }else if(action==='cover'){
    if(qty>(p.short[asset]||0)) return 'You are short only '+(p.short[asset]||0)+'.';
    if(p.cash<qty*v) return 'Cover costs '+fmt(qty*v)+' — not enough cash.';
  }else if(action==='exercise'){
    if(qty>hold) return 'You hold only '+hold+' warrants.';
    if(p.cash<qty*S.strike) return 'Exercise costs '+fmt(qty*S.strike)+' — not enough cash.';
  }else if(action==='convPref'){
    if(qty>hold) return 'You hold only '+hold+'.';
  }else if(action==='convBond'){
    if(qty>hold) return 'You hold only '+hold+'.';
  }
  return null;
}
/* ================= TRADE CODES ================= */
/* ================= FORCED COVER ================= */
function forcedCover(assetOrAll){
  S.players.forEach(p=>{
    ASSETS.forEach(a=>{
      if(assetOrAll!=='all'&&a!==assetOrAll) return;
      const q=p.short[a]||0; if(q<=0) return;
      const cost=q*unitVal(a);
      const rel=(p.collat||0)*((shortLiab(p)>0)?(q*unitVal(a)/shortLiab(p)):0);
      p.cash-=cost; p.cash+=(p.collat||0)>0?rel:0; p.collat=Math.max(0,(p.collat||0)-rel);
      p.short[a]=0;
      feed('⚡ '+p.name+' forced-cover '+q+' '+ASH[a]+' for '+fmt(cost)+'.');
    });
  });
}
/* ================= GAME SETUP ================= */
function newGame(cfg){
  cfg=cfg||{};
  const names=cfg.names.filter(s=>s.trim().length>0);
  const n=names.length;
  const sc=n>6?6/n:1;
  const cash=cfg.cash!=null?cfg.cash:Math.round(2000*sc/10)*10;
  const bcS=cfg.bc!=null?cfg.bc:Math.max(1,Math.round(10*sc));
  const spS=cfg.spec!=null?cfg.spec:Math.max(1,Math.round(10*sc));
  S={
    v:1,name:cfg.name||'Stock Market Game',gameCode:gcode(),rounds:cfg.rounds||10,round:1,phase:'setup',
    prices:Object.assign({},STARTP),prevPrices:Object.assign({},STARTP),
    momentum:0,bubble:0,regime:null,strike:cfg.strike||50,bcSplits:0,specSplits:0,
    outstanding:cfg.outstanding||{bc:300,spec:300,pref:150,bond:150,warr:200},
    splitsOn:cfg.splitsOn!==false,
    players:names.map(nm=>({id:uid(),name:nm.trim(),cash:cash,
      hold:Object.assign(blankHold(),{bc:bcS,spec:spS}),short:blankHold(),loan:0,collat:0,freshSpec:null})),
    trades:{},cashAct:{},tabs:{persistent:[],mm:[],sched:[]},sched:[],
    timerDur:60,tradeTimer:null,auction:null,shortfalls:{},loans:[],
    pendingMoves:blankMoves(),nextMoves:blankMoves(),
    fireChecks:[],firesale:[],preview:null,feed:[],history:[],
    noMarginBuy:false,fireOverride:null,bondBuyDouble:false,bubbleFreeze:false,specNoBubble:false,
    doubleMM:false,mediaRounds:0,eventCard:null,bubbleCard:null,lastD12:null,
    rules:(cfg.rules||allTrue()),
    cfg:{cash:cfg.cash||2000,bc:cfg.bc||10,spec:cfg.spec||0}
  };
  // bubble threshold: random hidden roll per game, or fixed 12
  if(S.rules.randomBubble){
    const blo=cfg.bubbleLo||n, bhi=cfg.bubbleHi||blo+8;
    S.bubbleLo=blo; S.bubbleHi=Math.max(blo,bhi); rollBubbleThreshold();
  }else{ S.bubbleLo=n; S.bubbleHi=n+8; S.bubbleThreshold=12; }
  feed('🎮 Game created: '+S.name+' ('+n+' players, code '+S.gameCode+').');
  if(S.rules.randomBubble) feed('🎲 Random bubble threshold: hidden number between '+S.bubbleLo+'–'+S.bubbleHi+'.');
  startRound(true);

}
function startRound(first){
  S.phase='trading'; S.trades={}; S.cashAct={}; S.tradeErr={}; S.cashErr={};
  S.tradeTimer=null; S.auction=null; S.shortfalls={};
  S.tabs.mm=[]; S.tabs.sched=[]; S.fireChecks=[]; S.firesale=[]; S.preview=null;
  S.pendingMoves=blankMoves(); S.eventCard=null; S.bubbleCard=null; S.lastD12=null;
  S.noMarginBuy=false; S.fireOverride=null; S.bondBuyDouble=false;
  S.bubbleFreeze=false; S.specNoBubble=false; S.doubleMM=false; S.bubbleAuto=false;
  S.nextMoves=blankMoves();
  // scheduled effects due this round
  const due=[]; S.sched=S.sched.filter(e=>{ if(e.applyRound===S.round){ due.push(e); return false; } return true; });
  due.forEach(e=>{
    if(e.kind==='tabs'){ e.tabs.forEach(t=>S.tabs.sched.push(t)); feed('📌 Scheduled tabs added: '+e.tabs.map(t=>t.dir.toUpperCase()+' '+ASH[t.asset]).join(', ')+'.'); }
    else if(e.kind==='noMarginBuy'){ S.noMarginBuy=true; feed('📌 No new Margin Buys this round.'); }
    else if(e.kind==='fireThresh'){ S.fireOverride={roll:e.roll,auto:e.auto}; feed('📌 Fire Sale thresholds this round: '+Math.round(e.roll*100)+'% roll / '+Math.round(e.auto*100)+'% auto.'); }
    else if(e.kind==='ignoreFire'){ S.fireOverride='ignore'; feed('📌 Fire Sale checks ignored this round.'); }
    else if(e.kind==='autoFire'){ S.fireOverride='autoAll'; feed('📌 All Fire Sale checks automatic this round.'); }
    else if(e.kind==='doubleMM'){ S.doubleMM=true; }
    else if(e.kind==='bondBuyDouble'){ S.bondBuyDouble=true; feed('📌 Bond Buy tabs count double this round.'); }
    else if(e.kind==='bubbleFreeze'){ S.bubbleFreeze=true; feed('📌 Bubble cannot increase this round.'); }
    else if(e.kind==='specNoBubble'){ S.specNoBubble=true; feed('📌 Spec Buy imbalance does not generate Bubble this round.'); }
    else if(e.kind==='moveNext'){ S.nextMoves[e.asset]+=e.amt; feed('📌 '+ANAME[e.asset]+' gets '+(e.amt>0?'+':'')+e.amt+' movement this round.'); }
  });
  // market-maker tabs for small tables
  const n=S.players.length;
  let mm=0;
  if(ruleOn('mmtabs')){
    mm=n===4?2:(n===5?1:0);
    if(S.doubleMM){ mm*=2; feed('📌 Market-maker tabs doubled by Foreign Investment Surge.'); }
  }
  for(let i=0;i<mm;i++){
    const a=ASSETS[Math.floor(Math.random()*ASSETS.length)];
    const d=Math.random()<0.5?'buy':'sell';
    S.tabs.mm.push({asset:a,dir:d,mm:true});
  }
  if(mm>0) feed('🎲 '+mm+' market-maker tab(s): '+S.tabs.mm.map(t=>t.dir.toUpperCase()+' '+ASH[t.asset]).join(', ')+'.');
  if(!first) feed('——— Round '+S.round+' trading is open ———');
}
/* ================= RESOLVE ORDERS ================= */
function genMM(){
  const n=S.players.length; let mm=0;
  if(ruleOn('mmtabs')){ mm=n===4?2:(n===5?1:0); if(S.doubleMM) mm*=2; }
  S.tabs.mm=[];
  for(let i=0;i<mm;i++) S.tabs.mm.push({asset:ASSETS[Math.floor(Math.random()*ASSETS.length)],dir:Math.random()<0.5?'buy':'sell',mm:true});
  feed('🎲 Market-maker tabs regenerated: '+ (mm?S.tabs.mm.map(t=>t.dir.toUpperCase()+' '+ASH[t.asset]).join(', '):'none')+'.');
  
}
/* ================= EVENT PHASE ================= */
function schedFx(kind,props,nextRound){
  S.sched.push(Object.assign({kind:kind,applyRound:nextRound?S.round+1:S.round},props||{}));
}
function applyWarFollowup(){
  const r=d6();
  feed('🎲 Rumor of War follow-up d6 = '+r+'.');
  if(r<=3){ addMoves({bc:4,pref:4,bond:-3,spec:7,warr:3}); feed('🕊️ Recovery: BC +4, PF +4, Bond −3, Spec +7, Warr +3.'); }
  else if(r===6){ addMoves({bc:-6,pref:-6,bond:4,spec:-10,warr:-4}); feed('💥 Escalation! War moves repeat: BC −6, PF −6, Bond +4, Spec −10, Warr −4.'); }
  else feed('➖ No further effect.');
}
function addMoves(m){ ASSETS.forEach(a=>{ S.pendingMoves[a]+= (m[a]||0); }); }
function rollD12(){
  // scheduled war follow-up first
  const wars=[]; S.sched=S.sched.filter(e=>{ if(e.kind==='warFollowup'&&e.applyRound===S.round){ wars.push(e); return false; } return true; });
  wars.forEach(applyWarFollowup);
  const rolls=S.mediaRounds>0?2:1;
  if(S.mediaRounds>0){ S.mediaRounds--; feed('📣 Media Frenzy: two d12 rolls this round.'); }
  let triggered=false;
  for(let i=0;i<rolls;i++){
    const r=d12(); S.lastD12=r;
    feed('🎲 Random Event d12 = '+r+(r===12?' — EVENT!':' (no event)'));
    if(r===12){ triggered=true; drawRandomEvent(); }
  }
  if(!triggered){ S.phase='market'; }
  
}
function drawRandomEvent(){
  const c=RANDEVENTS[Math.floor(Math.random()*RANDEVENTS.length)];
  S.eventCard=c; addMoves(c.m||{});
  feed('🃏 RANDOM EVENT: '+c.n+' — '+Object.keys(c.m||{}).map(a=>ASH[a]+' '+(c.m[a]>0?'+':'')+c.m[a]).join(', ')+'. '+c.d);
  applyFx(c.fx,c);
  
}
function applyFx(fx,c){
  const nx=S.round+1;
  switch(fx){
    case 'mom1': S.momentum=Math.max(-4,Math.min(4,S.momentum+1)); feed('📈 Momentum +1 → '+fmtN(S.momentum)+'.'); break;
    case 'idxin': schedFx('tabs',{tabs:[{asset:'bc',dir:'buy'},{asset:'bc',dir:'buy'},{asset:'pref',dir:'buy'},{asset:'pref',dir:'buy'}]},true); break;
    case 'idxdel': schedFx('tabs',{tabs:[{asset:'bc',dir:'sell'},{asset:'bc',dir:'sell'},{asset:'pref',dir:'sell'},{asset:'pref',dir:'sell'}]},true); break;
    case 'allcover': forcedCover('all'); break;
    case 'bccover': forcedCover('bc'); break;
    case 'bubm2': S.bubble=Math.max(0,S.bubble-2); feed('🫧 Bubble −2 → '+S.bubble+'.'); break;
    case 'bubp1': if(!S.bubbleFreeze){ S.bubble+=1; feed('🫧 Bubble +1 → '+S.bubble+'.'); } break;
    case 'surge': if(!S.bubbleFreeze){ S.bubble+=2; feed('🫧 Bubble +2 → '+S.bubble+'.'); } schedFx('doubleMM',{},true); break;
    case 'vol': { const r=d6(); addMoves({spec:r%2===1?-10:10}); feed('🎲 Volatility d6 = '+r+' → Spec '+(r%2===1?'−10':'+10')+'.');
      if(!S.bubbleFreeze){ S.bubble+=2; feed('🫧 Bubble +2 → '+S.bubble+'.'); } break; }
    case 'nomargin': schedFx('noMarginBuy',{},true); break;
    case 'flash': schedFx('fireThresh',{roll:0.30,auto:0.50},true); break;
    case 'nofire': schedFx('ignoreFire',{},true); break;
    case 'autofire': schedFx('autoFire',{},true); break;
    case 'optexp': schedFx('expireWarrants',{},true);
      S.bubble=Math.max(0,S.bubble-1); feed('🫧 Bubble −1 → '+S.bubble+'. Warrants expire at end of round '+nx+'.'); break;
    case 'psych': if(!S.bubbleFreeze){ S.bubble+=3; feed('🫧 Bubble +3 → '+S.bubble+'.'); }
      S.momentum=Math.max(-4,Math.min(4,S.momentum+1)); feed('📈 Momentum +1 → '+fmtN(S.momentum)+'.'); break;
    case 'war': schedFx('warFollowup',{},true); break;
    case 'rotation': { const r=d6();
      if(r<=2){ addMoves({bc:8,pref:6,spec:-10}); feed('🎲 Rotation d6 = '+r+': BC +8, PF +6, Spec −10.'); }
      else if(r<=4){ addMoves({bond:12,bc:-4}); feed('🎲 Rotation d6 = '+r+': Bond +12, BC −4.'); }
      else { addMoves({spec:12,warr:4,bond:-8}); feed('🎲 Rotation d6 = '+r+': Spec +12, Warr +4, Bond −8.'); }
      schedFx('bubbleFreeze',{},true); break; }
    case 'media': S.mediaRounds=2; feed('📣 Media Frenzy: two d12 rolls for the next 2 rounds.'); break;
    case 'bonddouble': schedFx('bondBuyDouble',{},true); break;
    case 'panic': S.players.forEach(p=>{ const v=Math.min(p.loan||0,p.cash); p.cash-=v; p.loan-=v;
      if(v>0) feed('💥 '+p.name+' forced margin repayment '+fmt(v)+'.');
      if((p.loan||0)>0) feed('🚨 '+p.name+' MARGIN DEFAULT — '+fmt(p.loan)+' loan remains!'); }); break;
    case 'inflation': S.players.forEach(p=>{ const l=Math.round(p.cash*0.10); p.cash-=l; feed('🏦 '+p.name+' loses '+fmt(l)+' cash to the bank (inflation).'); }); break;
    case 'specnobub': schedFx('specNoBubble',{},true); break;
    case 'bubfreeze': schedFx('bubbleFreeze',{},true); break;
    case 'pref2': schedFx('moveNext',{asset:'pref',amt:2},true); break;
    case 'exhaust': S.bubble=Math.max(0,S.bubble-1); feed('🫧 Bubble −1 → '+S.bubble+'.');
      S.sched.push({kind:'setMomentum',v:-2,applyRound:nx}); feed('📉 Momentum will be set to −2 entering next round.'); break;
  }
}
/* ================= MARKET PHASE ================= */
function flipTrend(){
  const r=['bull','bear','mixed'][Math.floor(Math.random()*3)];
  feed('🃏 Trend Card flipped: '+r.toUpperCase()+'!');
  setRegime(r);
}
function setRegime(r){
  S.regime=r;
  const m0=S.momentum;
  if(ruleOn('momentum')){
    if(r==='bull'){ S.momentum = m0>=0 ? Math.min(4,m0+1) : 0; }
    else if(r==='bear'){ S.momentum = m0<=0 ? Math.max(-4,m0-1) : 0; }
    else { S.momentum = m0>0?m0-1:(m0<0?m0+1:0); }
    feed('🃏 Market: '+r.toUpperCase()+'. Momentum '+fmtN(m0)+' → '+fmtN(S.momentum)+'.');
    if(ruleOn('bubble')){
      if(Math.abs(S.momentum)===3){ if(!S.bubbleFreeze){ S.bubble+=1; feed('🫧 Momentum at ±3: Bubble +1 → '+S.bubble+'.'); } }
      if(Math.abs(S.momentum)===4){ S.bubbleAuto=true; feed('🫧 Momentum at ±4: BUBBLE AUTO-TRIGGERED!'); }
    }
  }else{
    S.momentum=0;
    feed('🃏 Market: '+r.toUpperCase()+'. (Momentum disabled — no modifier.)');
  }
  // preview moves
  const tc=tabCounts(); const pv={};
  const nP=S.players.length, pct=ruleOn('pctMoves');
  ASSETS.forEach(a=>{
    const net=tc[a].buy-tc[a].sell;
    const cols=moveCols(r,a,nP), ci=colForDyn(net,nP);
    const base=cols[ci].val;
    const mod=MOMMOD[a][Math.abs(S.momentum)]*(S.momentum>0?1:(S.momentum<0?-1:0));
    const adj=(S.pendingMoves[a]||0)+(S.nextMoves[a]||0);
    let dBase=base, dMod=mod, total, neu;
    if(pct){
      dBase=Math.round(base/STARTP[a]*1000)/10; dMod=Math.round(mod/STARTP[a]*1000)/10;
      total=Math.round(S.prices[a]*(base+mod)/STARTP[a])+adj;
      neu=S.prices[a]+total;
    }else{
      total=base+mod+adj; neu=S.prices[a]+total;
    }
    pv[a]={net:net,col:cols[ci].label,base:dBase,mod:dMod,adj:adj,total:total,neu:neu,pct:pct};
  });
  S.preview=pv; S.phase='moves';
  
}
/* ================= MOVES CONFIRM ================= */
function confirmMoves(){
  const pv=S.preview;
  ASSETS.forEach(a=>{ S.prevPrices[a]=S.prices[a]; });
  ASSETS.forEach(a=>{
    let np=pv[a].neu;
    S.prices[a]=np;
    feed('📊 '+ANAME[a]+': '+S.prevPrices[a]+' → '+np+' ('+fmtN(pv[a].total)+').');
  });
  // bankruptcy
  ASSETS.forEach(a=>{
    if(S.prices[a]<1){
      S.players.forEach(p=>{ if((p.hold[a]||0)>0){ feed('💀 '+p.name+' surrenders '+(p.hold[a])+' '+ASH[a]+' (bankrupt).'); p.hold[a]=0; }
        if((p.short[a]||0)>0){ feed('💀 '+p.name+"'s short of "+(p.short[a])+' '+ASH[a]+' wiped out (bankrupt).'); p.short[a]=0; } });
      S.prices[a]=STARTP[a];
      feed('🏚️ '+ANAME[a]+' BANKRUPT — price reset to '+STARTP[a]+'.');
    }
  });
  // splits
  if(S.splitsOn){
    if(S.prices.bc>=80){ doSplit('bc'); }
    if(S.prices.spec>=100){ doSplit('spec'); }
  }
  // warrant decay happens at endround
  S.pendingMoves=blankMoves(); S.nextMoves=blankMoves();
  const anyFire=ruleOn('firesale')&&S.fireChecks.some(c=>c.status==='auto'||c.status==='roll');
  S.phase=anyFire?'firesale':'bubble';
  S.bubbleChecked=false; S.bubbleReady=false; S.bubbleDone=false; S.bubbleCard=null;
  if(anyFire) prepFireSale();
  
}
function doSplit(a){
  const old=S.prices[a];
  S.prices[a]=Math.round(old/2); // round half up (85 -> 43)
  S.players.forEach(p=>{ p.hold[a]=(p.hold[a]||0)*2; p.short[a]=(p.short[a]||0)*2; });
  if(a==='bc'){ S.bcSplits++; feed('✂️ BLUE CHIP 2-for-1 SPLIT at '+old+' → '+S.prices.bc+'. Conversion ratios doubled.'); }
  else { S.specSplits++; const os=S.strike; S.strike=Math.floor(S.strike/2); feed('✂️ SPECULATIVE 2-for-1 SPLIT at '+old+' → '+S.prices.spec+'. Warrant strike '+fmt(os)+' → '+fmt(S.strike)+'.'); }
}
/* ================= FIRE SALE ================= */
function prepFireSale(){
  S.firesale=[];
  S.fireChecks.forEach(c=>{
    if(c.status==='normal') return;
    S.players.forEach(p=>{
      const tr=(S.trades[p.id]||{})[c.asset];
      if(tr&&tr.action==='sell'){
        S.firesale.push({asset:c.asset,seller:p.id,soldQty:tr.qty,exposed:Math.ceil(tr.qty/2),buyerId:'',buyerQty:0});
      }
    });
  });
}
function rollFireSale(ix){
  const c=S.fireChecks[ix]; if(!c||c.status!=='roll') return;
  const r=d6();
  c.status=r>=4?'fire':'normal';
  feed('🎲 Fire Sale roll for '+ANAME[c.asset]+': d6 = '+r+' → '+(r>=4?'FIRE SALE!':'normal execution.'));
  if(c.status==='fire') prepFireSale();
  
}
function setFireBuyer(ix,buyerId){
  const f=S.firesale[ix]; if(!f) return;
  f.buyerId=buyerId;
  if(!buyerId) f.buyerQty=0;
  else f.buyerQty=Math.min(f.buyerQty||0,f.exposed);
  
}
function setFireBuyerQty(ix,v){
  const f=S.firesale[ix]; if(!f) return;
  f.buyerQty=Math.max(0,Math.min(f.exposed,parseInt(v,10)||0));
  
}
function confirmFireSale(){
  S.firesale.forEach(f=>{
    const seller=player(f.seller); const v=unitVal(f.asset);
    const bq=Math.min(f.buyerQty||0,f.exposed);
    const bankQ=f.exposed-bq;
    if(bq>0&&f.buyerId){
      const b=player(f.buyerId);
      if(b&&b.cash>=bq*v){ b.hold[f.asset]+=bq; b.cash-=bq*v; feed('🤝 '+b.name+' bought '+bq+' '+ASH[f.asset]+' of fire-sale stock from '+seller.name+' for '+fmt(bq*v)+'.'); }
      else feed('⚠️ '+seller.name+' fire-sale: buyer could not fund — '+bq+' '+ASH[f.asset]+' went to bank instead.');
    }
    if(bankQ>0){ const refund=bankQ*v*0.35; seller.cash-=refund; feed('🏦 '+seller.name+' sold '+bankQ+' '+ASH[f.asset]+' to bank at 65% ('+fmt(bankQ*v*0.65)+', −'+fmt(refund)+').'); }
  });
  S.phase='bubble';
  S.bubbleChecked=false; S.bubbleReady=false; S.bubbleDone=false; S.bubbleCard=null;
  
}
/* ================= BUBBLE PHASE ================= */
function bubbleStep(){
  if(!ruleOn('bubble')){ S.bubbleReady=false; S.bubbleChecked=true; feed('🫧 Bubble system disabled (house rules).');  return; }
  const th=imbThreshold(S.players.length);
  const tc=tabCounts();
  let crowded=0; const det=[];
  ['spec','warr','bond'].forEach(a=>{
    if(S.specNoBubble&&a==='spec') return;
    const net=Math.abs(tc[a].buy-tc[a].sell);
    let isCrowd=net>=th;
    if(a==='bond'&&!isCrowd){
      // bond mass shorting counts as bond crowding
      let sh=0; S.players.forEach(p=>{ const tr=(S.trades[p.id]||{})['bond']; if(tr&&tr.action==='short') sh+=tr.qty; });
      if(S.outstanding.bond>0&&sh/S.outstanding.bond>=0.25) isCrowd=true;
    }
    if(isCrowd){ crowded++; det.push(ASH[a]); }
  });
  let add=crowded===1?1:(crowded===2?3:(crowded>=3?4:0));
  if(add>0) feed('🫧 Crowding ('+det.join(', ')+'): +'+add+'.');
  let wOwn=0; S.players.forEach(p=>wOwn+=(p.hold.warr||0));
  if(ruleOn('warrants')&&S.outstanding.warr>0&&wOwn/S.outstanding.warr>=0.6){ add+=1; feed('🫧 Warrant concentration (≥60% player-owned): +1.'); }
  if(!S.bubbleFreeze&&add>0){ S.bubble+=add; feed('🫧 Bubble → '+S.bubble+'.'); }
  else if(add>0) feed('🧊 Bubble frozen — no increase this round.');
  const ready=S.bubble>=S.bubbleThreshold||S.bubbleAuto;
  S.bubbleReady=ready; S.bubbleChecked=true;
  if(ready) feed('🫧🫧 BUBBLE READY (threshold was '+S.bubbleThreshold+') — draw from the '+String(S.regime).toUpperCase()+' deck.');
  else feed('🫧 Bubble check complete: '+S.bubble+'/12 — no event.');
  
}
function drawBubble(){
  const deck=BUBBLE_DECKS[S.regime]||BUBBLE_DECKS.mixed;
  const c=deck[Math.floor(Math.random()*deck.length)];
  S.bubbleCard=c; addMoves(c.m||{});
  feed('🃏 BUBBLE EVENT ('+String(S.regime).toUpperCase()+'): '+c.n+' — '+Object.keys(c.m||{}).map(a=>ASH[a]+' '+(c.m[a]>0?'+':'')+c.m[a]).join(', ')+'. '+c.d);
  applyFx(c.fx,c);
  // persistence
  if(S.regime==='bull'){ if(S.bubble<S.bubbleThreshold) S.bubble=S.bubbleThreshold; feed('🫧 Bull persistence: Bubble stays at '+S.bubble+'.'); }
  else if(S.regime==='mixed'){ S.bubble=Math.floor(S.bubble/2); feed('🫧 Mixed persistence: Bubble halved → '+S.bubble+'.'); }
  else { S.bubble=0; feed('🫧 Bear persistence: Bubble reset to 0.'); }
  S.bubbleAuto=false; S.bubbleDone=true; S.phase='endround';
  
}
/* ================= END ROUND ================= */
function endRound(){
  // warrant decay
  if(ruleOn('warrant_decay')){
    const specRose=S.prices.spec>S.prevPrices.spec;
    if(!specRose){ S.prices.warr=Math.max(0,S.prices.warr-1); feed('📉 Warrant decay: −1 → '+S.prices.warr+'.'); }
    else feed('📈 Spec rose — no warrant decay.');
  }
  // scheduled end-of-round effects
  const due=[]; S.sched=S.sched.filter(e=>{ if(e.applyRound===S.round&&(e.kind==='expireWarrants'||e.kind==='setMomentum')){ due.push(e); return false; } return true; });
  due.forEach(e=>{
    if(e.kind==='expireWarrants'){ S.players.forEach(p=>{ if((p.hold.warr||0)>0){ feed('⌛ '+p.name+"'s "+p.hold.warr+' warrants expired.'); p.hold.warr=0; } }); }
    if(e.kind==='setMomentum'){ S.momentum=e.v; feed('📉 Momentum set to '+fmtN(e.v)+'.'); }
  });
  // maintenance flags
  S.players.forEach(p=>{
    if(marginExcess(p)<0) feed('🚨 '+p.name+' MARGIN CALL (excess '+fmt(marginExcess(p))+').');
    if(shortExcess(p)<0) feed('🚨 '+p.name+' SHORT-COLLATERAL CALL (excess '+fmt(shortExcess(p))+').');
  });
  // persistent flow for next round
  const th=imbThreshold(S.players.length); const tc=tabCounts(); const pf=[];
  if(ruleOn('pflow')){
    ASSETS.forEach(a=>{ const net=tc[a].buy-tc[a].sell;
      if(Math.abs(net)>=th){ pf.push({asset:a,dir:net>0?'buy':'sell'}); feed('🌊 Persistent Flow: '+ASH[a]+' '+(net>0?'BUY':'SELL')+' tab next round.'); } });
  }
  // snapshot history
  const snap={round:S.round,prices:Object.assign({},S.prices),nw:{},momentum:S.momentum,bubble:S.bubble,regime:S.regime};
  S.players.forEach(p=>snap.nw[p.id]=Math.round(netWorth(p)));
  S.history.push(snap);
  S.tabs.persistent=pf;
  if(S.round>=S.rounds){
    S.phase='over';
    const win=[...S.players].sort((a,b)=>netWorth(b)-netWorth(a))[0];
    feed('🏆 GAME OVER — '+win.name+' wins with '+fmt(netWorth(win))+'!');
  }else{
    S.round++;
    startRound(false);
  }
  
}
/* ================= RENDER SHELL ================= */
/* ================= SETUP ================= */
/* ================= BOARD ================= */
/* ================= TRADES ================= */
/* ================= PLAYERS / PORTFOLIO ================= */
/* ================= BANK ================= */
/* ================= HISTORY ================= */
/* ================= GM ================= */
/* ================= INIT ================= */
(function init(){
  if(!load()){ S=null; }
  if(S&&!S.rules) S.rules=allTrue();
  if(S){ ensureBubbleRange(); if(S.bubbleThreshold==null) S.bubbleThreshold=12; }
  if(S&&S.phase==='setup') S.phase='trading';

})();

function addPlayer(name){
  if(!S||S.players.length>=12) return null;
  const c=S.cfg||{cash:2000,bc:10,spec:0};
  const p={id:uid(),name:String(name||'Player').slice(0,24),cash:c.cash,
    hold:Object.assign(blankHold(),{bc:c.bc,spec:c.spec}),short:blankHold(),loan:0,collat:0,freshSpec:null};
  S.players.push(p);
  feed('👋 '+p.name+' joined the game.');
  return p;
}
/* ================= TRADING POST: tabs (direction only) ================= */
const TABACTIONS=['buy','sell','short','marginbuy','cover'];
function tabError(pid,asset,action){
  const p=player(pid); if(!p) return 'Unknown player.';
  if(p.out) return 'Player is out of the game.';
  if(ASSETS.indexOf(asset)<0) return 'Unknown asset.';
  if(TABACTIONS.indexOf(action)<0) return 'That action is not a tab.';
  if(action==='marginbuy'&&!ruleOn('margin')) return 'Margin buying is disabled (house rules).';
  if((action==='short'||action==='cover')&&!ruleOn('short')) return 'Short selling is disabled (house rules).';
  return null;
}
function submitTabs(pid,tabs){
  const errs=[];
  S.trades[pid]=S.trades[pid]||{};
  ASSETS.forEach(a=>{
    const act=(tabs||{})[a]||null;
    if(!act){ if(S.trades[pid][a]&&TABACTIONS.indexOf(S.trades[pid][a].action)>=0) delete S.trades[pid][a]; return; }
    const err=tabError(pid,a,act);
    if(err){ errs.push(ANAME[a]+': '+err); return; }
    const prev=(S.trades[pid][a]||{}).qty||0;
    S.trades[pid][a]={action:act,qty:prev};
  });
  return errs;
}
/* ================= TRADING POST: quantities (after the timer) ================= */
function qtyError(pid,asset,action,qty){
  // quantity validation WITHOUT cash checks — funding shortfalls go to auction
  const p=player(pid); if(!p) return 'Unknown player.';
  if(p.out) return 'Player is out of the game.';
  if(!(qty>0)) return 'Enter a quantity above 0.';
  if(!Number.isInteger(qty)) return 'Whole shares only.';
  if(asset!=='bond'&&(action==='buy'||action==='sell'||action==='short'||action==='cover'||action==='marginbuy'||action==='exercise')&&qty%10!==0)
    return 'Stocks and warrants trade in lots of 10 (bonds singly).';
  const v=unitVal(asset), hold=p.hold[asset]||0;
  const tr=S.trades[pid]||{};
  if(asset==='spec'&&tr.warr&&tr.warr.action==='exercise'&&(action==='sell'||action==='short'))
    return 'Exercising warrants this round: cannot sell/short Spec.';
  if(asset==='warr'&&action==='exercise'&&tr.spec&&(tr.spec.action==='sell'||tr.spec.action==='short'))
    return 'Cannot exercise while selling/shorting Spec.';
  if(action==='buy'||action==='marginbuy'){
    if(action==='marginbuy'){
      if(S.noMarginBuy) return 'Margin buys are blocked this round.';
      if(!ruleOn('margin')) return 'Margin buying is disabled (house rules).';
    }
    // bank-inventory shortage is enforced at the sales-first allocation stage
    // (same-round sales can replenish the bank), never at quantity submission.
  }else if(action==='sell'){
    let avail=hold;
    if(asset==='spec'&&p.freshSpec&&p.freshSpec.round===S.round-1) avail=Math.max(0,avail-p.freshSpec.qty);
    if(qty>avail) return 'You can sell at most '+avail+'.';
  }else if(action==='short'){
    if(!ruleOn('short')) return 'Short selling is disabled (house rules).';
    // bank-inventory check deferred to the sales-first execution stage.
  }else if(action==='cover'){
    if(qty>(p.short[asset]||0)) return 'You are short only '+(p.short[asset]||0)+'.';
  }else if(action==='exercise'){
    if(!ruleOn('warrants')) return 'Warrants are disabled (house rules).';
    if(qty>hold) return 'You hold only '+hold+' warrants.';
  }else if(action==='convPref'||action==='convBond'){
    if(!ruleOn('conversions')) return 'Conversions are disabled (house rules).';
    if(qty>hold) return 'You hold only '+hold+'.';
  }else return 'Unknown action.';
  return null;
}
function submitQty(pid,trades,cashAct){
  const errs=[];
  S.trades[pid]=S.trades[pid]||{};
  Object.keys(trades||{}).forEach(a=>{
    if(ASSETS.indexOf(a)<0) return;
    const e=trades[a];
    const existing=S.trades[pid][a];
    if(!e||!e.action){ if(existing&&TABACTIONS.indexOf(existing.action)>=0) existing.qty=0; return; }
    const execAct=['exercise','convPref','convBond'].indexOf(e.action)>=0;
    if(!execAct&&(!existing||existing.action!==e.action)){
      errs.push(ANAME[a]+': no '+e.action+' tab placed — quantity rejected.'); return;
    }
    if(execAct&&existing&&existing.action&&existing.action!==e.action){
      errs.push(ANAME[a]+': conflicts with your '+existing.action+' tab.'); return;
    }
    const qty=Math.round(Number(e.qty)||0);
    if(qty<=0){ if(existing) existing.qty=0; return; } // announce nothing for this tab
    const err=qtyError(pid,a,e.action,qty);
    if(err){ errs.push(ANAME[a]+': '+err); }
    else { S.trades[pid][a]={action:e.action,qty:qty}; }
  });
  S.cashAct[pid]={};
  ['repay','addC','relC'].forEach(k=>{ const v=Math.max(0,Math.round(Number((cashAct||{})[k])||0)); if(v>0) S.cashAct[pid][k]=v; });
  const p=player(pid);
  if(p) feed('📥 '+p.name+' announced quantities.');
  return errs;
}
/* ================= TRADING POST: timer ================= */
function setTimerDur(sec){ sec=Math.max(5,Math.min(600,Math.round(Number(sec))||60)); S.timerDur=sec; return sec; }
function startTradeTimer(){
  const sec=S.timerDur||60;
  S.tradeTimer={endsAt:Date.now()+sec*1000,dur:sec};
  feed('⏱️ Tab timer started: '+sec+' seconds. Place your buy/sell tabs — quantities come after.');
  return S.tradeTimer;
}
function lockTabs(auto){
  S.tradeTimer=null;
  S.phase='execute'; S.shortfalls={}; S.auction=null;
  feed(auto?'⏱️ Time! Tabs are locked — announce your quantities.':'🔒 Tabs locked by the broker — announce your quantities.');
}
/* ================= funding: shortfalls, auctions, loans ================= */
function cashActVals(pid){
  const p=player(pid), c=(S.cashAct||{})[pid]||{};
  return {
    repay:Math.max(0,Math.min(c.repay||0,p?(p.loan||0):0,p?p.cash:0)),
    addC:Math.max(0,Math.min(c.addC||0,p?p.cash:0)),
    relC:Math.max(0,Math.min(c.relC||0,p?shortExcess(p):0))
  };
}
function cashImpact(pid){
  // net cash change if this player's trades + cash actions execute (negative = needs cash)
  const p=player(pid); if(!p) return 0;
  let d=0;
  const tr=S.trades[pid]||{};
  ASSETS.forEach(a=>{
    const e=tr[a]; if(!e||!e.action||!(e.qty>0)) return;
    const v=unitVal(a), q=e.qty;
    if(e.action==='buy') d-=q*v;
    else if(e.action==='marginbuy') d-=q*v/2;
    else if(e.action==='sell') d+=q*v;
    else if(e.action==='short') d+=q*v/2;
    else if(e.action==='cover') d-=q*v;
    else if(e.action==='exercise') d-=q*S.strike;
  });
  const c=cashActVals(pid);
  d-=c.repay; d-=c.addC; d+=c.relC;
  return d;
}
function computeShortfalls(){
  const sf={};
  S.players.forEach(p=>{
    if(p.out) return;
    const net=p.cash+cashImpact(p.id);
    if(net<0) sf[p.id]=Math.round(-net);
  });
  S.shortfalls=sf; return sf;
}
function openAuction(sellerPid,asset,qty){
  const p=player(sellerPid);
  if(!p||p.out) return 'Player is out.';
  if(S.auction) return 'An auction is already running.';
  if(!(S.shortfalls&&S.shortfalls[sellerPid]>0)) return 'No shortfall to cover.';
  if(ASSETS.indexOf(asset)<0) return 'Unknown asset.';
  qty=Math.round(Number(qty)||0);
  if(!(qty>0)) return 'Enter a quantity above 0.';
  if(qty>(p.hold[asset]||0)) return 'You hold only '+(p.hold[asset]||0)+'.';
  S.auction={seller:sellerPid,asset:asset,qty:qty,bids:[],endsAt:Date.now()+60000};
  feed('🔨 '+p.name+' auctions '+qty+' '+ASH[asset]+' — 60 seconds, best offer takes it.');
  return null;
}
function placeBid(pid,amount){
  const a=S.auction;
  if(!a||Date.now()>a.endsAt) return 'No open auction.';
  const p=player(pid); if(!p||p.out) return 'Player is out.';
  if(pid===a.seller) return 'Seller cannot bid.';
  amount=Math.round(Number(amount)||0);
  if(!(amount>0)) return 'Enter a bid above 0.';
  if(amount>p.cash) return 'Not enough cash.';
  const ex=a.bids.find(b=>b.pid===pid);
  if(ex){ if(amount<=ex.amt) return 'Raise your bid above '+fmt(ex.amt)+'.'; ex.amt=amount; }
  else a.bids.push({pid:pid,amt:amount});
  return null;
}
function closeAuction(){
  const a=S.auction; if(!a) return null;
  S.auction=null;
  const seller=player(a.seller);
  let win=null;
  a.bids.forEach(b=>{ if(!win||b.amt>win.amt) win=b; }); // earliest bid wins ties
  if(!win){ feed('🔨 No bids — '+seller.name+'’s '+a.qty+' '+ASH[a.asset]+' lot unsold.'); return {sold:false}; }
  const bp=player(win.pid);
  if(!bp||bp.out||(seller.hold[a.asset]||0)<a.qty||bp.cash<win.amt){
    feed('🔨 Auction void — positions changed.'); computeShortfalls(); return {sold:false};
  }
  seller.hold[a.asset]-=a.qty; bp.hold[a.asset]=(bp.hold[a.asset]||0)+a.qty;
  bp.cash-=win.amt; seller.cash+=win.amt;
  feed('🔨 Sold! '+bp.name+' wins '+a.qty+' '+ASH[a.asset]+' for '+fmt(win.amt)+'.');
  computeShortfalls();
  return {sold:true,winner:win.pid,amt:win.amt};
}
function recordLoan(lenderPid,borrowerPid,amount){
  const l=player(lenderPid), b=player(borrowerPid);
  amount=Math.round(Number(amount)||0);
  if(!l||!b||l.out||b.out) return 'Invalid player.';
  if(lenderPid===borrowerPid) return 'Cannot loan to yourself.';
  if(!(amount>0)) return 'Enter an amount above 0.';
  if(amount>l.cash) return l.name+' has only '+fmt(l.cash)+' cash.';
  l.cash-=amount; b.cash+=amount;
  S.loans.push({lender:lenderPid,borrower:borrowerPid,amount:amount});
  feed('🤝 '+l.name+' loaned '+fmt(amount)+' to '+b.name+'.');
  computeShortfalls();
  return null;
}
function loansOwed(pid){ return (S.loans||[]).filter(l=>l.borrower===pid).reduce((s,l)=>s+l.amount,0); }
function loansDue(pid){ return (S.loans||[]).filter(l=>l.lender===pid).reduce((s,l)=>s+l.amount,0); }
function bankrupt(pid){
  const p=player(pid); if(!p||p.out) return 'Already out.';
  ASSETS.forEach(a=>{ const sh=p.short[a]||0; if(sh>0){ p.cash-=sh*unitVal(a); p.short[a]=0; } });
  ASSETS.forEach(a=>{ p.hold[a]=0; });
  p.out=true;
  delete S.trades[pid]; delete S.cashAct[pid];
  if(S.auction&&S.auction.seller===pid) S.auction=null;
  feed('☠️ '+p.name+' could not cover the shortfall and is OUT of the game.');
  computeShortfalls();
  return null;
}
/* ================= execute ================= */
function runExecute(){
  if(S.auction) return {error:'Close the open auction first.'};
  const sf=computeShortfalls();
  const ids=Object.keys(sf);
  if(ids.length){
    feed('⚠️ '+ids.map(id=>player(id).name+' is '+fmt(sf[id])+' short').join('; ')+' — auction assets or arrange a loan.');
    return {shortfalls:sf};
  }
  doExecute();
  return {done:true};
}
function doExecute(){
  S.tradeTimer=null; S.auction=null;
  // 1) cash actions first (self-clamping)
  S.players.forEach(p=>{
    if(p.out) return;
    const c=cashActVals(p.id);
    if(c.repay>0){ p.cash-=c.repay; p.loan-=c.repay; feed('💵 '+p.name+' repaid '+fmt(c.repay)+' margin.'); }
    if(c.addC>0){ p.cash-=c.addC; p.collat=(p.collat||0)+c.addC; feed('🔒 '+p.name+' added '+fmt(c.addC)+' short collateral.'); }
    if(c.relC>0){ p.cash+=c.relC; p.collat-=c.relC; feed('🔓 '+p.name+' released '+fmt(c.relC)+' short collateral.'); }
  });
  // 2) sales execute first (globally) — sells/shorts free up / consume bank inventory,
  //    then covers/exercises/conversions, then prioritized buys
  S.players.forEach(p=>{
    if(p.out) return;
    const tr=S.trades[p.id]||{};
    ASSETS.forEach(a=>{
      const e=tr[a]; if(!e||!e.action||!(e.qty>0)) return;
      if(e.action!=='sell'&&e.action!=='short') return;
      const err=qtyError(p.id,a,e.action,e.qty);
      if(err){ feed('\u26a0\ufe0f '+p.name+' '+ANAME[a]+' '+e.action+' '+e.qty+' skipped: '+err); delete tr[a]; return; }
      const v=unitVal(a), q=e.qty;
      // bank-inventory enforcement for shorts lives here (sales-first stage),
      // not at quantity submission -- same-round sales replenish the bank.
      if(e.action==='short'&&inventory(a)<q){
        feed('\u26a0\ufe0f '+p.name+' '+ANAME[a]+' short '+q+' skipped: bank has only '+inventory(a)+' available to borrow.');
        delete tr[a]; return;
      }
      if(e.action==='sell'){ p.hold[a]-=q; p.cash+=q*v; feed('🔴 '+p.name+' sold '+q+' '+ASH[a]+' for '+fmt(q*v)+'.'); }
      else { p.cash+=q*v/2; p.collat=(p.collat||0)+q*v/2; p.short[a]=(p.short[a]||0)+q; feed('🔴 '+p.name+' shorted '+q+' '+ASH[a]+' ('+fmt(q*v/2)+' cash, '+fmt(q*v/2)+' collateral).'); }
    });
  });
  S.players.forEach(p=>{
    if(p.out) return;
    const tr=S.trades[p.id]||{};
    ASSETS.forEach(a=>{
      const e=tr[a]; if(!e||!e.action||!(e.qty>0)) return;
      if(e.action==='sell'||e.action==='short'||e.action==='buy'||e.action==='marginbuy') return;
      const err=qtyError(p.id,a,e.action,e.qty);
      if(err){ feed('\u26a0\ufe0f '+p.name+' '+ANAME[a]+' '+e.action+' '+e.qty+' skipped: '+err); return; }
      const v=unitVal(a), q=e.qty;
      if(e.action==='cover'){ p.cash-=q*v; p.short[a]-=q; feed('🟢 '+p.name+' covered '+q+' '+ASH[a]+' for '+fmt(q*v)+'.'); }
      else if(e.action==='exercise'){ p.hold.warr-=q; p.hold.spec=(p.hold.spec||0)+q; p.cash-=q*S.strike; p.freshSpec={qty:q,round:S.round}; feed('📜 '+p.name+' exercised '+q+' warrants \u2192 '+q+' SPEC ('+fmt(q*S.strike)+').'); }
      else if(e.action==='convPref'){ p.hold.pref-=q; const g=q*convRatio(); p.hold.bc+=g; feed('🔁 '+p.name+' converted '+q+' PF \u2192 '+g+' BC.'); }
      else if(e.action==='convBond'){ p.hold.bond-=q; const g=q*20*convRatio(); p.hold.bc+=g; feed('🔁 '+p.name+' converted '+q+' BOND \u2192 '+g+' BC.'); }
    });
  });
  // 2c) bank-shortage rule: per asset, smallest buy orders fill first; ties coin-flipped.
  //     All tab demand (filled or not) still counts for market movement via tabCounts().
  ASSETS.forEach(a=>{
    const orders=[];
    S.players.forEach(p=>{
      if(p.out) return;
      const e=(S.trades[p.id]||{})[a];
      if(!e||!e.action||!(e.qty>0)) return;
      if(e.action!=='buy'&&e.action!=='marginbuy') return;
      const err=qtyError(p.id,a,e.action,e.qty);
      if(err&&err.indexOf('Bank has only')!==0){ feed('\u26a0\ufe0f '+p.name+' '+ANAME[a]+' '+e.action+' '+e.qty+' skipped: '+err); return; }
      orders.push({pid:p.id,action:e.action,qty:e.qty});
    });
    if(!orders.length) return;
    orders.sort((x,y)=>x.qty-y.qty);
    for(let i=0;i<orders.length;){ // coin-flip equal-sized orders
      let j=i+1;
      while(j<orders.length&&orders[j].qty===orders[i].qty) j++;
      for(let k=j-1;k>i;k--){ const r=i+Math.floor(Math.random()*(k-i+1)); const t=orders[k]; orders[k]=orders[r]; orders[r]=t; }
      i=j;
    }
    const v=unitVal(a);
    orders.forEach(o=>{
      const p=player(o.pid), q=o.qty;
      if(inventory(a)<q){ feed('\u26a0\ufe0f '+p.name+' '+ANAME[a]+' '+o.action+' '+q+' skipped: bank shortage \u2014 smaller orders filled first.'); return; }
      if(o.action==='buy'){ p.cash-=q*v; p.hold[a]=(p.hold[a]||0)+q; if(a==='spec') p.freshSpec={qty:q,round:S.round}; feed('🟢 '+p.name+' bought '+q+' '+ASH[a]+' for '+fmt(q*v)+'.'); }
      else { p.cash-=q*v/2; p.loan=(p.loan||0)+q*v/2; p.hold[a]=(p.hold[a]||0)+q; if(a==='spec') p.freshSpec={qty:q,round:S.round}; feed('🟡 '+p.name+' margin-bought '+q+' '+ASH[a]+' ('+fmt(q*v/2)+' cash + '+fmt(q*v/2)+' loan).'); }
    });
  });
  // sells/shorts count toward fire-sale checks
  const sellQty={bc:0,spec:0,pref:0,bond:0,warr:0};
  S.players.forEach(p=>{
    const tr=S.trades[p.id]||{};
    ASSETS.forEach(a=>{ const e=tr[a]; if(e&&(e.action==='sell'||e.action==='short')&&e.qty>0) sellQty[a]+=e.qty; });
  });
  // fire-sale checks
  S.fireChecks=[];
  if(!ruleOn('firesale')){ feed('🚫 Fire sales disabled (house rules).'); }
  else if(S.fireOverride==='ignore'){ feed('🚫 Fire Sale checks ignored (event).'); }
  else ASSETS.forEach(a=>{
    const pct=S.outstanding[a]>0?sellQty[a]/S.outstanding[a]:0;
    if(pct<=0) return;
    let status='normal', roll=S.fireOverride&&S.fireOverride.roll!=null?S.fireOverride.roll:0.5,
        auto=S.fireOverride&&S.fireOverride.auto!=null?S.fireOverride.auto:0.75;
    if(S.fireOverride==='autoAll') status='auto';
    else if(pct>=auto) status='auto';
    else if(pct>=roll) status='roll';
    S.fireChecks.push({asset:a,pct:pct,status:status});
    if(status!=='normal') feed('🔥 Fire Sale '+(status==='auto'?'AUTOMATIC':'check (roll needed)')+' on '+ANAME[a]+' — '+Math.round(pct*100)+'% of outstanding offered.');
  });
  S.cashAct={}; S.tradeErr={}; S.cashErr={}; S.shortfalls={};
  S.phase='event';
  feed('✅ Trades executed. Phase → Event.');
}
function getS(){ return S; }
function setS(s){ S=s; }
module.exports={newGame,getS,setS,addPlayer,submitTabs,submitQty,setTimerDur,startTradeTimer,lockTabs,runExecute,
openAuction,placeBid,closeAuction,recordLoan,bankrupt,loansOwed,loansDue,cashImpact,computeShortfalls,qtyError,tabError,
rollD12,setRegime,confirmMoves,
rollFireSale,setFireBuyer,setFireBuyerQty,confirmFireSale,bubbleStep,drawBubble,endRound,genMM,setRule,flipTrend,
setBubbleRange,forcedCover,player,netWorth,longVal,shortLiab,tabCounts,tradeError,RULES,allTrue,
PHASES,PHLBL,ASSETS,ANAME,ASH,APER,STARTP,MOVE,MOMMOD,moveCols,colForDyn,maxBuyCol,maxSellCol,RANDEVENTS,BUBBLE_DECKS,imbThreshold,fmt,fmtN};
