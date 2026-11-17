/* Listening Atlas · Morceaux, courbe et classement indépendants.
 * L'archive Spotify est analysée uniquement dans le navigateur (aucun appel réseau).
 * Deux classements cumulés : minutes jouées, lectures >= 30 secondes. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const DAY_MS = 86400000;
  const PLOT = {w:980,h:410,l:73,r:25,t:28,b:353};
  const WINDOW_DAYS = 26 * 7;
  const fmt = (n,dec=0) => Number(n || 0).toLocaleString('fr-FR',{maximumFractionDigits:dec});
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const dayMs = d => Date.parse(d+'T12:00:00Z');
  const dateAt = (origin,index) => new Date(dayMs(origin)+index*DAY_MS).toISOString().slice(0,10);
  const dateLabel = d => new Date(dayMs(d)).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  const safe = s => String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const order = (a,b) => b[1]-a[1] || a[0]-b[0];
  const view = {
    data:null, metric:'ms', count:10, linePos:0,rankPos:0,
    linePlaying:false,rankPlaying:false, lineLast:0,rankLast:0,
    lineFrame:0,rankFrame:0, lineRenderAt:0,rankRenderAt:0,
    lineSpeed:30,rankSpeed:30, scale:0,scaleAt:0,pinned:null,
    rankRows:new Map(),lineRows:new Map(),leader:null
  };
  const trackKey = (track,artists) => String(track.uri||'').startsWith('spotify:track:') ? track.uri : artists[track.artistId].name+'\u001f'+track.name+'\u001f'+track.album;
  const eventKey = e => String(e.uri||'').startsWith('spotify:track:') ? e.uri : e.artist+'\u001f'+e.name+'\u001f'+e.album;
  const metricUnit = () => view.metric==='ms' ? 'Minutes cumulées' : 'Écoutes ≥ 30 s cumulées';
  const metricValue = value => view.metric==='ms' ? fmt(value/60000,1)+' min' : fmt(value)+' écoutes';
  const metricShort = value => view.metric==='ms' ? fmt(value/60000,1)+' min' : fmt(value);
  const graphValue = value => view.metric==='ms' ? value/60000 : value;
  function trackLabel(id){const m=view.data.model,t=m.tracks[id];return `${t.name} — ${m.artists[t.artistId].name}`;}
  function color(id){
    const t=view.data.model.tracks[id];const name=(t.uri||'')+'\u001f'+t.name+'\u001f'+id;
    let h=2166136261;
    for(let j=0;j<name.length;j++)h=Math.imul(h^name.charCodeAt(j),16777619);
    return `hsl(${(h>>>0)%360} 78% 72%)`;
  }
  function stopLine(){
    view.linePlaying=false;view.lineLast=0;
    cancelAnimationFrame(view.lineFrame);
    const button=$('trackRacePlay');if(button){button.textContent='▶ Animer la courbe';button.setAttribute('aria-label','Lancer la courbe animée');}
  }
  function stopRank(){
    view.rankPlaying=false;view.rankLast=0;
    cancelAnimationFrame(view.rankFrame);
    const button=$('trackRankPlay');if(button){button.textContent='▶ Animer le classement';button.setAttribute('aria-label','Lancer le classement animé');}
  }
  function stop(){stopLine();stopRank();}
  function updateTop(top,id,total){
    const index=top.findIndex(([other])=>other===id);
    if(index>=0)top.splice(index,1);
    if(total<=0)return;
    const entry=[id,total];
    if(top.length===100 && order(entry,top[top.length-1])>0)return;
    let low=0,high=top.length;
    while(low<high){const mid=(low+high)>>1;if(order(entry,top[mid])<0)high=mid;else low=mid+1;}
    top.splice(low,0,entry);
    if(top.length>100)top.pop();
  }
  function load(events,model){
    stop();
    view.data=null;view.metric='ms';view.count=10;view.linePos=0;view.rankPos=0;
    view.lineSpeed=30;view.rankSpeed=30;view.scale=0;view.scaleAt=0;view.pinned=null;view.leader=null;
    view.rankRows.clear();view.lineRows.clear();
    const byKey=new Map(model.tracks.map((t,id)=>[trackKey(t,model.artists),id]));
    // Journées légères : un total de minutes et un compteur de lectures >= 30 s par morceau.
    const daily=new Map();
    for(const event of events){
      const id=byKey.get(eventKey(event));
      if(id===undefined || event.ms<0)continue;
      let day=daily.get(event.day);
      if(!day){day=new Map();daily.set(event.day,day);}
      const pair=day.get(id)||[0,0];
      pair[0]+=event.ms;
      pair[1]+=event.ms>=30000 ? 1 : 0;
      day.set(id,pair);
    }
    const snapshots=[],histories=new Map(),cumMs=new Map(),cumPlays=new Map();
    const topMs=[],topPlays=[];
    const countDays=Math.floor((dayMs(model.last)-dayMs(model.first))/DAY_MS)+1;
    for(let index=0;index<countDays;index++){
      const date=dateAt(model.first,index),changes=daily.get(date);
      if(changes)for(const [id,pair] of changes){
        const totalMs=(cumMs.get(id)||0)+pair[0],totalPlays=(cumPlays.get(id)||0)+pair[1];
        cumMs.set(id,totalMs);cumPlays.set(id,totalPlays);
        let hist=histories.get(id);
        if(!hist){hist=[];histories.set(id,hist);}
        hist.push([index,totalMs,totalPlays]);
        updateTop(topMs,id,totalMs);
        if(pair[1])updateTop(topPlays,id,totalPlays);
      }
      snapshots.push({date,ms:topMs.map(x=>[...x]),plays:topPlays.map(x=>[...x])});
    }
    view.data={model,days:snapshots,histories};
    $('trackMetricSelect').value='ms';$('trackRaceCount').value='10';
    $('trackLineSpeed').value='30';$('trackRaceSpeed').value='30';
    $('trackRaceSeek').min='0';$('trackRaceSeek').max=String(Math.max(0,countDays-1));$('trackRaceSeek').value='0';
    $('trackRankSeek').min='0';$('trackRankSeek').max=String(Math.max(0,countDays-1));$('trackRankSeek').value='0';
    $('trackLineRanks').replaceChildren();$('trackRaceInner').replaceChildren();
    renderLine();renderRank();
  }
  function atDay(id,day,metric=view.metric){
    const history=view.data.histories.get(id);
    if(!history||day<0)return 0;
    let lo=0,hi=history.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(history[mid][0]<=day)lo=mid+1;else hi=mid;}
    if(!lo)return 0;
    return history[lo-1][metric==='ms'?1:2];
  }
  function value(id,time){
    const i=Math.floor(time),alpha=clamp(time-i,0,1);
    const before=atDay(id,i),after=atDay(id,i+1);
    return before+(after-before)*alpha;
  }
  function ranking(time,size){
    const days=view.data.days,i=clamp(Math.floor(time),0,days.length-1),j=Math.min(days.length-1,i+1);
    const ids=new Set([...days[i][view.metric].map(([id])=>id),...days[j][view.metric].map(([id])=>id)]);
    return [...ids].map(id=>[id,value(id,time)]).filter(([,v])=>v>0).sort(order).slice(0,size);
  }
  function seekLine(pos){
    if(!view.data)return;stopLine();view.linePos=clamp(pos,0,view.data.days.length-1);view.scale=0;renderLine();
  }
  function seekRank(pos){
    if(!view.data)return;stopRank();view.rankPos=clamp(pos,0,view.data.days.length-1);renderRank();
  }
  function toggleLine(){
    if(!view.data)return;
    if(view.linePlaying){stopLine();return;}
    if(view.linePos>=view.data.days.length-1){view.linePos=0;view.scale=0;}
    view.linePlaying=true;view.lineLast=0;view.lineRenderAt=0;
    $('trackRacePlay').textContent='Ⅱ Pause courbe';
    view.lineFrame=requestAnimationFrame(tickLine);
  }
  function toggleRank(){
    if(!view.data)return;
    if(view.rankPlaying){stopRank();return;}
    if(view.rankPos>=view.data.days.length-1)view.rankPos=0;
    view.rankPlaying=true;view.rankLast=0;view.rankRenderAt=0;
    $('trackRankPlay').textContent='Ⅱ Pause classement';
    view.rankFrame=requestAnimationFrame(tickRank);
  }
  function tickLine(now){
    if(!view.linePlaying||!view.data)return;
    if(view.lineLast)view.linePos+=Math.min(.18,(now-view.lineLast)/1000)*view.lineSpeed;
    view.lineLast=now;
    if(view.linePos>=view.data.days.length-1){view.linePos=view.data.days.length-1;renderLine();stopLine();return;}
    if(now-view.lineRenderAt>=32){renderLine();view.lineRenderAt=now;}
    view.lineFrame=requestAnimationFrame(tickLine);
  }
  function tickRank(now){
    if(!view.rankPlaying||!view.data)return;
    if(view.rankLast)view.rankPos+=Math.min(.18,(now-view.rankLast)/1000)*view.rankSpeed;
    view.rankLast=now;
    if(view.rankPos>=view.data.days.length-1){view.rankPos=view.data.days.length-1;renderRank();stopRank();return;}
    if(now-view.rankRenderAt>=32){renderRank();view.rankRenderAt=now;}
    view.rankFrame=requestAnimationFrame(tickRank);
  }
  function graph(top,time){
    const data=view.data, pw=PLOT.w-PLOT.l-PLOT.r, ph=PLOT.b-PLOT.t;
    const start=Math.max(0,time-WINDOW_DAYS),x=d=>PLOT.l+(d-start)/WINDOW_DAYS*pw;
    const target=Math.max(2,graphValue(top[0]?.[1]||0)*1.2),now=performance.now();
    if(!view.scale||!view.linePlaying)view.scale=target;
    else{
      const dt=clamp((now-view.scaleAt)/1000,0,.15),tau=target>view.scale?.48:2.4;
      view.scale+=(target-view.scale)*(1-Math.exp(-dt/tau));
    }
    view.scaleAt=now;
    const max=Math.max(1,view.scale),y=num=>PLOT.b-graphValue(num)/max*ph;
    let svg=`<defs><clipPath id="trackGraphClip"><rect x="${PLOT.l}" y="${PLOT.t}" width="${pw}" height="${ph}"/></clipPath></defs>`;
    svg+=`<rect x="${PLOT.l}" y="${PLOT.t}" width="${pw}" height="${ph}" rx="8" fill="#10252a"/>`;
    for(let k=0;k<=4;k++){
      const yy=PLOT.b-k*ph/4;
      svg+=`<line x1="${PLOT.l}" y1="${yy}" x2="${PLOT.w-PLOT.r}" y2="${yy}" stroke="#416160" stroke-opacity=".38" stroke-dasharray="${k?'5 8':'none'}"/>`;
      svg+=`<text x="${PLOT.l-10}" y="${yy+4}" text-anchor="end" font-size="12" fill="#9fb9b4" font-family="monospace">${fmt(max*k/4,max<10?1:0)}</text>`;
    }
    for(let t=Math.ceil(start/7)*7;t<=time;t+=7){
      const d=dateAt(data.model.first,t),older=dateAt(data.model.first,t-7),xx=x(t);
      if(d.slice(0,7)!==older.slice(0,7)){
        const label=new Date(dayMs(d)).toLocaleDateString('fr-FR',{month:'short',year:'2-digit',timeZone:'UTC'});
        svg+=`<line x1="${xx.toFixed(2)}" y1="${PLOT.t}" x2="${xx.toFixed(2)}" y2="${PLOT.b}" stroke="#67877f" stroke-opacity=".25"/>`;
        svg+=`<text x="${(xx+5).toFixed(2)}" y="${PLOT.b+25}" font-size="12" fill="#a6bdb4">${safe(label)}</text>`;
      }
    }
    const samples=[start];
    for(let t=Math.ceil(start/7)*7;t<time;t+=7)if(t>start+.01)samples.push(t);
    if(time>start+.001)samples.push(time);
    const ids=top.map(([id])=>id);
    if(view.pinned!==null&&!ids.includes(view.pinned))ids.push(view.pinned);
    svg+='<g clip-path="url(#trackGraphClip)">';
    for(const id of ids.slice().reverse()){
      const pinned=id===view.pinned,muted=view.pinned!==null&&!pinned;
      const path=samples.map((d,i)=>`${i?'L':'M'}${x(d).toFixed(2)},${y(value(id,d)).toFixed(2)}`).join(' ');
      const paint=color(id),width=pinned?2.2:1.45;
      svg+=`<path d="${path}" fill="none" stroke="${paint}" stroke-opacity="${muted?.13:.89}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
      svg+=`<circle cx="${x(time).toFixed(2)}" cy="${y(value(id,time)).toFixed(2)}" r="${pinned?4.7:3.0}" fill="${paint}" fill-opacity="${muted?.3:1}"/>`;
    }
    svg+='</g>';
    svg+=`<line x1="${x(time).toFixed(2)}" x2="${x(time).toFixed(2)}" y1="${PLOT.t}" y2="${PLOT.b}" stroke="#dcffb9" stroke-opacity=".6" stroke-dasharray="4 7"/>`;
    $('trackRaceChart').innerHTML=svg;
    $('trackRaceChart').setAttribute('aria-label',`${metricUnit()} au ${dateLabel(data.days[Math.floor(time)].date)} ; ${top.length} morceaux tracés`);
  }
  function lineRanking(top){
    const root=$('trackLineRanks'),present=new Set(top.map(([id])=>id)),max=Math.max(1,top[0]?.[1]||1);
    for(const [id,row] of view.lineRows){
      if(present.has(id))continue;
      row.classList.add('track-line-out');
      if(!row.dataset.removing){row.dataset.removing='1';setTimeout(()=>{if(row.classList.contains('track-line-out')){row.remove();if(view.lineRows.get(id)===row)view.lineRows.delete(id);}else delete row.dataset.removing;},300);}
    }
    top.forEach(([id,score],rank)=>{
      let row=view.lineRows.get(id);
      if(!row){
        row=document.createElement('button');row.type='button';row.className='track-line-entry track-line-out';row.dataset.id=id;
        row.style.setProperty('--track-color',color(id));
        row.innerHTML='<span class="track-line-place"></span><span class="track-line-name"></span><span class="track-line-score"></span><span class="track-line-bar"><span></span></span>';
        row.addEventListener('click',()=>{view.pinned=view.pinned===id?null:id;renderLine();});
        root.append(row);view.lineRows.set(id,row);
      }
      row.classList.remove('track-line-out');row.classList.toggle('track-line-first',rank===0);row.classList.toggle('track-line-selected',view.pinned===id);
      row.style.setProperty('--line-y',rank*44+'px');row.title=trackLabel(id)+' · '+metricValue(score);
      row.querySelector('.track-line-place').textContent=String(rank+1).padStart(2,'0');
      row.querySelector('.track-line-name').textContent=view.data.model.tracks[id].name;
      row.querySelector('.track-line-score').textContent=metricShort(score);
      row.querySelector('.track-line-bar span').style.width=(score/max*100).toFixed(1)+'%';
    });
  }
  function renderLine(){
    if(!view.data)return;
    const data=view.data,days=data.days,i=clamp(Math.floor(view.linePos),0,days.length-1),top=ranking(view.linePos,10);
    const leader=top[0];
    $('trackRaceDate').textContent=dateLabel(days[i].date);
    $('trackRaceMeta').textContent=`Jour ${fmt(i+1)} / ${fmt(days.length)} · courbe indépendante`;
    $('trackRaceLeader').textContent=leader?trackLabel(leader[0]):'—';
    $('trackRaceLeaderMinutes').textContent=leader?metricValue(leader[1]):'Aucune écoute';
    $('trackRaceLeader').style.color=leader?color(leader[0]):'var(--lime)';
    $('trackLineUnits').textContent=metricUnit();$('trackLineBoardUnit').textContent=metricUnit();
    $('trackLineIndicator').textContent=metricUnit();
    $('trackLineFocus').textContent=view.pinned===null?'Sélectionne un morceau dans le Top 10 pour mettre sa courbe en évidence.':`Focus : ${trackLabel(view.pinned)} · ${metricValue(value(view.pinned,view.linePos))}. Clique à nouveau pour retirer.`;
    $('trackRaceSeek').value=String(view.linePos);
    $('trackRaceRemaining').textContent=fmt((days.length-1-view.linePos)/view.lineSpeed)+' s restantes';
    graph(top,view.linePos);lineRanking(top);
  }
  function rankRows(top){
    const root=$('trackRaceInner'),active=new Set(top.map(([id])=>id)),max=Math.max(1,top[0]?.[1]||1);
    root.style.height=Math.max(120,top.length*53+9)+'px';
    for(const [id,row] of view.rankRows){
      if(active.has(id))continue;
      row.classList.add('track-out');
      if(!row.dataset.removing){row.dataset.removing='1';setTimeout(()=>{if(row.classList.contains('track-out')){row.remove();if(view.rankRows.get(id)===row)view.rankRows.delete(id);}else delete row.dataset.removing;},280);}
    }
    top.forEach(([id,score],rank)=>{
      let row=view.rankRows.get(id);
      const t=view.data.model.tracks[id],artist=view.data.model.artists[t.artistId].name;
      if(!row){
        row=document.createElement('button');row.type='button';row.className='track-racer track-out';row.dataset.id=id;
        row.style.setProperty('--track-color',color(id));
        row.innerHTML='<span class="track-place"></span><span class="track-name"><strong></strong><small></small></span><span class="track-bar"><span></span></span><span class="track-minutes"></span>';
        row.addEventListener('click',()=>{view.pinned=view.pinned===id?null:id;renderLine();renderRank();});
        root.append(row);view.rankRows.set(id,row);
      }
      row.classList.remove('track-out');row.classList.toggle('track-first',rank===0);row.classList.toggle('track-picked',id===view.pinned);
      row.style.setProperty('--y',rank*53+'px');row.title=trackLabel(id)+' · '+metricValue(score);
      row.querySelector('.track-place').textContent=String(rank+1);
      row.querySelector('.track-name strong').textContent=t.name;
      row.querySelector('.track-name small').textContent=artist;
      row.querySelector('.track-bar span').style.width=(score/max*100).toFixed(2)+'%';
      row.querySelector('.track-minutes').textContent=metricValue(score);
    });
  }
  function renderRank(){
    if(!view.data)return;
    const days=view.data.days,i=clamp(Math.floor(view.rankPos),0,days.length-1),top=ranking(view.rankPos,view.count);
    $('trackRankDate').textContent=dateLabel(days[i].date);
    $('trackRankMeta').textContent=`Jour ${fmt(i+1)} / ${fmt(days.length)} · classement indépendant`;
    $('trackRaceTitle').textContent=`Top ${view.count} morceaux · ${view.metric==='ms'?'minutes':'écoutes'}`;
    $('trackRaceSubtitle').textContent=`${top.length}/${view.count} titres classés à cette date · ${metricUnit().toLowerCase()} · ${view.rankSpeed} jours/s`;
    $('trackRaceFocus').textContent=view.pinned===null?'Clique sur un titre pour mettre sa courbe en évidence plus haut.':`Morceau sélectionné : ${trackLabel(view.pinned)}. La courbe conserve sa propre date.`;
    $('trackRankSeek').value=String(view.rankPos);
    $('trackRankRemaining').textContent=fmt((days.length-1-view.rankPos)/view.rankSpeed)+' s restantes';
    rankRows(top);
  }
  $('trackMetricSelect').addEventListener('change',e=>{
    view.metric=e.target.value==='plays'?'plays':'ms';view.scale=0;renderLine();renderRank();
  });
  $('trackLineSpeed').addEventListener('change',e=>{view.lineSpeed=Number(e.target.value)||30;renderLine();});
  $('trackRaceSpeed').addEventListener('change',e=>{view.rankSpeed=Number(e.target.value)||30;renderRank();});
  $('trackRaceCount').addEventListener('change',e=>{view.count=Number(e.target.value)||10;renderRank();});
  $('trackRacePlay').addEventListener('click',toggleLine);
  $('trackRaceReset').addEventListener('click',()=>seekLine(0));
  $('trackRaceEnd').addEventListener('click',()=>{if(view.data)seekLine(view.data.days.length-1);});
  $('trackRaceSeek').addEventListener('input',e=>seekLine(Number(e.target.value)));
  $('trackRankPlay').addEventListener('click',toggleRank);
  $('trackRankReset').addEventListener('click',()=>seekRank(0));
  $('trackRankEnd').addEventListener('click',()=>{if(view.data)seekRank(view.data.days.length-1);});
  $('trackRankSeek').addEventListener('input',e=>seekRank(Number(e.target.value)));
  window.TrackStudio={load,stop};
})();