/* Listening Atlas · Course cumulative des morceaux.
 * Charge uniquement les données audio normalisées par app.js, sans aucune requête réseau.
 * Le moteur des artistes reste indépendant. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const DAY = 86400000;
  const W = {width:980,height:410,left:76,right:29,top:29,bottom:351};
  const WINDOW_DAYS = 26 * 7;
  const fmt = (n, dec=0) => Number(n||0).toLocaleString('fr-FR',{maximumFractionDigits:dec});
  const dayMs = d => Date.parse(d+'T12:00:00Z');
  const addDays = (d,n) => new Date(dayMs(d)+n*DAY).toISOString().slice(0,10);
  const dateLabel = d => new Date(dayMs(d)).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const safe = v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const view = {data:null,pos:0,playing:false,last:0,renderAt:0,frame:0,speed:30,count:10,scale:0,scaleAt:0,pinned:null,rows:new Map(),leader:null};
  const leadersOrder=(a,b)=>b[1]-a[1] || a[0]-b[0];
  function trackKey(t,artists){return /^spotify:track:[A-Za-z0-9]{22}$/.test(t.uri||'') ? t.uri : artists[t.artistId].name+'\u001f'+t.name+'\u001f'+t.album;}
  function eventKey(e){return /^spotify:track:[A-Za-z0-9]{22}$/.test(e.uri||'') ? e.uri : e.artist+'\u001f'+e.name+'\u001f'+e.album;}
  function color(id){
    const tr=view.data.model.tracks[id],name=tr.uri||tr.name+'-'+id;
    let hash=2166136261;
    for(let i=0;i<name.length;i++)hash=Math.imul(hash ^ name.charCodeAt(i),16777619);
    return `hsl(${(hash>>>0)%360} 78% 72%)`;
  }
  function stop(){view.playing=false;view.last=0;cancelAnimationFrame(view.frame);const b=$('trackRacePlay');if(b)b.textContent='▶ Animer';}
  function load(events,model){
    stop();view.rows.clear();view.pos=0;view.count=10;view.speed=30;view.pinned=null;view.leader=null;view.scale=0;
    const idByKey=new Map(model.tracks.map((track,id)=>[trackKey(track,model.artists),id]));
    const daily=new Map();
    for(const e of events){
      if(e.ms<=0)continue;
      const id=idByKey.get(eventKey(e));
      if(id===undefined)continue;
      let entry=daily.get(e.day);
      if(!entry){entry=new Map();daily.set(e.day,entry);}
      entry.set(id,(entry.get(id)||0)+e.ms);
    }
    const snapshots=[],histories=new Map(),cumulative=new Map(),top=[];
    const start=dayMs(model.first),days=Math.floor((dayMs(model.last)-start)/DAY)+1;
    for(let index=0;index<days;index++){
      const date=addDays(model.first,index);
      const entries=daily.get(date);
      if(entries){
        for(const [id,ms] of entries){
          const total=(cumulative.get(id)||0)+ms;
          cumulative.set(id,total);
          let history=histories.get(id);
          if(!history){history=[];histories.set(id,history);}
          history.push([index,total]);
          const old=top.findIndex(pair=>pair[0]===id);
          if(old!==-1)top.splice(old,1);
          const entry=[id,total];
          // Seuls les morceaux dont le cumul vient d'augmenter peuvent
          // entrer dans le top : évite de trier 18 000 morceaux chaque jour.
          if(top.length<100 || leadersOrder(entry,top[top.length-1])<=0){
            let low=0,high=top.length;
            while(low<high){const mid=(low+high)>>1;if(leadersOrder(entry,top[mid])<0)high=mid;else low=mid+1;}
            top.splice(low,0,entry);
            if(top.length>100)top.pop();
          }
        }
      }
      snapshots.push({date,top:top.map(pair=>[...pair])});
    }
    view.data={model,days:snapshots,histories};
    $('trackRaceCount').value='10';$('trackRaceSpeed').value='30';
    $('trackRaceSeek').min='0';$('trackRaceSeek').max=String(Math.max(0,days-1));$('trackRaceSeek').value='0';
    $('trackRaceInner').replaceChildren();
    update(true);
  }
  function atDay(id,day){
    const history=view.data.histories.get(id);
    if(!history || day<0)return 0;
    let a=0,b=history.length;
    while(a<b){const mid=(a+b)>>1;if(history[mid][0]<=day)a=mid+1;else b=mid;}
    return a ? history[a-1][1] : 0;
  }
  function value(id,time){
    const day=Math.floor(time),frac=clamp(time-day,0,1);
    const v0=atDay(id,day),v1=atDay(id,day+1);
    return v0+(v1-v0)*frac;
  }
  function ranking(time){
    const days=view.data.days,i=clamp(Math.floor(time),0,days.length-1),j=Math.min(i+1,days.length-1);
    const ids=new Set([...days[i].top.map(t=>t[0]),...days[j].top.map(t=>t[0])]);
    return [...ids].map(id=>[id,value(id,time)]).filter(([,v])=>v>0).sort(leadersOrder).slice(0,view.count);
  }
  function trackLabel(id){const m=view.data.model,t=m.tracks[id];return `${t.name} — ${m.artists[t.artistId].name}`;}
  function position(time){
    if(!view.data)return;
    stop();view.pos=clamp(time,0,view.data.days.length-1);view.scale=0;update(true);
  }
  function toggle(){
    if(!view.data)return;
    if(view.playing){stop();return;}
    if(view.pos>=view.data.days.length-1)view.pos=0;
    view.playing=true;view.last=0;view.renderAt=0;
    $('trackRacePlay').textContent='Ⅱ Pause';
    view.frame=requestAnimationFrame(tick);
  }
  function tick(now){
    if(!view.playing||!view.data)return;
    if(view.last)view.pos+=Math.min(.18,(now-view.last)/1000)*view.speed;
    view.last=now;
    if(view.pos>=view.data.days.length-1){view.pos=view.data.days.length-1;update();stop();return;}
    if(now-view.renderAt>=32){update();view.renderAt=now;}
    view.frame=requestAnimationFrame(tick);
  }
  function plot(top,time){
    const data=view.data,plotWidth=W.width-W.left-W.right,plotHeight=W.bottom-W.top;
    const start=Math.max(0,time-WINDOW_DAYS),x=d=>W.left+(d-start)/WINDOW_DAYS*plotWidth;
    const currentMax=Math.max(2,(top[0]?.[1]||0)/60000*1.22);
    const now=performance.now();
    if(view.scale===0||!view.playing){view.scale=currentMax;}
    else{const dt=clamp((now-view.scaleAt)/1000,0,.15),tau=currentMax>view.scale?.42:2.3;
      view.scale+=(currentMax-view.scale)*(1-Math.exp(-dt/tau));}
    view.scaleAt=now;
    const max=Math.max(1,view.scale),y=ms=>W.bottom-(ms/60000/max)*plotHeight;
    let html=`<defs><clipPath id="trackGraphClip"><rect x="${W.left}" y="${W.top}" width="${plotWidth}" height="${plotHeight}"/></clipPath></defs>`;
    html+=`<rect x="${W.left}" y="${W.top}" width="${plotWidth}" height="${plotHeight}" fill="#12232a" rx="8"/>`;
    for(let k=0;k<=4;k++){
      const yy=W.bottom-k*plotHeight/4;
      html+=`<line x1="${W.left}" y1="${yy}" x2="${W.width-W.right}" y2="${yy}" stroke="#416160" stroke-opacity=".38" stroke-dasharray="${k?'5 8':'none'}"/>`;
      html+=`<text x="${W.left-11}" y="${yy+4}" text-anchor="end" font-size="12" fill="#9fb9b4" font-family="monospace">${fmt(max*k/4,max<10?1:0)}</text>`;
    }
    for(let t=Math.ceil(start/7)*7;t<=time;t+=7){
      const d=addDays(data.model.first,t),older=addDays(d,-7),xx=x(t);
      if(d.slice(0,7)!==older.slice(0,7)){
        const label=new Date(dayMs(d)).toLocaleDateString('fr-FR',{month:'short',year:'2-digit',timeZone:'UTC'});
        html+=`<line x1="${xx.toFixed(2)}" y1="${W.top}" x2="${xx.toFixed(2)}" y2="${W.bottom}" stroke="#67877f" stroke-opacity=".25"/>`;
        html+=`<text x="${(xx+5).toFixed(2)}" y="${W.bottom+25}" font-size="12" fill="#a6bdb4">${safe(label)}</text>`;
      }
    }
    const sample=[start];for(let t=Math.ceil(start/7)*7;t<time;t+=7)if(t>start+.01)sample.push(t);
    if(time>start+.001)sample.push(time);
    const ids=top.slice(0,10).map(([id])=>id);
    if(view.pinned!==null&&!ids.includes(view.pinned))ids.push(view.pinned);
    html+='<g clip-path="url(#trackGraphClip)">';
    for(const id of ids.slice().reverse()){
      const isPinned=id===view.pinned,muted=view.pinned!==null&&!isPinned;
      const path=sample.map((d,i)=>`${i?'L':'M'}${x(d).toFixed(2)},${y(value(id,d)).toFixed(2)}`).join(' ');
      const stroke=color(id),width=isPinned?2.25:1.5;
      html+=`<path d="${path}" fill="none" stroke="${stroke}" stroke-opacity="${muted?.15:.88}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
      html+=`<circle cx="${x(time).toFixed(2)}" cy="${y(value(id,time)).toFixed(2)}" r="${isPinned?4.8:3.1}" fill="${stroke}" fill-opacity="${muted?.3:1}"/>`;
    }
    html+='</g>';
    html+=`<line x1="${x(time).toFixed(2)}" x2="${x(time).toFixed(2)}" y1="${W.top}" y2="${W.bottom}" stroke="#dbffb9" stroke-opacity=".58" stroke-dasharray="4 7"/>`;
    $('trackRaceChart').innerHTML=html;
  }
  function rankingRows(top){
    const root=$('trackRaceInner'),active=new Set(top.map(([id])=>id)),max=Math.max(1,top[0]?.[1]||1);
    root.style.height=Math.max(150,top.length*53+7)+'px';
    for(const [id,el] of view.rows){
      if(active.has(id))continue;
      el.classList.add('track-out');
      if(!el.dataset.removing){el.dataset.removing='1';setTimeout(()=>{
        if(el.classList.contains('track-out')){el.remove();if(view.rows.get(id)===el)view.rows.delete(id);}else delete el.dataset.removing;
      },280);}
    }
    top.forEach(([id,ms],rank)=>{
      let row=view.rows.get(id);
      const track=view.data.model.tracks[id],artist=view.data.model.artists[track.artistId].name;
      if(!row){
        row=document.createElement('button');row.type='button';row.className='track-racer track-out';row.dataset.id=id;
        row.style.setProperty('--track-color',color(id));
        row.innerHTML='<span class="track-place"></span><span class="track-name"><strong></strong><small></small></span><span class="track-bar"><span></span></span><span class="track-minutes"></span>';
        row.addEventListener('click',()=>{view.pinned=view.pinned===id?null:id;update(true);});
        root.append(row);view.rows.set(id,row);
      }
      row.classList.remove('track-out');row.classList.toggle('track-first',rank===0);row.classList.toggle('track-picked',id===view.pinned);
      row.style.setProperty('--y',rank*53+'px');row.querySelector('.track-place').textContent=String(rank+1);
      row.querySelector('.track-name strong').textContent=track.name;
      row.querySelector('.track-name small').textContent=artist;
      row.querySelector('.track-bar span').style.width=(ms/max*100).toFixed(2)+'%';
      row.querySelector('.track-minutes').textContent=fmt(ms/60000,1)+' min';
      row.title=`${trackLabel(id)} · ${fmt(ms/60000,1)} min cumulées`;
    });
  }
  function update(force=false){
    if(!view.data)return;
    const days=view.data.days,i=clamp(Math.floor(view.pos),0,days.length-1),top=ranking(view.pos);
    const lead=top[0];
    $('trackRaceDate').textContent=dateLabel(days[i].date);
    $('trackRaceMeta').textContent=`Jour ${fmt(i+1)} / ${fmt(days.length)} · ${fmt(view.data.model.tracks.length)} titres distincts`;
    $('trackRaceTitle').textContent=`Top ${view.count} morceaux`;
    $('trackRaceSubtitle').textContent=`${top.length}/${view.count} morceaux classés aujourd’hui · ${fmt(view.speed)} jours par seconde`;
    $('trackRaceLeader').textContent=lead?trackLabel(lead[0]):'—';
    $('trackRaceLeaderMinutes').textContent=lead?fmt(lead[1]/60000,1)+' min cumulées':'Aucune écoute';
    if(view.pinned!==null){
      const t=view.data.model.tracks[view.pinned];
      $('trackRaceFocus').textContent=`Focus : ${trackLabel(view.pinned)} · ${fmt(value(view.pinned,view.pos)/60000,1)} min cumulées · cliquer à nouveau pour retirer`;
    }else $('trackRaceFocus').textContent='Clique sur un titre pour mettre sa courbe en évidence.';
    $('trackRaceSeek').value=String(view.pos);
    $('trackRaceRemaining').textContent=fmt((days.length-1-view.pos)/view.speed)+' s restantes';
    plot(top,view.pos);rankingRows(top);
  }
  $('trackRaceCount').addEventListener('change',e=>{view.count=Number(e.target.value);update(true);});
  $('trackRaceSpeed').addEventListener('change',e=>{view.speed=Number(e.target.value);update(true);});
  $('trackRacePlay').addEventListener('click',toggle);
  $('trackRaceReset').addEventListener('click',()=>position(0));
  $('trackRaceEnd').addEventListener('click',()=>{if(view.data)position(view.data.days.length-1);});
  $('trackRaceSeek').addEventListener('input',e=>position(Number(e.target.value)));
  window.TrackStudio={load,stop};
})();