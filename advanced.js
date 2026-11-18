/* Listening Atlas · Analyses avancées · 100 % locales, sans requête réseau. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const DAY = 86400000;
  const fmt = (v,dec=0) => Number(v||0).toLocaleString('fr-FR',{maximumFractionDigits:dec});
  const pct = (n,d) => d ? fmt(n/d*100,1)+' %' : '—';
  const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const minutes = ms => fmt(ms/60000,1)+' min';
  const hours = ms => fmt(ms/3600000,1)+' h';
  const metric = s => view.metric==='plays'?s.plays:s.ms;
  const value = s => view.metric==='plays'?fmt(s.plays)+' écoutes':minutes(s.ms);
  const dateNumber = day => Date.parse(day+'T12:00:00Z');
  const dateLabel = day => new Date(dateNumber(day)).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
  const monthlyLabel = month => new Date(dateNumber(month+'-01')).toLocaleDateString('fr-FR',{month:'short',year:'2-digit',timeZone:'UTC'});
  const addDay = (day,n) => new Date(dateNumber(day)+n*DAY).toISOString().slice(0,10);
  const monday = day => addDay(day,-((new Date(dateNumber(day)).getUTCDay()+6)%7));
  const sorted = (map,key='ms') => [...map.values()].sort((a,b)=>b[key]-a[key] || String(a.name||'').localeCompare(String(b.name||''),'fr'));
  const entry = (name,id) => ({name,id,ms:0,plays:0,events:0,skips:0,skipKnown:0,short:0});
  const view = {records:[],model:null,albums:[],albumByKey:new Map(),globalFirstArtists:new Map(),globalFirstTracks:new Map(),year:'all',metric:'ms',albumRace:null, albumTime:0,albumPlaying:false,albumFrame:0,albumLast:0,albumRenderAt:0,albumSpeed:30,albumCount:10,albumRows:new Map()};
  const cards = data => `<div class="adv-cards">${data.map(([title,number,help])=>`<div class="adv-card"><span>${esc(title)}</span><strong>${esc(number)}</strong><small>${esc(help||'')}</small></div>`).join('')}</div>`;
  const noData = (msg='Aucune donnée disponible dans cet export.') => `<p class="adv-empty">${esc(msg)}</p>`;
  const bars = (items,{label,max=10,kind='rank'}={}) => {
    const arr=items.slice(0,max), highest=Math.max(1,...arr.map(x=>metric(x)));
    return arr.length?`<div class="adv-barlist">${arr.map((a,i)=>`<div class="adv-barrow"><span class="adv-pos">${i+1}</span><span class="adv-name" title="${esc(a.name)}">${esc(a.name)}${a.sub?`<small>${esc(a.sub)}</small>`:''}</span><span class="adv-meter"><span style="width:${(metric(a)/highest*100).toFixed(2)}%"></span></span><strong>${esc(value(a))}</strong></div>`).join('')}</div>`:noData();
  };
  function plotMonths(points,{unit='min',color='#c8ff77',percent=false}={}) {
    if(!points.length)return noData();
    const W=800,H=230,L=52,R=12,T=16,B=38,P=H-T-B,X=i=>L+(W-L-R)*(points.length===1?.5:i/(points.length-1));
    const all=points.map(a=>a[1]);const peak=Math.max(percent?1:1,...all);
    const y=v=>T+P-(v/peak)*P;
    let out='';
    for(let i=0;i<=4;i++){const q=peak*i/4;out+=`<line x1="${L}" y1="${y(q)}" x2="${W-R}" y2="${y(q)}" stroke="#406059" stroke-opacity=".5" stroke-dasharray="4 6"/><text x="${L-9}" y="${y(q)+4}" text-anchor="end" fill="#9eb7ae" font-size="11">${fmt(q,q<10?1:0)}${percent?'%':''}</text>`;}
    const stride=Math.max(1,Math.ceil(points.length/9));
    points.forEach(([m,v],i)=>{if(i%stride===0||i===points.length-1)out+=`<text x="${X(i).toFixed(1)}" y="${H-12}" text-anchor="middle" fill="#a5bfb9" font-size="11">${esc(monthlyLabel(m))}</text>`;});
    const path=points.map(([,v],i)=>(i?'L':'M')+X(i).toFixed(2)+','+y(v).toFixed(2)).join(' ');
    out+=`<path d="${path}" fill="none" stroke="${color}" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"/>`;
    points.forEach(([m,v],i)=>{if(points.length<=25||i%stride===0||i===points.length-1)out+=`<circle cx="${X(i)}" cy="${y(v)}" r="3" fill="${color}"><title>${esc(m)} · ${fmt(v,1)} ${esc(unit)}</title></circle>`;});
    return `<svg class="adv-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution mensuelle, ${esc(unit)}">${out}</svg>`;
  }
  function add(map,id,name,r,sub=''){
    if(!map.has(id))map.set(id,{...entry(name,id),sub,tracks:new Set(),months:new Set()});
    const a=map.get(id);a.ms+=r.ms;a.events++;if(r.q)a.plays++;
    if(r.ms<30000)a.short++;
    if(r.skipped!==null){a.skipKnown++;if(r.skipped)a.skips++;}
    a.months.add(r.month);return a;
  }
  function normalize(events,model){
    const aIndex=new Map(model.artists.map((a,i)=>[a.name,i]));
    const tIndex=new Map(model.tracks.map((t,i)=>[/^spotify:track:[A-Za-z0-9]{22}$/.test(t.uri)?t.uri:model.artists[t.artistId].name+'\x1f'+t.name+'\x1f'+t.album,i]));
    view.records=[];view.albums=[];view.albumByKey.clear();view.globalFirstArtists.clear();view.globalFirstTracks.clear();
    for(const r of events){
      const aid=aIndex.get(r.artist),tid=tIndex.get(/^spotify:track:[A-Za-z0-9]{22}$/.test(r.uri)?r.uri:r.artist+'\x1f'+r.name+'\x1f'+r.album);
      if(aid===undefined||tid===undefined)continue;
      if(!view.globalFirstArtists.has(aid))view.globalFirstArtists.set(aid,r.day);
      if(!view.globalFirstTracks.has(tid))view.globalFirstTracks.set(tid,r.day);
      let alb=-1;
      if(r.album){const key=aid+'\x1f'+r.album;if(!view.albumByKey.has(key)){view.albumByKey.set(key,view.albums.length);view.albums.push({name:r.album,artist:model.artists[aid].name,artistId:aid,tracks:new Set()});}alb=view.albumByKey.get(key);view.albums[alb].tracks.add(tid);}
      view.records.push({day:r.day,month:r.day.slice(0,7),week:monday(r.day),hour:r.hour,unix:r.unix,ms:r.ms,q:r.ms>=30000?1:0,aid,tid,alb, skipped:r.skipped??null,shuffle:r.shuffle??null,offline:r.offline??null,incognito:r.incognito??null,platform:r.platform||null});
    }
    view.records.sort((a,b)=>a.unix-b.unix);
  }
  function analyze(){
    const ev=view.year==='all'?view.records:view.records.filter(r=>r.day.slice(0,4)===view.year);
    const artists=new Map(),tracks=new Map(),albums=new Map(),days=new Map(),weeks=new Map(),months=new Map(),platform=new Map(),firstArtist=new Map(),firstTrack=new Map(),activeByArtist=new Map(),seenArtist=new Map(),returns=new Map(),datesByTrack=new Map();
    const flags={skipped:{n:0,yes:0},shuffle:{n:0,yes:0},offline:{n:0,yes:0},incognito:{n:0,yes:0}};
    let total=0,plays=0,short=0,replays=0,topRepeat=null,consecutive={count:0,tid:null,first:''},run={count:0,tid:null,unix:0,first:''};
    const qualifiedBefore=new Set(),monthArtists=new Map(),weeklyTracks=new Map(),weeklyArtists=new Map();
    const repeat=new Map();
    const slots=[{name:'Nuit (23–5 h)',ms:0,plays:0},{name:'Matin (5–12 h)',ms:0,plays:0},{name:'Après-midi (12–18 h)',ms:0,plays:0},{name:'Soir (18–23 h)',ms:0,plays:0}];
    for(const r of ev){
      total+=r.ms;plays+=r.q;short+=r.ms<30000?1:0;
      const a=add(artists,r.aid,view.model.artists[r.aid].name,r),t=add(tracks,r.tid,view.model.tracks[r.tid].name,r,view.model.artists[r.aid].name);
      a.tracks.add(r.tid);
      if(!datesByTrack.has(r.tid))datesByTrack.set(r.tid,{first:r.day,last:r.day});else datesByTrack.get(r.tid).last=r.day;
      if(!monthArtists.has(r.month))monthArtists.set(r.month,new Set());monthArtists.get(r.month).add(r.aid);
      for(const [map,key,name] of [[weeklyTracks,r.week+'|'+r.tid,trackName(r.tid)],[weeklyArtists,r.week+'|'+r.aid,view.model.artists[r.aid].name]]){
        if(!map.has(key))map.set(key,{name,id:key,week:r.week,ms:0,plays:0});const m=map.get(key);m.ms+=r.ms;m.plays+=r.q;
      }
      if(r.alb!==-1){const ref=view.albums[r.alb];add(albums,r.alb,ref.name,r,ref.artist).tracks.add(r.tid);}
      for(const [map,key] of [[days,r.day],[weeks,r.week],[months,r.month]]){
        if(!map.has(key))map.set(key,{name:key,day:key,ms:0,plays:0,events:0,skips:0,skipKnown:0,short:0});
        const x=map.get(key);x.ms+=r.ms;x.plays+=r.q;x.events++;if(r.ms<30000)x.short++;if(r.skipped!==null){x.skipKnown++;if(r.skipped)x.skips++;}
      }
      const slot=r.hour>=23||r.hour<5?0:r.hour<12?1:r.hour<18?2:3;slots[slot].ms+=r.ms;slots[slot].plays+=r.q;
      if(r.platform)platform.set(r.platform,(platform.get(r.platform)||0)+r.ms);
      for(const key of Object.keys(flags))if(r[key]!==null){flags[key].n++;if(r[key])flags[key].yes++;}
      if(!firstArtist.has(r.aid)&&view.globalFirstArtists.get(r.aid)===r.day)firstArtist.set(r.aid,r.day);
      if(!firstTrack.has(r.tid)&&view.globalFirstTracks.get(r.tid)===r.day)firstTrack.set(r.tid,r.day);
      if(!activeByArtist.has(r.aid))activeByArtist.set(r.aid,new Set());activeByArtist.get(r.aid).add(r.month);
      if(seenArtist.has(r.aid)){
        const diff=(dateNumber(r.day)-dateNumber(seenArtist.get(r.aid)))/DAY;
        if(diff>=180)returns.set(r.aid,(returns.get(r.aid)||0)+1);
      }
      seenArtist.set(r.aid,r.day);
      if(r.q){
        if(qualifiedBefore.has(r.tid))replays++;else qualifiedBefore.add(r.tid);
        const dayKey=r.day+'|'+r.tid,next=(repeat.get(dayKey)||0)+1;repeat.set(dayKey,next);
        if(!topRepeat||next>topRepeat.count)topRepeat={count:next,tid:r.tid,day:r.day};
        if(run.tid===r.tid&&r.unix-run.unix<=20*60000&&r.unix>=run.unix){run.count++;run.unix=r.unix;}
        else run={count:1,tid:r.tid,unix:r.unix,first:r.day};
        if(run.count>consecutive.count)consecutive={count:run.count,tid:r.tid,first:run.first};
      }else run={count:0,tid:null,unix:r.unix,first:r.day};
    }
    // Une session est estimée à partir de lectures terminées à moins de 30 min d'intervalle.
    let longest={ms:0,events:0,start:null,end:null},cur=null;const sessions=[];
    for(const r of ev){
      const start=r.unix-r.ms;
      if(!cur||start-cur.end>30*60000||start-cur.end< -4*3600000){
        if(cur){sessions.push(cur);if(cur.ms>longest.ms)longest=cur;}
        cur={start,end:r.unix,ms:r.ms,events:1};
      }else{cur.end=Math.max(cur.end,r.unix);cur.ms+=r.ms;cur.events++;}
    }
    if(cur){sessions.push(cur);if(cur.ms>longest.ms)longest=cur;}
    sessions.sort((a,b)=>b.ms-a.ms);
    const dlist=[...days.keys()].filter(x=>days.get(x).ms>0).sort();
    let streak={days:0,from:null,to:null},span={days:0,from:null,to:null},prev=null;
    for(const day of dlist){if(prev&&dateNumber(day)-dateNumber(prev)===DAY)span.days++;
      else span={days:1,from:day,to:day};span.to=day;
      if(span.days>streak.days)streak={...span};prev=day;}
    const newArtists=new Map(),newTracks=new Map();
    for(const d of firstArtist.values()){const m=d.slice(0,7);newArtists.set(m,(newArtists.get(m)||0)+1);}
    for(const d of firstTrack.values()){const m=d.slice(0,7);newTracks.set(m,(newTracks.get(m)||0)+1);}
    const daytime=ev.reduce((s,r)=>{const dow=(new Date(dateNumber(r.day)).getUTCDay()+6)%7;s[dow>=5?1:0]+=r.ms;return s;},[0,0]);
    const rankedArtists=sorted(artists,view.metric),rankedTracks=sorted(tracks,view.metric),rankedAlbums=sorted(albums,view.metric);
    const monthArtistSum=[...monthArtists.values()].reduce((z,x)=>z+x.size,0);
    const discoveryShare=monthArtistSum?firstArtist.size/monthArtistSum:0;
    const divDenom=rankedArtists.reduce((s,x)=>s+Math.pow(metric(x)/Math.max(1,view.metric==='plays'?plays:total),2),0);
    const record=(map)=>sorted(map,view.metric)[0]||null;
    return {ev,total,plays,short,replays,artists,tracks,albums,days,weeks,months,platform,flags,firstArtist,firstTrack,datesByTrack,activeByArtist,returns,slots,topRepeat,consecutive,longest,sessions,streak,newArtists,newTracks,daytime,discoveryShare,rankedArtists,rankedTracks,rankedAlbums,diversity:divDenom?1/divDenom:0,recordDay:record(days),recordWeek:record(weeks),recordMonth:record(months),recordTrackWeek:record(weeklyTracks),recordArtistWeek:record(weeklyArtists)};
  }
  const trackName = (id) => {const t=view.model.tracks[id];return t?`${t.name} — ${view.model.artists[t.artistId].name}`:'—';};
  const track = (id) => {const t=view.model.tracks[id];return t?`${t.name} — ${view.model.artists[t.artistId].name}`:'—';};
  const artist = id => view.model.artists[id]?.name||'—';
  function render(){
    if(!view.model)return;
    const s=analyze(),root=$('advancedContent');
    const available=s.ev.length;
    const top=s.rankedTracks[0],topA=s.rankedArtists[0],den=view.metric==='plays'?s.plays:s.total;
    const modalAlbums=s.rankedAlbums;
    $('advancedSummary').innerHTML=cards([
      ['Écoutes analysées',fmt(available),view.year==='all'?'Toute l’archive':'Année '+view.year],
      ['Albums distincts',fmt(s.albums.size),'Albums renseignés dans l’export'],
      ['Morceau dominant',top?pct(metric(top),den):'—',top?track(top.id):'Aucune donnée'],
      ['Diversité musicale',fmt(s.diversity,1),'Artistes effectifs · indice Simpson inverse']
    ]);
    const repeatTop=s.topRepeat?`${track(s.topRepeat.tid)} · ${dateLabel(s.topRepeat.day)}`:'—';
    const concentration=top?metric(top)/Math.max(1,den):0;
    const loyalty=[...s.activeByArtist.values()].filter(x=>x.size>=3).length;
    const rediscovery=[...s.returns].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([id,n])=>({name:artist(id),ms:n*60000,plays:n,sub:`${n} retour(s) après ≥ 180 jours`}));
    const skippedTracks=sorted(new Map([...s.tracks].filter(([,x])=>x.skipKnown>=10).map(([k,x])=>[k,{...x,ms:x.skips,plays:x.skips}])),view.metric).sort((a,b)=>b.skips/b.skipKnown-a.skips/a.skipKnown||b.skipKnown-a.skipKnown).slice(0,10);
    const skippedArtists=sorted(new Map([...s.artists].filter(([,x])=>x.skipKnown>=15).map(([k,x])=>[k,{...x,ms:x.skips,plays:x.skips}])),view.metric).sort((a,b)=>b.skips/b.skipKnown-a.skips/a.skipKnown||b.skipKnown-a.skipKnown).slice(0,10);
    const skipCards=cards([
      ['Skips signalés',pct(s.flags.skipped.yes,s.flags.skipped.n),`${fmt(s.flags.skipped.n)} événements avec indicateur disponible`],
      ['Lectures courtes',pct(s.short,available),`${fmt(s.short)} événements sous 30 secondes`],
      ['Lectures ≥ 30 s',fmt(s.plays),'Ne signifie pas lecture complète']
    ]);
    const monthlyPoints=[...s.months].sort((a,b)=>a[0].localeCompare(b[0]));
    const pointsMetric=monthlyPoints.map(([m,v])=>[m,view.metric==='plays'?v.plays:v.ms/60000]);
    const skippedMonths=monthlyPoints.filter(([,v])=>v.skipKnown>0).map(([m,v])=>[m,v.skips/v.skipKnown*100]);
    const monthDiscovery=[...s.newArtists].sort((a,b)=>a[0].localeCompare(b[0]));
    const newArtistMonth=monthDiscovery.length?monthDiscovery.reduce((a,b)=>b[1]>a[1]?b:a):null;
    const resumed=rediscovery.map(o=>({...o,ms:o.ms*1}));
    const sessionStart=s.longest.start!==null?new Date(s.longest.start).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
    const recordUnit=view.metric==='plays'?'écoutes ≥ 30 s':'minutes écoutées';
    const recordText=r=>r?`${dateLabel(r.day.length===7?r.day+'-01':r.day)} · ${value(r)}`:'—';
    const recordMonth=s.recordMonth?`${monthlyLabel(s.recordMonth.name)} · ${value(s.recordMonth)}`:'—';
    const plateforms=[...s.platform].map(([name,ms])=>({name,ms,plays:0})).sort((a,b)=>b.ms-a.ms);
    const contextCards=cards(['shuffle','offline','incognito'].map(k=>[
      ({shuffle:'Mode aléatoire',offline:'Hors ligne',incognito:'Écoute privée'})[k],pct(s.flags[k].yes,s.flags[k].n),`${fmt(s.flags[k].n)} événements renseignés`
    ]));
    root.innerHTML=`
      <details class="adv-group" open><summary><span><strong>01 · Réécoutes & obsessions</strong><small>Records, répétitions, concentration</small></span></summary><div class="adv-panel">
        ${cards([['Record quotidien',s.topRepeat?fmt(s.topRepeat.count)+' écoutes':'—',repeatTop],['Répétitions consécutives',s.consecutive.count?fmt(s.consecutive.count)+' fois':'—',s.consecutive.tid!==null?track(s.consecutive.tid):'—'],['Taux de réécoute',pct(s.replays,s.plays),'Lectures ≥ 30 s après une première lecture du même titre dans la période'],['Indice d’obsession',pct(concentration,1),top?track(top.id):'Part du morceau n° 1'],['Artiste dominant',topA?pct(metric(topA),den):'—',topA?topA.name:'—']])}
        <div class="adv-columns"><div><h4>${view.metric==='plays'?'Morceaux les plus réécoutés':'Morceaux avec le plus de minutes'}</h4>${bars(s.rankedTracks,{max:12})}</div><div><h4>Évolution mensuelle de l’écoute</h4>${plotMonths(pointsMetric,{unit:recordUnit})}<p class="adv-hint">L’indice d’obsession est la part du morceau n° 1 dans les ${view.metric==='plays'?'écoutes ≥ 30 s':'minutes'} de la période.</p></div></div>
      </div></details>
      <details class="adv-group"><summary><span><strong>02 · Skips & écoutes interrompues</strong><small>Ce que tu passes, ce que tu écoutes brièvement</small></span></summary><div class="adv-panel">
        ${skipCards}${s.flags.skipped.n ? `<div class="adv-columns"><div><h4>Artistes le plus souvent passés</h4>${rates(skippedArtists)}</div><div><h4>Morceaux le plus souvent passés</h4>${rates(skippedTracks)}</div></div><h4>Évolution du taux de skip</h4>${plotMonths(skippedMonths,{unit:'taux de skips',color:'#ffb26c',percent:true})}`:noData('Le champ skipped n’est pas renseigné dans cet export. Le taux de lectures courtes reste calculable.')}
        <p class="adv-hint">Un « skip » provient exclusivement du booléen <code>skipped</code> lorsque Spotify le fournit. Une lecture courte est inférieure à 30 s ; elle ne signifie pas forcément un skip. Les classements de skips exigent au moins 15 lectures renseignées par artiste ou 10 par morceau.</p>
      </div></details>
      <details class="adv-group"><summary><span><strong>03 · Albums</strong><small>Palmarès, variété des titres et course historique</small></span></summary><div class="adv-panel">
        ${cards([['Albums identifiés',fmt(s.albums.size),'Export étendu uniquement'],['Album le plus écouté',modalAlbums[0]?value(modalAlbums[0]):'—',modalAlbums[0]?modalAlbums[0].name+' — '+modalAlbums[0].sub:'—'],['Titres distincts',modalAlbums[0]?fmt(modalAlbums[0].tracks.size):'—','Dans l’album n° 1, sans prétendre à une écoute complète']])}
        <h4>Top albums</h4>${modalAlbums.length?`<div class="adv-album-list">${modalAlbums.slice(0,15).map((a,i)=>`<div class="adv-album"><span>${i+1}</span><div><strong>${esc(a.name)}</strong><small>${esc(a.sub)} · ${a.tracks.size} titre(s) distinct(s)</small></div><b>${esc(value(a))}</b></div>`).join('')}</div>`:noData('L’export standard Spotify ne fournit pas les noms d’albums.')}
        ${view.albums.length?`<div class="adv-race-panel"><div class="adv-race-header"><div><h4>Course des albums · cumul quotidien</h4><small id="advAlbumDate">—</small></div><div class="adv-race-actions"><label for="advAlbumCount">Classement</label><select id="advAlbumCount"><option value="10">Top 10</option><option value="20">Top 20</option><option value="50">Top 50</option><option value="100">Top 100</option></select><label for="advAlbumSpeed">Vitesse</label><select id="advAlbumSpeed"><option value="15">15 j/s</option><option value="30" selected>30 j/s</option><option value="60">60 j/s</option><option value="120">120 j/s</option></select></div></div><div class="adv-race-controls"><button class="button button-primary" id="advAlbumPlay">▶ Lire</button><button class="button button-subtle" id="advAlbumStart">↺ Début</button><input id="advAlbumSeek" type="range" min="0" max="1" value="0" step="0.1" aria-label="Date pour la course des albums"><span id="advAlbumRemaining">—</span></div><div id="advAlbumRows" class="adv-race-list"></div><small class="adv-hint">Course sur toute l’archive, même lorsqu’une année est sélectionnée ci-dessus. Le choix minutes / écoutes reste commun aux analyses avancées.</small></div>`:''}
      </div></details>
      <details class="adv-group"><summary><span><strong>04 · Découvertes & fidélité</strong><small>Nouveaux artistes, retours et trajectoires</small></span></summary><div class="adv-panel">
        ${cards([['Artistes découverts',fmt(s.firstArtist.size),'Première apparition dans la période'],['Fidélité',pct(loyalty,s.artists.size),`${fmt(loyalty)} artistes écoutés sur ≥ 3 mois distincts`],['Retours après une pause',fmt(s.returns.size),'Artistes réécoutés après ≥ 180 jours'],['Mois le plus exploratoire',newArtistMonth?fmt(newArtistMonth[1]):'—',newArtistMonth?monthlyLabel(newArtistMonth[0])+' · nouveaux artistes':'—']])}
        <div class="adv-columns"><div><h4>Nouveaux artistes chaque mois</h4>${plotMonths(monthDiscovery,{unit:'nouveaux artistes',color:'#58e9d2'})}<h4 style="margin-top:17px">Nouveaux morceaux chaque mois</h4>${plotMonths([...s.newTracks].sort((a,b)=>a[0].localeCompare(b[0])),{unit:'nouveaux titres',color:'#8cb7ff'})}</div><div><h4>Artistes redécouverts après une longue pause</h4>${returnsRows(resumed)}<p class="adv-hint">Les découvertes correspondent à la première apparition <em>dans toute l’archive</em>, même si une année est filtrée. Ce n’est pas forcément ta première écoute dans la vie.</p></div></div>
        <h4>Première et dernière écoute des titres les plus écoutés</h4>
        <div class="adv-album-list">${s.rankedTracks.slice(0,12).map(t=>{const d=s.datesByTrack.get(t.id);return `<div class="adv-album"><span>♫</span><div><strong>${esc(track(t.id))}</strong><small>Première : ${d?dateLabel(d.first):'—'} · Dernière : ${d?dateLabel(d.last):'—'}</small></div><b>${esc(value(t))}</b></div>`;}).join('')}</div>
        <h4 style="margin-top:18px">Ascension dans le Top 10 cumulatif des morceaux</h4><div id="advAscents"></div>
      </div></details>
      <details class="adv-group"><summary><span><strong>05 · Records, sessions & habitudes</strong><small>Jours intenses, séries, rythmes et sessions estimées</small></span></summary><div class="adv-panel">
        ${cards([['Journée record',s.recordDay?value(s.recordDay):'—',s.recordDay?dateLabel(s.recordDay.day):'—'],['Semaine record',s.recordWeek?value(s.recordWeek):'—',s.recordWeek?'Semaine du '+dateLabel(s.recordWeek.day):'—'],['Mois record',s.recordMonth?value(s.recordMonth):'—',s.recordMonth?monthlyLabel(s.recordMonth.day):'—'],['Série de jours',fmt(s.streak.days),s.streak.from?`${dateLabel(s.streak.from)} → ${dateLabel(s.streak.to)}`:'—'],['Plus longue session estimée',s.longest.ms?hours(s.longest.ms):'—',s.longest.ms?`${fmt(s.longest.events)} lectures · départ ${sessionStart}`:'—'],['Morceau · semaine record',s.recordTrackWeek?value(s.recordTrackWeek):'—',s.recordTrackWeek?s.recordTrackWeek.name+' · '+dateLabel(s.recordTrackWeek.week):'—'],['Artiste · semaine record',s.recordArtistWeek?value(s.recordArtistWeek):'—',s.recordArtistWeek?s.recordArtistWeek.name+' · '+dateLabel(s.recordArtistWeek.week):'—']])}
        <div class="adv-columns"><div><h4>Les sessions les plus longues (estimées)</h4>${s.sessions.length?`<div class="adv-skip-list">${s.sessions.slice(0,5).map((v,i)=>`<div><span>${i+1}. ${new Date(v.start).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span><strong>${hours(v.ms)}</strong><small>${v.events} lectures</small></div>`).join('')}</div>`:noData()}<h4 style="margin-top:20px">Répartition par moment de la journée</h4>${bars(s.slots.slice().sort((a,b)=>metric(b)-metric(a)),{max:4})}</div><div><h4>Jours de semaine / week-end</h4>${simpleSplit(s.daytime,'Semaine','Week-end')}<p class="adv-hint">Les sessions sont estimées avec une pause de 30 minutes maximum entre deux lectures. Les timestamps Spotify correspondent à la fin des lectures ; la durée totale des sessions additionne les minutes musicales (pas le temps écoulé).</p></div></div>
      </div></details>
      <details class="adv-group"><summary><span><strong>06 · Appareils & modes d’écoute</strong><small>Plateformes, aléatoire, hors ligne et écoute privée</small></span></summary><div class="adv-panel">
        ${contextCards}<div class="adv-columns"><div><h4>Plateformes utilisées</h4>${plateforms.length?platformBars(plateforms):noData('Les plateformes ne figurent pas dans cet export.')}</div><div><h4>Disponibilité des métadonnées</h4>${metadataRows(s.flags,s.ev.length)}<p class="adv-hint">Les appareils sont regroupés par système d’exploitation, sans conserver le modèle précis, l’adresse IP ou le pays.</p></div></div>
      </div></details>
      <details class="adv-group"><summary><span><strong>07 · Indices personnalisés</strong><small>Diversité, obsession, découverte, fidélité et records</small></span></summary><div class="adv-panel">
        ${cards([['Diversité effective',fmt(s.diversity,1),'1 ÷ somme des parts² de chaque artiste'],['Concentration Top 5',pct(s.rankedArtists.slice(0,5).reduce((z,a)=>z+metric(a),0),den),'Part des cinq premiers artistes'],['Découverte',pct(s.discoveryShare,1),'Premières apparitions / artistes actifs par mois (taux pondéré)'],['Fidélité sur ≥ 3 mois',pct(loyalty,s.artists.size),'Artistes actifs au moins trois mois'],['Retours après ≥ 180 jours',pct(s.returns.size,s.artists.size),'Artistes retrouvés après une longue pause']])}
        <div class="adv-columns"><div><h4>Répartition mensuelle</h4>${plotMonths(pointsMetric,{unit:recordUnit,color:'#d1b2fc'})}</div><div><h4>Records historiques de la période</h4><p class="adv-record">Jour : <strong>${esc(recordText(s.recordDay))}</strong></p><p class="adv-record">Semaine : <strong>${esc(recordText(s.recordWeek))}</strong></p><p class="adv-record">Mois : <strong>${esc(recordMonth)}</strong></p><p class="adv-hint">Les indices sont descriptifs, définis ici pour SpotifyStats : ce ne sont pas des indicateurs officiels Spotify. Les années partielles et les périodes absentes peuvent influer sur les comparaisons.</p></div></div>
      </div></details>
      <p class="adv-footnote">Données calculées en local, sans API ni transmission. Les genres musicaux, BPM, tonalités et données acoustiques ne figurent pas dans l’archive Spotify : aucune valeur n’est inventée. « Écoutes » = lectures d’au moins 30 secondes, pas nécessairement complètes.</p>`;
    // La course globale n'est recalculée que lors d'un nouvel import ou changement de métrique.
    if(view.albumRace && $('advAlbumCount')){bindAlbumRace();renderAlbumRace();}
    const firstAscents=view.ascents||[];
    const target=$('advAscents');if(target){const list=firstAscents.filter(x=>x.days>=7).slice(0,12);
      target.innerHTML=list.length?`<div class="adv-album-list">${list.map(x=>`<div class="adv-album"><span>${esc(x.days+' j')}</span><div><strong>${esc(track(x.id))}</strong><small>Découvert le ${dateLabel(x.first)} · premier Top 10 le ${dateLabel(x.entered)}</small></div><b>${fmt(x.days)} jours</b></div>`).join('')}</div>`:noData('Pas de parcours d’au moins 7 jours avant une première entrée dans le Top 10.');}
  }
  function rates(items){return items.length?`<div class="adv-skip-list">${items.map(x=>`<div><span title="${esc(x.name)}">${esc(x.name)}</span><strong>${pct(x.skips,x.skipKnown)}</strong><small>${fmt(x.skips)} / ${fmt(x.skipKnown)} skips</small></div>`).join('')}</div>`:noData('Pas assez d’événements renseignés.');}
  function returnsRows(items){return items.length?`<div class="adv-skip-list">${items.map(x=>`<div><span>${esc(x.name)}</span><strong>${fmt(x.plays)} retours</strong></div>`).join('')}</div>`:noData('Aucun retour de 180 jours ou plus dans cette période.');}
  function simpleSplit(numbers,a,b){const full=numbers[0]+numbers[1],x=full?numbers[0]/full*100:0;return `<div class="adv-split" role="img" aria-label="${a} ${fmt(x,1)} %, ${b} ${fmt(100-x,1)} %"><div style="width:${x}%"></div></div><div class="adv-splitlabels"><span>${a} · ${pct(numbers[0],full)}</span><span>${b} · ${pct(numbers[1],full)}</span></div>`;}
  function platformBars(arr){const total=arr.reduce((a,b)=>a+b.ms,0);return `<div class="adv-skip-list">${arr.map(x=>`<div><span>${esc(x.name)}</span><strong>${pct(x.ms,total)}</strong><small>${esc(hours(x.ms))}</small></div>`).join('')}</div>`;}
  function metadataRows(flags,total){return `<div class="adv-skip-list">${Object.entries(flags).map(([k,x])=>`<div><span>${esc(({skipped:'Skips',shuffle:'Aléatoire',offline:'Hors ligne',incognito:'Écoute privée'})[k])}</span><strong>${pct(x.n,total)}</strong><small>Renseigné dans ${fmt(x.n)} / ${fmt(total)} événements</small></div>`).join('')}</div>`;}
  function prepareAlbumRace(){
    const daily=new Map(),f=new Map(),firstTrack=new Map(),ascents=[],trackTotals=new Map(),leaders=[];
    for(const r of view.records){
      if(r.alb>=0){let m=daily.get(r.day);if(!m){m=new Map();daily.set(r.day,m);}let x=m.get(r.alb);if(!x){x={ms:0,plays:0};m.set(r.alb,x);}x.ms+=r.ms;x.plays+=r.q;}
      if(!firstTrack.has(r.tid))firstTrack.set(r.tid,r.day);
      let d=f.get(r.day);if(!d){d=new Map();f.set(r.day,d);}d.set(r.tid,(d.get(r.tid)||0)+r.ms);
    }
    const top10=[],cumTracks=new Map(),firstTop10=new Map();
    for(const [day,events] of [...f].sort((a,b)=>a[0].localeCompare(b[0]))){
      for(const [id,ms] of events){const n=(cumTracks.get(id)||0)+ms;cumTracks.set(id,n);const old=top10.findIndex(x=>x[0]===id);if(old>=0)top10.splice(old,1);if(n>0){const j=top10.findIndex(x=>x[1]<n||(x[1]===n&&x[0]>id));if(j<0)top10.push([id,n]);else top10.splice(j,0,[id,n]);if(top10.length>10)top10.pop();}}
      for(const [id] of top10)if(!firstTop10.has(id))firstTop10.set(id,day);
    }
    for(const [id,entered] of firstTop10){const first=firstTrack.get(id),days=Math.round((dateNumber(entered)-dateNumber(first))/DAY);ascents.push({id,first,entered,days});}
    view.ascents=ascents.sort((a,b)=>a.days-b.days||a.first.localeCompare(b.first));
    const dayList=[];for(let d=view.model.first;d<=view.model.last;d=addDay(d,1))dayList.push(d);
    const build=key=>{
      const ongoing=new Map(),list=[];let top=[];
      for(const d of dayList){const delta=daily.get(d);if(delta){for(const [id,measures] of delta){const v=(ongoing.get(id)||0)+measures[key];ongoing.set(id,v);const old=top.findIndex(x=>x[0]===id);if(old>=0)top.splice(old,1);if(v>0){let lo=0,hi=top.length;while(lo<hi){const mid=(lo+hi)>>1;if(v>top[mid][1]||(v===top[mid][1]&&id<top[mid][0]))hi=mid;else lo=mid+1;}top.splice(lo,0,[id,v]);if(top.length>100)top.pop();}}}
        list.push(top.map(x=>[...x]));}
      return list;
    };
    view.albumRace={dates:dayList,ms:build('ms'),plays:build('plays')};
  }
  function stopAlbum(){view.albumPlaying=false;view.albumLast=0;cancelAnimationFrame(view.albumFrame);if($('advAlbumPlay'))$('advAlbumPlay').textContent='▶ Lire';}
  function changeAlbumPosition(i){stopAlbum();view.albumTime=Math.max(0,Math.min(i,view.albumRace.dates.length-1));renderAlbumRace();}
  function toggleAlbum(){if(view.albumPlaying){stopAlbum();return;}if(view.albumTime>=view.albumRace.dates.length-1)view.albumTime=0;view.albumPlaying=true;view.albumLast=0;view.albumFrame=requestAnimationFrame(tickAlbum);$('advAlbumPlay').textContent='Ⅱ Pause';}
  function tickAlbum(now){if(!view.albumPlaying)return;if(view.albumLast)view.albumTime+=Math.min(.18,(now-view.albumLast)/1000)*view.albumSpeed;view.albumLast=now;if(view.albumTime>=view.albumRace.dates.length-1){view.albumTime=view.albumRace.dates.length-1;renderAlbumRace();stopAlbum();return;}if(now-view.albumRenderAt>70){renderAlbumRace();view.albumRenderAt=now;}view.albumFrame=requestAnimationFrame(tickAlbum);}
  function bindAlbumRace(){
    view.albumRows.clear();view.albumPlaying=false;
    const $r=$('advAlbumRows');$r.innerHTML='';
    $('advAlbumCount').value=String(view.albumCount);$('advAlbumSpeed').value=String(view.albumSpeed);
    $('advAlbumSeek').max=String(view.albumRace.dates.length-1);
    $('advAlbumPlay').onclick=toggleAlbum;
    $('advAlbumStart').onclick=()=>changeAlbumPosition(0);
    $('advAlbumCount').onchange=e=>{view.albumCount=Number(e.target.value)||10;renderAlbumRace();};
    $('advAlbumSpeed').onchange=e=>{view.albumSpeed=Number(e.target.value)||30;renderAlbumRace();};
    $('advAlbumSeek').oninput=e=>changeAlbumPosition(Number(e.target.value));
  }
  function renderAlbumRace(){
    if(!view.albumRace||!$('advAlbumRows'))return;
    const ix=Math.floor(view.albumTime),j=Math.min(ix+1,view.albumRace.dates.length-1),p=view.albumTime-ix;
    const daily=view.albumRace[view.metric],first=new Map(daily[ix]),second=new Map(daily[j]);
    const ids=new Set([...first.keys(),...second.keys()]);
    const top=[...ids].map(id=>[id,(first.get(id)||0)*(1-p)+(second.get(id)||0)*p]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,view.albumCount);
    const root=$('advAlbumRows'),high=Math.max(1,top[0]?.[1]||1),current=new Set(top.map(x=>x[0]));
    root.style.height=Math.max(100,top.length*45+12)+'px';
    for(const [id,el] of view.albumRows){if(!current.has(id)){el.remove();view.albumRows.delete(id);}}
    top.forEach(([id,n],rank)=>{
      let el=view.albumRows.get(id);
      if(!el){el=document.createElement('div');el.className='adv-album-racer';el.innerHTML='<b></b><span class="adv-album-name"><strong></strong><small></small></span><span class="adv-album-track"><i></i></span><span class="adv-album-value"></span>';root.append(el);view.albumRows.set(id,el);}
      el.style.transform=`translateY(${rank*45}px)`;el.querySelector('b').textContent=rank+1;
      el.querySelector('strong').textContent=view.albums[id].name;el.querySelector('small').textContent=view.albums[id].artist;
      el.querySelector('i').style.width=fmt(n/high*100,2)+'%';el.querySelector('.adv-album-value').textContent=view.metric==='plays'?fmt(n):fmt(n/60000,1)+' min';
    });
    $('advAlbumSeek').value=String(view.albumTime);
    $('advAlbumDate').textContent=dateLabel(view.albumRace.dates[ix])+` · ${top.length}/${view.albumCount} albums · cumul depuis le début`;
    $('advAlbumRemaining').textContent=fmt((view.albumRace.dates.length-1-view.albumTime)/view.albumSpeed)+' s';
  }
  function load(events,model){
    stopAlbum();view.model=model;view.year='all';view.metric='ms';view.albumTime=0;view.albumCount=10;view.albumSpeed=30;
    normalize(events,model);prepareAlbumRace();
    const years=[...new Set(view.records.map(e=>e.day.slice(0,4)))].sort();
    $('advancedYear').innerHTML='<option value="all">Toute la période</option>'+years.map(y=>`<option value="${y}">${y}</option>`).join('');
    $('advancedYear').value='all';$('advancedMetric').value='ms';
    render();
  }
  $('advancedYear').addEventListener('change',e=>{view.year=e.target.value;stopAlbum();render();});
  $('advancedMetric').addEventListener('change',e=>{view.metric=e.target.value;stopAlbum();render();});
  window.AdvancedStats={load,stop:stopAlbum};
})();
