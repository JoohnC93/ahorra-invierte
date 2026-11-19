(function(root){
'use strict';
const DAY=86400000;
const today=()=>{let d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const dateNum=s=>Date.parse(s+'T00:00:00Z');
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(dateNum(s))&&new Date(dateNum(s)).toISOString().slice(0,10)===s;
const addDays=(s,n)=>new Date(dateNum(s)+n*DAY).toISOString().slice(0,10);
const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
const cents=v=>{let s=String(v).trim().replace(',','.');if(!/^\d+(\.\d{1,2})?$/.test(s))throw Error('Usa un importe positivo con un máximo de dos decimales.');let n=Math.round(Number(s)*100);if(!Number.isSafeInteger(n)||n>100000000000)throw Error('Importe demasiado grande.');return n};
const defaults=()=>({version:3,theme:'dark',opening:0,minimumBalance:0,categories:[['food','Supermercado','🛒','#b9e886'],['cafe','Restauración','☕','#ffb68c'],['home','Vivienda','⌂','#bdb0ff'],['transport','Transporte','🚆','#8bd5ed'],['fun','Ocio','🎟','#f4a6ce'],['health','Salud','✚','#93ddd0'],['other','Otros','◈','#c5c6d0']].map(([id,name,icon,color])=>({id,name,icon,color})),cycles:[],expenses:[],recurring:[],goals:[],allocation:{needs:50,wants:30,saving:20},antThreshold:500});
function occurrence(r,i){if(r.frequency==='once')return i===0?r.start:null;if(r.frequency==='weekly')return addDays(r.start,7*i);let d=new Date(dateNum(r.start)),month=d.getUTCMonth()+i,y=d.getUTCFullYear()+Math.floor(month/12),m=month%12,last=new Date(Date.UTC(y,m+1,0)).getUTCDate();return `${y}-${String(m+1).padStart(2,'0')}-${String(Math.min(d.getUTCDate(),last)).padStart(2,'0')}`}
function dues(d,asof=today()){let current=d.cycles.filter(c=>c.date<=asof).sort((a,b)=>a.date.localeCompare(b.date)).at(-1),end=current?.next>asof?current.next:addDays(asof,30),out=[];for(let r of d.recurring){for(let i=0;i<2400;i++){let date=occurrence(r,i);if(!date||date>=end||r.end&&date>r.end)break;let key=r.id+':'+date;if(!d.expenses.some(e=>e.billKey===key&&e.date<=asof))out.push({...r,date,key,overdue:date<asof});}}return out.sort((a,b)=>a.date.localeCompare(b.date))}
function calculate(d,asof=today()){let cs=d.cycles.filter(c=>c.date<=asof).sort((a,b)=>a.date.localeCompare(b.date)),current=cs.at(-1),expenses=d.expenses.filter(e=>e.date<=asof),balance=d.opening+cs.reduce((s,c)=>s+c.amount,0)-expenses.reduce((s,e)=>s+e.amount,0),saved=d.goals.reduce((s,g)=>s+g.saved,0),pending=dues(d,asof),reserve=pending.reduce((s,r)=>s+r.amount,0),minimumBalance=d.minimumBalance??0,protectedBalance=Math.max(saved,minimumBalance),available=balance-protectedBalance-reserve,days=current&&current.next>asof?Math.round((dateNum(current.next)-dateNum(asof))/DAY):0,daily=days?Math.floor(Math.max(0,available)/days):0;return {current,balance,saved,minimumBalance,protectedBalance,pending,reserve,available,days,daily,weekly:Math.min(Math.max(0,available),daily*Math.min(7,days)),spent:expenses.filter(e=>!current||e.date>=current.date).reduce((s,e)=>s+e.amount,0)}}

// Uses completed calendar days so an unfinished day cannot dilute the spending rate.
// Paid bills are excluded from the rate: upcoming bills are already reserved separately.
function minimumForecast(d,asof=today()){
 const x=calculate(d,asof),minimum=x.minimumBalance;
 const result={minimum,status:'off',projectedBalance:null,shortfall:0,sampleDays:0,average:0,daily:x.daily,days:x.days};
 if(!minimum)return result;
 if(x.balance<minimum)return {...result,status:'breached',shortfall:minimum-x.balance};
 if(!x.days)return {...result,status:'no-cycle'};
 const afterBills=x.balance-x.reserve;
 if(afterBills<minimum)return {...result,status:'payments',projectedBalance:afterBills,shortfall:minimum-afterBills};
 const sampleDays=Math.min(7,Math.max(0,Math.round((dateNum(asof)-dateNum(x.current.date))/DAY)));
 const start=addDays(asof,-sampleDays);
 const variable=d.expenses.filter(e=>!e.billKey&&e.date>=start&&e.date<asof);
 const total=variable.reduce((s,e)=>s+e.amount,0);
 result.sampleDays=sampleDays;
 if(sampleDays<3||!total)return {...result,status:afterBills===minimum?'at-limit':'learning'};
 const average=Math.ceil(total/sampleDays);
 const spentToday=d.expenses.filter(e=>!e.billKey&&e.date===asof).reduce((s,e)=>s+e.amount,0);
 const futureSpend=average*(x.days-1)+Math.max(0,average-spentToday);
 const projectedBalance=afterBills-futureSpend;
 return {...result,average,projectedBalance,shortfall:Math.max(0,minimum-projectedBalance),status:projectedBalance<minimum?'risk':afterBills===minimum?'at-limit':'safe'};
}

function validate(d){const fail=()=>{throw Error('La copia contiene datos inválidos o incompatibles.')};const str=(v,max=160)=>typeof v==='string'&&v.length>0&&v.length<=max;const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000000;const arr=x=>Array.isArray(x)&&x.length<=10000;const unique=a=>new Set(a.map(x=>x.id)).size===a.length;
if(d&&d.minimumBalance!==undefined&&!money(d.minimumBalance))fail();
if(!d||d.version!==3||!['dark','light'].includes(d.theme)||!money(d.opening)||!money(d.antThreshold)||!['categories','cycles','expenses','recurring','goals'].every(k=>arr(d[k])&&unique(d[k]))||!d.categories.length)fail();
for(let c of d.categories)if(!str(c.id)||!str(c.name,40)||!str(c.icon,12)||!/^#[0-9a-f]{6}$/i.test(c.color))fail();let cat=id=>d.categories.some(c=>c.id===id);
for(let c of d.cycles)if(!str(c.id)||!money(c.amount)||!c.amount||!validDate(c.date)||!validDate(c.next)||c.next<=c.date)fail();if(new Set(d.cycles.map(c=>c.date)).size!==d.cycles.length)fail();
for(let e of d.expenses)if(!str(e.id)||!money(e.amount)||!e.amount||!validDate(e.date)||!cat(e.category)||!str(e.note)||e.billKey!==undefined&&!str(e.billKey,220))fail();let keys=d.expenses.filter(e=>e.billKey).map(e=>e.billKey);if(new Set(keys).size!==keys.length)fail();
for(let r of d.recurring)if(!str(r.id)||!str(r.name)||!money(r.amount)||!r.amount||!cat(r.category)||!validDate(r.start)||!['once','weekly','monthly'].includes(r.frequency)||r.end&&(!validDate(r.end)||r.end<r.start))fail();
for(let g of d.goals)if(!str(g.id)||!str(g.name,80)||!money(g.target)||!g.target||!money(g.saved))fail();let a=d.allocation;if(!a||!['needs','wants','saving'].every(k=>Number.isInteger(a[k])&&a[k]>=0&&a[k]<=100)||a.needs+a.wants+a.saving!==100)fail();return d}
function migrate(old){if(old.version===3)return validate(old);if(!Array.isArray(old.cycles)||!Array.isArray(old.categories)||old.cycles.length>10000)throw Error('Formato de copia desconocido.');let d=defaults();d.categories=old.categories.map(([name,color])=>({id:uid(),name,icon:'◈',color}));let savings=0;old.cycles.forEach((c,i)=>{let date=c.date?.slice(0,10),next=old.cycles[i+1]?.date?.slice(0,10)||addDays(date,30);d.cycles.push({id:uid(),date,next:next>date?next:addDays(date,1),amount:cents(c.salary)});savings+=cents(c.goal||0);(c.expenses||[]).forEach(e=>{let cat=d.categories.find(x=>x.name===e.category);if(!cat){cat={id:uid(),name:e.category,icon:'◈',color:'#c5c6d0'};d.categories.push(cat)}d.expenses.push({id:uid(),date:e.date.slice(0,10),amount:cents(e.amount),category:cat.id,note:e.note||cat.name})});if(i===old.cycles.length-1&&cents(c.fixed||0)>0)d.recurring.push({id:uid(),name:'Reserva fija importada · revisar',amount:cents(c.fixed),category:d.categories[0].id,start:date,frequency:'once'});});if(savings)d.goals.push({id:uid(),name:'Ahorro reservado importado · revisar',saved:savings,target:savings});return validate(d)}
function parsePhrase(text){let m=text.match(/(?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{1,2})?\s*(?:€|euros?)?/i);if(!m)return null;let s=m[0].replace(/\s*(€|euros?)\s*$/i,'');if(s.includes(',')||/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');let amount;try{amount=cents(s)}catch{return null}return amount?{amount,note:text.trim().slice(0,160)}:null}
const api={today,validDate,addDays,uid,cents,defaults,occurrence,dues,calculate,minimumForecast,validate,migrate,parsePhrase};if(typeof module!=='undefined')module.exports=api;else root.Finance=api;
})(typeof window!=='undefined'?window:globalThis);
