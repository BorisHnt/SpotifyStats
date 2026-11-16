/* Listening Atlas · Interface et calculs côté navigateur uniquement.
   Nécessite uniquement vendor/jszip.min.js, servi localement. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const DAY_MS = 86400000;
  const WEEK_MS = 7 * DAY_MS;
  const COLORS = ['#c8ff77','#ffb26c','#58e9d2','#8cb7ff','#ff829a','#d1b2fc','#fee183','#69cce4','#f59ee6','#85bd9e'];
  const fmt = (n, digits = 0) => Number(n || 0).toLocaleString('fr-FR', {maximumFractionDigits: digits});
  const minutes = ms => fmt(ms / 60000, 1) + ' min';
  const duration = ms => ms >= 3600000 ? fmt(ms / 3600000, 1) + ' h' : fmt(ms / 60000, 1) + ' min';
  const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const isoDate = time => new Date(time).toISOString().slice(0,10);
  const dateUTC = date => Date.parse(date + 'T12:00:00Z');
  const addDay = (date, count) => isoDate(dateUTC(date) + count * DAY_MS);
  const prettify = date => new Date(dateUTC(date)).toLocaleDateString('fr-FR', {day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  const monday = date => addDay(date, -((new Date(dateUTC(date)).getUTCDay()+6)%7));
  const int = n => Number.isFinite(Number(n)) ? Math.max(0, Number(n)) : 0;
  const metric = o => state.metric === 'plays' ? o.plays : o.ms;
  const metricDisplay = o => state.metric === 'plays' ? fmt(o.plays) : duration(o.ms);
  const unit = state => state === 'plays' ? 'écoutes ≥ 30 s' : 'durée d’écoute';
  const canvas = (w, h, content, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${content}</svg>`;

  const parisParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit', hourCycle:'h23'
  });
  let state = {model:null,year:'all',metric:'ms',focusId:null,soloId:null,raceDay:0,racePlaying:false,raceLast:0,raceFrame:0,raceRenderAt:0,speed:30,raceCount:10,raceElements:new Map(),chartDragging:false,lineMode:'week',linePos:0,linePlaying:false,lineFrame:0,lineLast:0,lineRenderAt:0,lineSpeed:30/7,linePinned:null,linePreviousLeader:null,lineSeries:new Map(),lineScale:null,lineScaleAt:0};

  function setStatus(message, mode = '', percent = null) {
    $('statusText').textContent = message;
    $('uploadStatus').className = 'upload-status ' + mode;
    $('progressWrap').hidden = percent === null;
    if (percent !== null) $('progressBar').style.width = clamp(percent, 0, 100) + '%';
  }
  const yieldUI = () => new Promise(resolve => setTimeout(resolve, 0));

  function localDate(timestamp) {
    const parts = {};
    for (const item of parisParts.formatToParts(new Date(timestamp))) if (item.type !== 'literal') parts[item.type] = item.value;
    return {day:`${parts.year}-${parts.month}-${parts.day}`,hour:Number(parts.hour)%24};
  }

  function readEvent(raw) {
    if (!raw || typeof raw !== 'object') return null;
    let artist, name, album, uri, ms, day, hour, unix;
    if ('master_metadata_track_name' in raw || 'master_metadata_album_artist_name' in raw) {
      artist = raw.master_metadata_album_artist_name;
      name = raw.master_metadata_track_name;
      album = raw.master_metadata_album_album_name || '';
      uri = raw.spotify_track_uri || '';
      ms = raw.ms_played;
      unix = Date.parse(raw.ts);
      if (!Number.isFinite(unix)) return null;
      ({day, hour} = localDate(unix));
    } else if ('artistName' in raw && 'trackName' in raw && 'msPlayed' in raw) {
      artist = raw.artistName;
      name = raw.trackName;
      album = '';
      uri = '';
      ms = raw.msPlayed;
      // L'export standard utilise une date locale sans fuseau horaire.
      const date = String(raw.endTime || '');
      if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(date)) return null;
      day = date.slice(0,10);
      hour = Number(date.slice(11,13));
      const tm = date.slice(11).split(':');
      unix = Date.parse(day + 'T' + tm[0].padStart(2,'0') + ':' + (tm[1]||'00').padStart(2,'0') + ':' + (tm[2]||'00').padStart(2,'0') + 'Z');
      if (!Number.isFinite(unix)) unix = dateUTC(day);
    } else return null;
    if (typeof artist !== 'string' || typeof name !== 'string' || !artist.trim() || !name.trim()) return null;
    ms = Number(ms);
    if (!Number.isFinite(ms) || ms < 0) return null;
    const d = Date.parse(day + 'T12:00:00Z');
    if (!Number.isFinite(d) || hour < 0 || hour > 23) return null;
    return {artist:artist.trim(),name:name.trim(),album:String(album || ''),uri:String(uri || ''),ms:Math.round(ms),day,hour,unix};
  }

  async function importZip(file) {
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) {setStatus('Choisis un fichier .zip exporté par Spotify.', 'error');return;}
    stopRace();
    stopLineRace();
    setStatus('Ouverture de l’archive…', '', 4);
    $('fileInput').value = '';
    try {
      if (!window.JSZip) throw new Error('La bibliothèque ZIP locale est introuvable. Vérifie le dossier vendor/.');
      const zip = await JSZip.loadAsync(file);
      const contents = Object.values(zip.files).filter(f => !f.dir && /\.json$/i.test(f.name) && !/Streaming_History_Video|\/video\//i.test(f.name));
      if (!contents.length) throw new Error('Aucun historique JSON trouvé dans cette archive.');
      const priority = f => /Streaming_History_Audio/i.test(f.name) ? 0 : /StreamingHistory|Streaming_History/i.test(f.name) ? 1 : 2;
      contents.sort((a,b) => priority(a)-priority(b));
      const jsonFiles = contents.filter(f => /Streaming_History_Audio|StreamingHistory|Streaming_History|streaming_history|listening_history/i.test(f.name));
      const extended = jsonFiles.filter(f => /Streaming_History_Audio/i.test(f.name));
      const selected = extended.length ? extended : (jsonFiles.length ? jsonFiles : contents);
      const maxRaw = selected.reduce((n, f) => n + (f._data?.uncompressedSize || 0), 0);
      if (maxRaw > 850*1024*1024) throw new Error('Cette archive est trop volumineuse pour une analyse dans le navigateur (plus de 850 Mo décompressés).');
      const cleaned = [];
      let filesRead = 0, validFiles = 0;
      for (const entry of selected) {
        if ((entry._data?.uncompressedSize || 0) > 180*1024*1024) throw new Error('Un fichier JSON dépasse 180 Mo. Importe une archive plus petite.');
        setStatus(`Lecture de ${entry.name.split('/').pop()} (${filesRead + 1}/${selected.length})…`, '', 6 + filesRead / selected.length * 60);
        const str = await entry.async('string');
        let raw;
        try {raw = JSON.parse(str.replace(/^\uFEFF/, ''));}
        catch (_) {filesRead++;continue;}
        if (!Array.isArray(raw)) {filesRead++;continue;}
        let found = 0;
        for (const row of raw) {
          const e = readEvent(row);
          if (!e) continue;
          cleaned.push(e);
          found++;
        }
        if (found) validFiles++;
        filesRead++;
        await yieldUI();
      }
      if (!cleaned.length) throw new Error('Aucune écoute musicale reconnue. Il faut un export Spotify « Historique étendu » ou « Streaming History ».');
      setStatus(`Calcul des statistiques pour ${fmt(cleaned.length)} écoutes…`, '', 75);
      await yieldUI();
      const model = buildModel(cleaned);
      setStatus('Préparation de la frise et de la course quotidienne…', '', 89);
      await yieldUI();
      prepareChronology(model);
      state.model = model;
      state.year = 'all'; state.metric = 'ms'; state.focusId = null; state.soloId = null;
      state.raceDay = 0;
      setupDashboard();
      setStatus(`${fmt(model.eventsCount)} événements musicaux importés depuis ${validFiles} fichier(s) JSON. Calculs terminés, sans envoi réseau.`, 'success');
      $('dashboard').hidden = false; $('emptyState').hidden = true; $('reimportBtn').hidden = false;
      $('dashboard').scrollIntoView({behavior:'smooth',block:'start'});
    } catch (err) {
      console.error('Import Spotify :',err?.message || err);
      setStatus('Import impossible : ' + (err?.message || 'erreur inconnue'), 'error');
    }
  }

  function emptySummary() {
    return {ms:0,plays:0,events:0,artists:new Map(),tracks:new Map(),months:new Map(),hours:Array(24).fill(0),heat:Array.from({length:7},()=>Array(24).fill(0))};
  }
  function addMetric(map, key, ms, qualified) {
    let obj = map.get(key);
    if (!obj) {obj={ms:0,plays:0,events:0};map.set(key,obj);}
    obj.ms += ms; obj.plays += qualified; obj.events++;
  }
  function addSummary(summary, ev) {
    const qualifies = ev.ms >= 30000 ? 1 : 0;
    summary.ms += ev.ms;summary.plays += qualifies;summary.events++;
    addMetric(summary.artists,ev.artistId,ev.ms,qualifies);
    addMetric(summary.tracks,ev.trackId,ev.ms,qualifies);
    summary.months.set(ev.month,(summary.months.get(ev.month)||0)+ev.ms);
    summary.hours[ev.hour] += ev.ms;
    summary.heat[ev.weekday][ev.hour] += ev.ms;
  }
  function buildModel(rows) {
    rows.sort((a,b) => a.unix-b.unix);
    const artists = [], tracks = [], artMap = new Map(), trackMap = new Map();
    const yearly = new Map(), global = emptySummary(), weeklyMap = new Map(), dailyMap = new Map(), artistMonths = new Map();
    let first = null, last = null;
    for (const r of rows) {
      let a = artMap.get(r.artist);
      if (a === undefined) {a=artists.length;artMap.set(r.artist,a);artists.push({name:r.artist,ms:0,plays:0,events:0,first:r.day,last:r.day});}
      const trackKey = (r.uri.startsWith('spotify:track:') ? r.uri : r.artist + '\u001f' + r.name + '\u001f' + r.album);
      let t = trackMap.get(trackKey);
      if (t === undefined) {t=tracks.length;trackMap.set(trackKey,t);tracks.push({name:r.name,album:r.album,uri:r.uri,artistId:a,ms:0,plays:0,events:0});}
      const art=artists[a], track=tracks[t];
      const artistMonthKey = a+'|'+r.day.slice(0,7);
      artistMonths.set(artistMonthKey,(artistMonths.get(artistMonthKey)||0)+r.ms);
      const q=r.ms>=30000?1:0;
      art.ms+=r.ms;art.plays+=q;art.events++;art.first=art.first<r.day?art.first:r.day;art.last=art.last>r.day?art.last:r.day;
      track.ms+=r.ms;track.plays+=q;track.events++;
      const ev={artistId:a,trackId:t,ms:r.ms,day:r.day,month:r.day.slice(0,7),year:r.day.slice(0,4),hour:r.hour,weekday:(new Date(dateUTC(r.day)).getUTCDay()+6)%7};
      if (!yearly.has(ev.year)) yearly.set(ev.year,emptySummary());
      addSummary(global,ev); addSummary(yearly.get(ev.year),ev);
      const week=monday(r.day);
      if (!weeklyMap.has(week)) weeklyMap.set(week,new Map());
      const wm=weeklyMap.get(week);wm.set(a,(wm.get(a)||0)+r.ms);
      if (!dailyMap.has(r.day)) dailyMap.set(r.day,new Map());
      const dm=dailyMap.get(r.day);dm.set(a,(dm.get(a)||0)+r.ms);
      if (first===null || first>r.day) first=r.day;
      if (last===null || last<r.day) last=r.day;
    }
    return {artists,tracks,yearly,global,artistMonths,weeklyMap,dailyMap,first,last,eventsCount:rows.length,days:[],weeks:[],weekStarts:[],topWeekly:[],weeklyAxis:0,raceContendersByLimit:{10:new Set(),20:new Set(),50:new Set(),100:new Set()},lineWeeks:[]};
  }
  function prepareChronology(m) {
    const total = [...m.global.artists].sort((a,b)=>b[1].ms-a[1].ms || m.artists[a[0]].name.localeCompare(m.artists[b[0]].name));
    m.topWeekly=total.slice(0,10).map(([id])=>id);
    const firstWeek=monday(m.first),lastWeek=monday(m.last);
    let max=0;
    for (let d=firstWeek;d<=lastWeek;d=addDay(d,7)) {
      m.weekStarts.push(d);
      const entries=m.weeklyMap.get(d)||new Map();
      const values=m.topWeekly.map(id=>{const v=(entries.get(id)||0)/60000;max=Math.max(max,v);return v;});
      m.weeks.push(values);
      m.lineWeeks.push({date:d,weekly:entries,weeklyTop:[...entries].filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1] || a[0]-b[0]).slice(0,15),cumulativeTop:[]});
    }
    // Chaque semaine : un classement des minutes courantes ET un classement cumulatif.
    // L'historique complet reste sous forme de cartes hebdomadaires légères, pas de données personnelles.
    const weekRunning = new Map();
    for (const wk of m.lineWeeks) {
      for (const [id,ms] of wk.weekly) weekRunning.set(id,(weekRunning.get(id)||0)+ms);
      wk.cumulativeTop=[...weekRunning].sort((a,b)=>b[1]-a[1] || a[0]-b[0]).slice(0,15);
    }
    m.weeklyAxis=niceCeil(max);
    const cum = new Map();
    let totalMs=0;
    for (let d=m.first;d<=m.last;d=addDay(d,1)) {
      const dayEntries=m.dailyMap.get(d);
      if (dayEntries) for (const [id,ms] of dayEntries){cum.set(id,(cum.get(id)||0)+ms);totalMs+=ms;}
      const top=[...cum].filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1] || m.artists[a[0]].name.localeCompare(m.artists[b[0]].name)).slice(0,100);
      for(const limit of [10,20,50,100])top.slice(0,limit).forEach(([id])=>m.raceContendersByLimit[limit].add(id));
      m.days.push({date:d,top,totalMs});
    }
    // Les données dérivées suffisent : oublier les événements et noms de fichiers d'origine.
    m.dailyMap.clear();m.weeklyMap.clear();
  }
  function niceCeil(x){if(x<=0)return 1;const p=Math.pow(10,Math.floor(Math.log10(x)));const v=x/p;return (v<=2?2:v<=5?5:10)*p;}

  function setupDashboard() {
    const m=state.model;
    const options=[...m.yearly.keys()].sort();
    $('yearSelect').innerHTML='<option value="all">Toute la période</option>'+options.map(y=>`<option value="${esc(y)}">${esc(y)}</option>`).join('');
    $('chartYears').innerHTML=options.map(y=>`<option value="${esc(y)}">${esc(y)}</option>`).join('');
    const topIds=[...m.global.artists].sort((a,b)=>b[1].ms-a[1].ms).slice(0,500).map(x=>x[0]);
    const master=m.artists.findIndex(a=>a.name.toUpperCase()==='MASTER MUZIK');
    if (master>=0 && !topIds.includes(master)) topIds.push(master);
    topIds.sort((a,b)=>m.artists[a].name.localeCompare(m.artists[b].name,'fr'));
    state.focusId = master>=0?master:[...m.global.artists].sort((a,b)=>b[1].ms-a[1].ms)[0][0];
    $('spotlightSelect').innerHTML=topIds.map(id=>`<option value="${id}" ${id===state.focusId?'selected':''}>${esc(m.artists[id].name)}</option>`).join('');
    $('spotlightSelect').value=String(state.focusId);
    renderDashboard();
    setupWeekly();
    initRace();
    initLineRace();
    markNav();
  }
  const selectedSummary = () => state.year==='all'?state.model.global:state.model.yearly.get(state.year);
  function sortedEntries(map) {return [...map.entries()].sort((a,b)=>metric(b[1])-metric(a[1]) || a[0]-b[0]);}
  function songUrl(uri) {const match=/^spotify:track:([A-Za-z0-9]{22})$/.exec(uri||'');return match?`https://open.spotify.com/track/${match[1]}`:null;}
  function rankRow(pos, name, sub, stats, max, link = null) {
    const fill=max?clamp(metric(stats)/max*100,0,100):0;
    const title=link?`<a href="${link}" target="_blank" rel="noopener noreferrer">${esc(name)}</a>`:`<b title="${esc(name)}">${esc(name)}</b>`;
    return `<div class="rankrow"><span class="fill" style="width:${fill.toFixed(2)}%"></span><span class="rank-index">${pos}</span><div class="rank-title">${title}<small>${esc(sub)}</small></div><span class="rank-value">${metricDisplay(stats)}</span></div>`;
  }
  function renderDashboard() {
    if (!state.model) return;
    $('yearSelect').value=state.year;
    $('metricToggle').querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b.dataset.metric===state.metric));
    const m=state.model,s=selectedSummary(),yr=state.year;
    $('dateRange').textContent=yr==='all' ? `${prettify(m.first)} — ${prettify(m.last)}` : `Écoutes enregistrées pendant ${yr}`;
    const stats=[['Durée écoutée',duration(s.ms),'Lectures musicales, interruptions comprises'],['Écoutes ≥ 30 s',fmt(s.plays),'Événements d’au moins 30 secondes'],['Artistes',fmt(s.artists.size),'Artistes différents'],['Morceaux',fmt(s.tracks.size),'Titres différents dans l’archive']];
    $('metrics').innerHTML=stats.map(x=>`<div class="metric"><div class="metric-label">${x[0]}</div><div class="metric-value">${x[1]}</div><div class="metric-detail">${x[2]}</div></div>`).join('');
    renderYears();renderMonths(s);renderTops(s);renderHabits(s);renderYearWinners();renderSpotlight();renderBrowse();
  }
  function renderYears() {
    const arr=[...state.model.yearly].sort((a,b)=>a[0].localeCompare(b[0]));
    const W=650,H=280,left=54,right=10,top=18,bottom=44,plot=H-top-bottom,step=(W-left-right)/arr.length;
    const max=niceCeil(Math.max(1,...arr.map(x=>x[1].ms/60000)));
    let html='';
    for(let j=0;j<=4;j++) {const v=max*j/4,y=top+plot-v/max*plot;html+=`<line class="grid-line" x1="${left}" y1="${y}" x2="${W-right}" y2="${y}"/><text class="axis-label" text-anchor="end" x="${left-9}" y="${y+4}">${fmt(v)}</text>`;}
    arr.forEach(([year,s],i)=>{const h=s.ms/60000/max*plot,x=left+i*step+step*.14,y=top+plot-h,w=step*.72;html+=`<rect class="bar ${state.year===year?'selected':''}" data-year="${year}" x="${x}" y="${y}" width="${w}" height="${Math.max(h,.5)}" rx="5"><title>${year} · ${minutes(s.ms)}</title></rect><text class="bar-label" x="${x+w/2}" y="${H-17}" text-anchor="middle">${year}</text>`;});
    $('yearsChart').innerHTML=canvas(W,H,html,'Minutes par année, sélectionner une barre pour filtrer');
  }
  function renderMonths(s) {
    const values=[...s.months].sort((a,b)=>a[0].localeCompare(b[0]));
    const W=650,H=280,l=47,r=12,t=16,b=42,p=H-t-b;
    if (!values.length){$('monthsChart').innerHTML='<p class="empty-message">Aucune écoute.</p>';return;}
    const vmax=niceCeil(Math.max(...values.map(x=>x[1]/60000),1));
    let out='';
    for (let i=0;i<=4;i++){let y=t+p-(i/4)*p;out+=`<line class="grid-line" x1="${l}" y1="${y}" x2="${W-r}" y2="${y}"/><text class="axis-label" x="${l-8}" y="${y+4}" text-anchor="end">${fmt(vmax*i/4)}</text>`;}
    const X=i=>l+(values.length===1?0.5:i/(values.length-1))*(W-l-r);
    let path='';values.forEach(([date,ms],i)=>{const x=X(i),y=t+p-(ms/60000/vmax)*p;path+=(i?' L':'M')+x.toFixed(1)+' '+y.toFixed(1);});
    out+=`<path class="month-line" d="${path}"/>`;
    values.forEach(([date,ms],i)=>{const x=X(i),y=t+p-(ms/60000/vmax)*p;out+=`<circle cx="${x}" cy="${y}" r="3" fill="#c8ff77"><title>${date} : ${minutes(ms)}</title></circle>`;if ((state.year==='all'&&date.endsWith('-01')) || (state.year!=='all'&&i%2===0))out+=`<text class="axis-label" x="${x}" y="${H-16}" text-anchor="middle">${state.year==='all'?date.slice(0,4):date.slice(5)}</text>`;});
    $('monthlyDescription').textContent=`${values.length} mois avec écoute(s) · minutes`;
    $('monthsChart').innerHTML=canvas(W,H,out,'Temps d’écoute par mois');
  }
  function renderTops(s) {
    const m=state.model,arts=sortedEntries(s.artists).slice(0,12),tracks=sortedEntries(s.tracks).slice(0,12);
    $('topArtistsSub').textContent=`${fmt(s.artists.size)} artistes · ${unit(state.metric)}`;
    $('topTracksSub').textContent=`${fmt(s.tracks.size)} morceaux · ${unit(state.metric)}`;
    const maxa=arts[0]?metric(arts[0][1]):0,maxt=tracks[0]?metric(tracks[0][1]):0;
    $('topArtists').innerHTML=arts.map(([id,stat],i)=>rankRow(i+1,m.artists[id].name,`${fmt(stat.events)} événements`,stat,maxa)).join('');
    $('topTracks').innerHTML=tracks.map(([id,stat],i)=>{const tr=m.tracks[id];return rankRow(i+1,tr.name,m.artists[tr.artistId].name+' · '+tr.album,stat,maxt,songUrl(tr.uri));}).join('');
  }
  function renderHabits(s) {
    const W=650,H=250,l=32,r=10,t=13,b=37,p=H-t-b;
    const max=niceCeil(Math.max(...s.hours.map(x=>x/60000),1));
    let result='';
    for(let i=0;i<=4;i++){const y=t+p-i/4*p;result+=`<line class="grid-line" x1="${l}" y1="${y}" x2="${W-r}" y2="${y}"/><text class="axis-label" x="${l-6}" y="${y+4}" text-anchor="end">${fmt(max*i/4)}</text>`;}
    const step=(W-l-r)/24;
    s.hours.forEach((ms,h)=>{let height=ms/60000/max*p;result+=`<rect x="${l+h*step+2}" y="${t+p-height}" width="${Math.max(2,step-4)}" height="${Math.max(.3,height)}" rx="2" fill="${h>=18?'#c8ff77':'#58e9d2'}"><title>${h} h – ${h+1} h : ${minutes(ms)}</title></rect>`;if(h%3===0)result+=`<text class="axis-label" x="${l+(h+.5)*step}" y="${H-13}" text-anchor="middle">${h}h</text>`;});
    $('hoursChart').innerHTML=canvas(W,H,result,'Durée écoutée par heure de la journée');
    const days=['L','Ma','Me','J','V','S','D'],heatmax=Math.max(1,...s.heat.flat());
    let cells='<div class="heatmap-wrap"><span></span>';
    for(let h=0;h<24;h++)cells+=`<span class="heat-head">${h%3===0?h:''}</span>`;
    for(let d=0;d<7;d++){cells+=`<span class="heat-lab">${days[d]}</span>`;for(let h=0;h<24;h++){const v=s.heat[d][h],alpha=v?0.12+0.85*Math.pow(v/heatmax,.48):.04;cells+=`<span class="heat-cell" title="${days[d]} ${h}h : ${minutes(v)}" style="background:rgba(172,255,128,${alpha.toFixed(3)})"></span>`;}}
    $('heatmap').innerHTML=cells+'</div>';
  }
  function renderYearWinners() {
    const m=state.model;
    $('yearWinners').innerHTML=[...m.yearly].sort((a,b)=>a[0].localeCompare(b[0])).map(([y,s])=>{
      const win=[...s.artists].sort((a,b)=>b[1].ms-a[1].ms)[0];
      return win?`<div class="winner-card"><span class="yr">${y}</span><strong title="${esc(m.artists[win[0]].name)}">${esc(m.artists[win[0]].name)}</strong><small>${duration(win[1].ms)}</small></div>`:'';
    }).join('');
  }
  function renderSpotlight() {
    const m=state.model,id=state.focusId,a=m.artists[id],s=selectedSummary();
    if (!a)return;
    $('spotlightTitle').textContent=a.name;
    $('spotlightIntro').textContent=state.year==='all'?`Présent dans l’historique du ${prettify(a.first)} au ${prettify(a.last)}.`:`Statistiques de ${a.name} pendant ${state.year}.`;
    const stats=s.artists.get(id)||{ms:0,plays:0,events:0},share=s.ms?100*stats.ms/s.ms:0;
    const artistTracks=[...s.tracks].filter(([tid])=>m.tracks[tid].artistId===id).sort((a,b)=>metric(b[1])-metric(a[1]));
    $('spotlightStats').innerHTML=[['Durée',duration(stats.ms)],['Écoutes ≥ 30 s',fmt(stats.plays)],['Part de l’écoute',fmt(share,1)+' %'],['Titres distincts',fmt(artistTracks.length)]].map(([name,val])=>`<div class="mini-stat"><strong>${val}</strong><small>${name}</small></div>`).join('');
    const show=artistTracks.slice(0,8),maximum=show.length?metric(show[0][1]):0;
    $('spotlightTracks').innerHTML=show.map(([tid,st],i)=>rankRow(i+1,m.tracks[tid].name,'',st,maximum,songUrl(m.tracks[tid].uri))).join('') || '<p class="empty-message">Pas d’écoute sur cette période.</p>';
    const buckets=[];
    const all=state.year==='all';
    const ordered=[...m.yearly].filter(([year])=>all || year===state.year).sort((a,b)=>a[0].localeCompare(b[0]));
    for (const [year,summary] of ordered){
      for(const mon of [...summary.months.keys()].sort()){
        let ms=0;
        // Reconstituer le volume mensuel de l’artiste en agrégeant les semaines n’est pas exact.
        // Les volumes exacts sont stockés à l’import dans artistMonths.
        ms=m.artistMonths.get(id+'|'+mon)||0;
        buckets.push([mon,ms]);
      }
    }
    $('spotlightChart').innerHTML=sparkBars(buckets,all?'Écoutes mensuelles sur toute la période':'Écoutes mensuelles de '+state.year);
  }
  function sparkBars(data,label) {
    if(!data.length)return '<p class="empty-message">Aucune donnée.</p>';
    const W=620,H=230,L=11,R=9,T=13,B=39,P=H-T-B,max=Math.max(1,...data.map(x=>x[1]/60000)),step=(W-L-R)/data.length;
    let out=`<line x1="${L}" y1="${T+P}" x2="${W-R}" y2="${T+P}" stroke="#3e5660"/>`;
    data.forEach(([d,ms],i)=>{const h=(ms/60000/max)*P;out+=`<rect x="${L+i*step+1}" y="${T+P-h}" width="${Math.max(1,step-2)}" height="${Math.max(h,.3)}" rx="2" fill="#b3f37b"><title>${d} : ${minutes(ms)}</title></rect>`;if((data.length>24?d.endsWith('-01'):i%2===0))out+=`<text class="axis-label" x="${L+(i+.5)*step}" y="${H-14}" text-anchor="middle">${data.length>24?d.slice(0,4):d.slice(5)}</text>`;});
    return canvas(W,H,out,label);
  }
  function renderBrowse() {
    if(!state.model)return;
    const s=selectedSummary(),m=state.model;
    const q=$('search').value.trim().toLocaleLowerCase('fr');
    const results=sortedEntries(s.tracks).filter(([id])=>{
      if(!q)return true;
      const t=m.tracks[id];return (t.name+' '+m.artists[t.artistId].name+' '+t.album).toLocaleLowerCase('fr').includes(q);
    });
    const count=Number($('browseLimit').value)||30;
    $('browseCaption').textContent=`${fmt(results.length)} titres trouvés · ${fmt(Math.min(count,results.length))} affichés · tri par ${unit(state.metric)}`;
    const max=results.length?metric(results[0][1]):0;
    $('browse').innerHTML=results.slice(0,count).map(([id,s],i)=>{const t=m.tracks[id];return rankRow(i+1,t.name,m.artists[t.artistId].name+' · '+t.album,s,max,songUrl(t.uri));}).join('')||'<p class="empty-message">Aucun morceau trouvé.</p>';
  }
  function exportCSV() {
    if(!state.model)return;
    const m=state.model,s=selectedSummary();
    const rows=[['Titre','Artiste','Album','Spotify URI','Durée en minutes','Écoutes d’au moins 30 s','Événements de lecture']];
    for(const [id,st] of sortedEntries(s.tracks)){
      const t=m.tracks[id];rows.push([t.name,m.artists[t.artistId].name,t.album,t.uri,(st.ms/60000).toFixed(4),st.plays,st.events]);
    }
    const csv='\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`listening-atlas-${state.year}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function artistColor(id) {
    const m=state.model;
    const i=m.topWeekly.indexOf(id);if(i>=0)return COLORS[i];
    const name=m.artists[id].name;let hash=2166136261;
    for(let k=0;k<name.length;k++)hash=Math.imul(hash^name.charCodeAt(k),16777619);
    return `hsl(${(hash>>>0)%360} 66% 68%)`;
  }
  const CHART={height:410,top:36,bottom:344,pad:22,step:42};
  function chartX(i){return CHART.pad+i*CHART.step;}
  function chartY(v){return CHART.bottom-(v/state.model.weeklyAxis)*(CHART.bottom-CHART.top);}
  function setupWeekly() {
    const m=state.model,svg=$('weeklyChart');
    const width=chartX(m.weeks.length-1)+CHART.step+45;
    const axis=m.weeklyAxis;
    let content='';
    for(let k=0;k<=4;k++){
      const v=axis*k/4,y=chartY(v);
      content+=`<line class="grid-line" x1="0" y1="${y}" x2="${width}" y2="${y}" stroke-dasharray="4 6"/>`;
    }
    let lastYear='';
    m.weekStarts.forEach((date,i)=>{
      const x=chartX(i),year=date.slice(0,4);
      if(year!==lastYear){lastYear=year;content+=`<line class="year-line" x1="${x}" y1="18" x2="${x}" y2="${CHART.bottom+10}"/><text class="year-label" x="${x+6}" y="19">${year}</text>`;}
      if(date.slice(5,7)!==addDay(date,-7).slice(5,7) && i%2===0){content+=`<line class="month-mark" x1="${x}" y1="${CHART.top}" x2="${x}" y2="${CHART.bottom}"/><text class="month-label" x="${x+4}" y="${CHART.bottom+24}">${date.slice(5,7)}</text>`;}
    });
    m.topWeekly.forEach((id,j)=>{
      let path='';
      m.weeks.forEach((v,i)=>{path+=(i?'L':'M')+chartX(i).toFixed(1)+','+chartY(v[j]).toFixed(1)+' ';});
      content+=`<path class="weekly-line" data-artist-id="${id}" d="${path}" stroke="${COLORS[j]}"/>`;
    });
    svg.setAttribute('width',String(width));
    svg.setAttribute('viewBox',`0 0 ${width} ${CHART.height}`);
    svg.innerHTML=content;
    let axisHtml='';
    for(let i=0;i<=4;i++){const v=axis*i/4;axisHtml+=`<span style="top:${chartY(v)}px">${fmt(v)}</span>`;}
    $('fixedAxis').innerHTML=axisHtml;
    $('legend').innerHTML='<button type="button" class="artist-chip active" data-id="all">Tous</button>'+m.topWeekly.map((id,i)=>`<button type="button" class="artist-chip" data-id="${id}" style="--chip:${COLORS[i]}"><span class="chip-dot"></span>${esc(m.artists[id].name)} <span class="chip-total">${fmt(m.artists[id].ms/60000)} min</span></button>`).join('');
    $('weeksLabel').textContent=`${fmt(m.weeks.length)} semaines · du ${prettify(m.first)} au ${prettify(m.last)} · maximum ${fmt(axis)} min / semaine`;
    $('chartScroller').scrollLeft=0;
    updateOverview();
    hoverWeek(0);
  }
  function hoverWeek(i){const m=state.model;if(!m)return;i=clamp(i,0,m.weeks.length-1);const vals=m.weeks[i];const order=m.topWeekly.map((id,j)=>[id,vals[j]]).sort((a,b)=>b[1]-a[1]);const top=state.soloId===null?order:order.filter(x=>x[0]===state.soloId);$('currentWeek').textContent=`Semaine du ${prettify(m.weekStarts[i])} · ${top.slice(0,3).map(([id,v])=>m.artists[id].name+' : '+fmt(v,1)+' min').join(' · ')}`;}
  function updateOverview(){const el=$('chartScroller'),scrollMax=Math.max(1,el.scrollWidth-el.clientWidth),visibleRatio=clamp(el.clientWidth/Math.max(1,el.scrollWidth),.02,1),pos=clamp(el.scrollLeft/scrollMax,0,1);$('overviewThumb').style.width=(visibleRatio*100)+'%';$('overviewThumb').style.left=(pos*(1-visibleRatio)*100)+'%';$('overviewProgress').style.width=((visibleRatio+pos*(1-visibleRatio))*100)+'%';$('overviewTrack').setAttribute('aria-valuenow',String(Math.round(pos*100)));}
  function setChartPosition(p){const el=$('chartScroller');el.scrollLeft=clamp(p,0,1)*(el.scrollWidth-el.clientWidth);updateOverview();}
  function gotoYear(year){if(!state.model)return;const i=state.model.weekStarts.findIndex(d=>d.slice(0,4)===year);if(i<0)return;const el=$('chartScroller');el.scrollTo({left:Math.max(0,chartX(i)-20),behavior:'smooth'});}
  function setSolo(id) {
    state.soloId = id==='all'?null:Number(id);
    $('legend').querySelectorAll('.artist-chip').forEach(chip=>{const its=chip.dataset.id==='all'?null:Number(chip.dataset.id);chip.classList.toggle('active',its===state.soloId);chip.classList.toggle('faded',state.soloId!==null && its!==state.soloId);});
    $('weeklyChart').querySelectorAll('.weekly-line').forEach(el=>el.classList.toggle('faded',state.soloId!==null && Number(el.dataset.artistId)!==state.soloId));
  }


  // --- Course de courbes : deux modes, un top 10 dynamique et une caméra mobile ---
  // Toutes les données viennent du ZIP importé, aucun appel réseau.
  const LINE_WINDOW=27;
  const LINE_SVG={w:980,h:420,l:69,r:33,t:35,b:355};
  function lineSeries(id){
    let series=state.lineSeries.get(id);
    if(series)return series;
    const weeks=state.model.lineWeeks;
    const weekly=new Float64Array(weeks.length),cumulative=new Float64Array(weeks.length);
    let total=0;
    for(let i=0;i<weeks.length;i++){
      weekly[i]=weeks[i].weekly.get(id)||0;
      total+=weekly[i];cumulative[i]=total;
    }
    series={weekly,cumulative};state.lineSeries.set(id,series);
    return series;
  }
  function lineValue(id,at,mode=state.lineMode){
    const values=mode==='cum'?lineSeries(id).cumulative:lineSeries(id).weekly;
    const a=clamp(Math.floor(at),0,values.length-1),b=Math.min(a+1,values.length-1),blend=clamp(at-a,0,1);
    return values[a]*(1-blend)+values[b]*blend;
  }
  function lineTop(at){
    const m=state.model,i=clamp(Math.floor(at),0,m.lineWeeks.length-1),j=Math.min(i+1,m.lineWeeks.length-1);
    const field=state.lineMode==='cum'?'cumulativeTop':'weeklyTop';
    const candidates=new Set([...m.lineWeeks[i][field].map(([id])=>id),...m.lineWeeks[j][field].map(([id])=>id)]);
    return [...candidates].map(id=>[id,lineValue(id,at)]).filter(([,v])=>v>0)
      .sort((a,b)=>b[1]-a[1] || a[0]-b[0]).slice(0,10);
  }
  function initLineRace(){
    stopLineRace();state.linePos=0;state.lineMode='week';state.linePinned=null;state.linePreviousLeader=null;
    state.lineScale=null;state.lineScaleAt=0;
    state.lineSeries.clear();$('lineRanks').innerHTML='';
    const n=state.model.lineWeeks.length;
    $('lineSeek').max=String(Math.max(0,n-1));$('lineSeek').value='0';
    $('lineSpeed').value='30';state.lineSpeed=30/7;
    syncLineModes();renderLineRace();
  }
  function stopLineRace(){
    state.linePlaying=false;state.lineLast=0;
    cancelAnimationFrame(state.lineFrame);
    if($('linePlay')){$('linePlay').textContent='▶ Animer';$('linePlay').setAttribute('aria-label',"Lancer l'animation de la frise");}
  }
  function syncLineModes(){
    $('lineModeToggle').querySelectorAll('[data-line-mode]').forEach(el=>{
      const selected=el.dataset.lineMode===state.lineMode;
      el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',String(selected));
    });
    $('lineRankingUnits').textContent=state.lineMode==='cum'?'Minutes cumulées':'Minutes / semaine';
    $('lineScaleLabel').textContent=state.lineMode==='cum'?'Minutes accumulées depuis le début':'Minutes écoutées pendant la semaine';
  }
  function toggleLineRace(){
    if(!state.model)return;
    if(state.linePlaying){stopLineRace();return;}
    if(state.linePos>=state.model.lineWeeks.length-1)state.linePos=0;
    state.linePlaying=true;state.lineLast=0;state.lineRenderAt=0;
    $('linePlay').textContent='Ⅱ Pause';$('linePlay').setAttribute('aria-label',"Mettre en pause l'animation de la frise");
    state.lineFrame=requestAnimationFrame(lineRaceTick);
  }
  function lineRaceTick(now){
    if(!state.linePlaying)return;
    if(state.lineLast)state.linePos+=Math.min((now-state.lineLast)/1000,.18)*state.lineSpeed;
    state.lineLast=now;
    const last=state.model.lineWeeks.length-1;
    if(state.linePos>=last){state.linePos=last;renderLineRace();stopLineRace();return;}
    if(now-state.lineRenderAt>=32){renderLineRace();state.lineRenderAt=now;}
    state.lineFrame=requestAnimationFrame(lineRaceTick);
  }
  function linePosition(p){
    if(!state.model)return;
    stopLineRace();state.linePos=clamp(p,0,state.model.lineWeeks.length-1);
    state.lineScale=null;state.lineScaleAt=0;renderLineRace();
  }
  function renderLineRace(){
    if(!state.model)return;
    const m=state.model,at=clamp(state.linePos,0,m.lineWeeks.length-1),ix=Math.floor(at);
    const current=m.lineWeeks[ix],top=lineTop(at),ids=top.map(([id])=>id);
    // La caméra suit les 27 dernières semaines, sauf au tout début où la courbe se dessine.
    const start=Math.max(0,at-LINE_WINDOW+1);
    const plotW=LINE_SVG.w-LINE_SVG.l-LINE_SVG.r,plotH=LINE_SVG.b-LINE_SVG.t;
    const xAt=k=>LINE_SVG.l+(k-start)*plotW/(LINE_WINDOW-1);
    const lo=Math.max(0,Math.ceil(start)),hi=ix;
    const drawIds=[...ids];
    if(state.linePinned!==null&&!drawIds.includes(state.linePinned))drawIds.push(state.linePinned);
    // Axe Y stable : inclut le maximum réel de la fenêtre (tous artistes), puis
    // amortit les variations. La descente est plus lente pour éviter le pompage.
    const field=state.lineMode==='cum'?'cumulativeTop':'weeklyTop';
    let observed=1;
    for(let j=lo;j<=hi;j++)observed=Math.max(observed,(m.lineWeeks[j][field][0]?.[1]||0)/60000);
    observed=Math.max(observed,(top[0]?.[1]||0)/60000);
    const target=Math.max(2,observed*1.2);
    const clock=performance.now();
    if(!Number.isFinite(state.lineScale)||state.lineScale===null||!state.linePlaying){
      state.lineScale=target;
    }else{
      const dt=clamp((clock-state.lineScaleAt)/1000,0,.12);
      const tau=target>state.lineScale?.38:2.2;
      state.lineScale+= (target-state.lineScale)*(1-Math.exp(-dt/tau));
    }
    state.lineScaleAt=clock;
    const max=Math.max(1,state.lineScale);
    const yAt=v=>LINE_SVG.b-(v/60000/max)*plotH;
    let svg=`<defs><linearGradient id="lineFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#294840" stop-opacity=".4"/><stop offset="1" stop-color="#102027" stop-opacity=".08"/></linearGradient><clipPath id="lineClip"><rect x="${LINE_SVG.l}" y="${LINE_SVG.t}" width="${plotW}" height="${plotH}"/></clipPath></defs>`;
    svg+=`<rect x="${LINE_SVG.l}" y="${LINE_SVG.t}" width="${plotW}" height="${plotH}" rx="12" fill="url(#lineFill)"/>`;
    for(let k=0;k<=4;k++){
      const v=max*k/4,y=LINE_SVG.b-k/4*plotH;
      svg+=`<line x1="${LINE_SVG.l}" y1="${y}" x2="${LINE_SVG.w-LINE_SVG.r}" y2="${y}" stroke="#3b5658" stroke-opacity="${k===0?.8:.42}" stroke-dasharray="${k?'5 9':'none'}"/><text x="${LINE_SVG.l-12}" y="${y+4}" text-anchor="end" fill="#95b7b9" font-size="12" font-family="ui-monospace,monospace">${fmt(v,v<10?1:0)}</text>`;
    }
    for(let j=lo;j<=Math.min(m.lineWeeks.length-1,Math.floor(at));j++){
      const month=m.weekStarts[j].slice(0,7),before=j?m.weekStarts[j-1].slice(0,7):'';
      if(month!==before){
        const x=xAt(j);if(x>=LINE_SVG.l+4&&x<LINE_SVG.w-LINE_SVG.r-20){
          const monthLabel=new Date(dateUTC(m.weekStarts[j])).toLocaleDateString('fr-FR',{month:'short',year:'2-digit',timeZone:'UTC'});
          svg+=`<line x1="${x}" y1="${LINE_SVG.t}" x2="${x}" y2="${LINE_SVG.b}" stroke="#9dbeae" stroke-opacity=".14"/><text x="${x+5}" y="${LINE_SVG.b+26}" fill="#a3bdb8" font-size="12">${esc(monthLabel)}</text>`;
        }
      }
    }
    const markerX=clamp(xAt(at),LINE_SVG.l,LINE_SVG.w-LINE_SVG.r);
    svg+=`<line x1="${markerX.toFixed(2)}" y1="${LINE_SVG.t}" x2="${markerX.toFixed(2)}" y2="${LINE_SVG.b}" stroke="#d3ffb0" stroke-opacity=".45" stroke-width="1.5" stroke-dasharray="4 7"/>`;
    // Les courbes hors focus sont derrière les courbes en tête. Le focus reste lumineux.
    const ordered=[...drawIds].reverse().sort((a,b)=>(a===state.linePinned?1:0)-(b===state.linePinned?1:0));
    svg+='<g clip-path="url(#lineClip)">';
    for(const id of ordered){
      const pinned=state.linePinned===id,fade=state.linePinned!==null&&!pinned;
      const color=artistColor(id);
      let path='';
      for(let i=lo;i<=hi;i++){
        path+=(path?'L':'M')+xAt(i).toFixed(2)+','+yAt(lineValue(id,i)).toFixed(2)+' ';
      }
      if(at>hi+.001 || !path)path+=(path?'L':'M')+xAt(at).toFixed(2)+','+yAt(lineValue(id,at)).toFixed(2);
      const cv=lineValue(id,at),cx=xAt(at),cy=yAt(cv);
      const stroke=pinned?2.25:1.45;
      svg+=`<path d="${path.trim()}" fill="none" stroke="${color}" stroke-opacity="${fade?.06:.12}" stroke-width="${stroke+3.1}" stroke-linecap="round" stroke-linejoin="round"/>`;
      svg+=`<path d="${path.trim()}" fill="none" stroke="${color}" stroke-opacity="${fade?.25:.88}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>`;
      svg+=`<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${pinned?4.6:3.1}" fill="${color}" fill-opacity="${fade?.3:1}" stroke="#122027" stroke-width="1.3"/>`;
    }
    svg+='</g>';
    $('lineRaceChart').innerHTML=svg;
    $('lineRaceChart').setAttribute('aria-label',`${state.lineMode==='cum'?'Écoutes cumulées':'Écoutes hebdomadaires'} au ${prettify(current.date)}, ${top.length} artistes classés`);
    const dateIndex=Math.min(m.weekStarts.length-1,Math.round(at));
    $('lineDate').textContent=prettify(m.weekStarts[dateIndex]);
    $('lineWeekLabel').textContent=`SEMAINE ${fmt(ix+1)} / ${fmt(m.lineWeeks.length)} · ${state.lineMode==='cum'?'COURSE CUMULÉE':'COURSE HEBDOMADAIRE'}`;
    const leaderId=top[0]?.[0];
    const leaderName=leaderId===undefined?'—':m.artists[leaderId].name;
    if(leaderId!==state.linePreviousLeader){
      $('lineLeader').classList.remove('line-leader-flash');void $('lineLeader').offsetWidth;$('lineLeader').classList.add('line-leader-flash');
      state.linePreviousLeader=leaderId;
    }
    $('lineLeader').textContent=leaderName;
    $('lineLeaderValue').textContent=top.length?minutes(top[0][1]):'Aucune écoute';
    $('lineLeader').style.color=leaderId!==undefined?artistColor(leaderId):'var(--lime)';
    renderLineRanks(top);
    $('lineSeek').value=String(at);
    const remain=(m.lineWeeks.length-1-at)/state.lineSpeed;
    $('lineRemaining').textContent=`${fmt(remain)} s restantes`;
  }
  function renderLineRanks(top){
    const root=$('lineRanks'),m=state.model,max=Math.max(1,top[0]?.[1]||1),current=new Set(top.map(([id])=>id));
    for(const el of [...root.children]){
      if(!current.has(Number(el.dataset.id))){el.classList.add('line-exit');
        if(!el.dataset.removing){el.dataset.removing='1';setTimeout(()=>{if(el.classList.contains('line-exit'))el.remove();else delete el.dataset.removing;},360);}
      }
    }
    top.forEach(([id,value],pos)=>{
      let el=root.querySelector(`.line-rank[data-id="${id}"]`);
      if(!el){
        el=document.createElement('button');el.type='button';el.className='line-rank line-exit';el.dataset.id=id;el.style.setProperty('--color',artistColor(id));
        el.innerHTML=`<span class="line-rank-number"></span><span class="line-rank-name"></span><span class="line-rank-value"></span><span class="line-rank-bar"><span></span></span>`;
        root.append(el);
      }
      el.classList.remove('line-exit');el.classList.toggle('line-pinned',state.linePinned===id);el.classList.toggle('line-first',pos===0);
      el.style.setProperty('--rank-y',(pos*45)+'px');
      el.title=`${m.artists[id].name} · ${minutes(value)} · Cliquer pour ${state.linePinned===id?'retirer':'afficher'} le focus`;
      el.querySelector('.line-rank-number').textContent=String(pos+1).padStart(2,'0');
      el.querySelector('.line-rank-name').textContent=m.artists[id].name;
      el.querySelector('.line-rank-value').textContent=fmt(value/60000)+' min';
      el.querySelector('.line-rank-bar span').style.width=(value/max*100).toFixed(1)+'%';
    });
  }

  function initRace() {
    stopRace();state.raceDay=0;state.raceCount=10;state.raceElements.clear();
    $('raceCount').value='10';
    $('raceCountLabel').textContent='TOP 10 CUMULÉ';
    $('raceInner').style.height='570px';
    $('raceRows').scrollTop=0;
    $('seekRace').max=String(Math.max(0,state.model.days.length-1));$('seekRace').value='0';
    $('raceInner').innerHTML='';
    const days=state.model.days.length;
    $('raceRemaining').textContent=`${fmt(days/30,0)} s à 30 jours/s`;
    renderRace();
  }
  function stopRace(){state.racePlaying=false;state.raceLast=0;cancelAnimationFrame(state.raceFrame);if($('playRace')){$('playRace').textContent='▶ Lire';$('playRace').setAttribute('aria-label','Lire l’animation');}}
  function playRace(){if(!state.model)return;state.racePlaying=!state.racePlaying;if(state.racePlaying){if(state.raceDay>=state.model.days.length-1)state.raceDay=0;state.raceLast=0;state.raceFrame=requestAnimationFrame(raceTick);$('playRace').textContent='Ⅱ Pause';$('playRace').setAttribute('aria-label','Mettre en pause l’animation');}else stopRace();}
  function raceTick(now){if(!state.racePlaying)return;
    if(state.raceLast)state.raceDay += Math.min((now-state.raceLast)/1000,0.18)*state.speed;
    state.raceLast=now;
    if(state.raceDay>=state.model.days.length-1){state.raceDay=state.model.days.length-1;renderRace();stopRace();return;}
    if(now-state.raceRenderAt>=29){renderRace();state.raceRenderAt=now;}
    state.raceFrame=requestAnimationFrame(raceTick);
  }
  function renderRace(){
    if(!state.model)return;
    const m=state.model,i=clamp(Math.floor(state.raceDay),0,m.days.length-1),next=Math.min(i+1,m.days.length-1),alpha=state.raceDay-i;
    const a=m.days[i],b=m.days[next],aMap=new Map(a.top),bMap=new Map(b.top);
    const candidates=new Set([...aMap.keys(),...bMap.keys()]);
    const top=[...candidates].map(id=>{
      const av=aMap.get(id)??bMap.get(id)??0,bv=bMap.get(id)??av;
      return [id,av+(bv-av)*alpha];
    }).sort((x,y)=>y[1]-x[1] || x[0]-y[0]).slice(0,state.raceCount);
    const max=Math.max(1,top[0]?.[1]||1),all=new Set(top.map(x=>x[0]));
    const root=$('raceInner');
    for(const [id,el] of state.raceElements){
      if(all.has(id))continue;
      el.classList.add('out');
      if(!el.dataset.removing){
        el.dataset.removing='1';
        setTimeout(()=>{if(el.classList.contains('out')){el.remove();if(state.raceElements.get(id)===el)state.raceElements.delete(id);}else delete el.dataset.removing;},280);
      }
    }
    top.forEach(([id,value],pos)=>{
      let el=state.raceElements.get(id);
      if(!el){el=document.createElement('div');el.className='racer out';el.dataset.id=id;el.style.setProperty('--color',artistColor(id));el.innerHTML=`<div class="r-rank"></div><div class="r-name"><span class="r-dot"></span><span title="${esc(m.artists[id].name)}">${esc(m.artists[id].name)}</span></div><div class="r-track"><div class="r-fill"></div></div><div class="r-value"></div>`;root.append(el);state.raceElements.set(id,el);}
      el.classList.remove('out');el.classList.toggle('first',pos===0);el.style.setProperty('--y',(pos*52)+'px');el.querySelector('.r-rank').textContent=String(pos+1);el.querySelector('.r-fill').style.width=(value/max*100).toFixed(2)+'%';el.querySelector('.r-value').textContent=fmt(value/60000)+' min';
    });
    $('raceDate').textContent=prettify(a.date);
    $('raceDays').textContent=`Jour ${fmt(i+1)} sur ${fmt(m.days.length)} · ${fmt(m.raceContendersByLimit[state.raceCount].size)} artistes passés dans le top ${state.raceCount}`;
    $('raceTotal').textContent=duration(a.totalMs+(b.totalMs-a.totalMs)*alpha);
    $('seekRace').value=String(i);
    const remain=Math.max(0,(m.days.length-1-state.raceDay)/state.speed);
    $('raceRemaining').textContent=fmt(remain)+' s restantes';
  }
  function markNav(){const nav=$('dashboard');nav.querySelectorAll('.nav-link').forEach(link=>{link.addEventListener('click',()=>{nav.querySelectorAll('.nav-link').forEach(l=>l.classList.toggle('active',l===link));});});}

  // Import + interactions (tous les composants restent inertes tant que le ZIP n'est pas chargé).
  $('uploadZone').addEventListener('click',()=>$('fileInput').click());
  $('uploadZone').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('fileInput').click();}});
  $('fileInput').addEventListener('change',e=>importZip(e.target.files[0]));
  $('reimportBtn').addEventListener('click',()=>$('fileInput').click());
  let dragLevel=0;
  document.addEventListener('dragenter',e=>{if([...e.dataTransfer?.types||[]].includes('Files')){dragLevel++;$('uploadZone').classList.add('drag-over');}});
  document.addEventListener('dragleave',()=>{dragLevel--;if(dragLevel<=0){dragLevel=0;$('uploadZone').classList.remove('drag-over');}});
  document.addEventListener('dragover',e=>{if([...e.dataTransfer?.types||[]].includes('Files'))e.preventDefault();});
  document.addEventListener('drop',e=>{e.preventDefault();dragLevel=0;$('uploadZone').classList.remove('drag-over');if(e.dataTransfer?.files?.length)importZip(e.dataTransfer.files[0]);});
  $('yearSelect').addEventListener('change',e=>{state.year=e.target.value;renderDashboard();});
  $('yearsChart').addEventListener('click',e=>{const bar=e.target.closest('[data-year]');if(bar){state.year=bar.dataset.year;renderDashboard();}});
  $('metricToggle').addEventListener('click',e=>{const button=e.target.closest('[data-metric]');if(button){state.metric=button.dataset.metric;renderDashboard();}});
  $('spotlightSelect').addEventListener('change',e=>{state.focusId=Number(e.target.value);renderSpotlight();});
  $('search').addEventListener('input',renderBrowse);
  $('browseLimit').addEventListener('change',renderBrowse);
  $('csvBtn').addEventListener('click',exportCSV);
  $('legend').addEventListener('click',e=>{const b=e.target.closest('[data-id]');if(b)setSolo(b.dataset.id);});
  $('chartStart').addEventListener('click',()=>setChartPosition(0));
  $('chartEnd').addEventListener('click',()=>setChartPosition(1));
  $('chartYears').addEventListener('change',e=>gotoYear(e.target.value));
  $('chartScroller').addEventListener('scroll',()=>{updateOverview();const i=Math.round(($('chartScroller').scrollLeft+$('chartScroller').clientWidth/2-CHART.pad)/CHART.step);hoverWeek(i);},{passive:true});
  $('chartScroller').addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button===0){const el=$('chartScroller');state.chartDragging={x:e.clientX,scroll:el.scrollLeft};el.classList.add('dragging');el.setPointerCapture(e.pointerId);}});
  $('chartScroller').addEventListener('pointermove',e=>{const el=$('chartScroller');if(state.chartDragging){el.scrollLeft=state.chartDragging.scroll+state.chartDragging.x-e.clientX;return;}if(!state.model)return;const x=e.clientX-el.getBoundingClientRect().left+el.scrollLeft;hoverWeek(Math.round((x-CHART.pad)/CHART.step));});
  const endDrag=()=>{state.chartDragging=false;$('chartScroller').classList.remove('dragging');};
  $('chartScroller').addEventListener('pointerup',endDrag);$('chartScroller').addEventListener('pointercancel',endDrag);
  $('overviewTrack').addEventListener('click',e=>{const rect=e.currentTarget.getBoundingClientRect();setChartPosition((e.clientX-rect.left)/rect.width);});
  $('overviewTrack').addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const scroll=$('chartScroller'),max=scroll.scrollWidth-scroll.clientWidth;setChartPosition((scroll.scrollLeft+(e.key==='ArrowRight'?150:-150))/Math.max(1,max));}});
  window.addEventListener('resize',()=>{if(state.model)updateOverview();});
  $('linePlay').addEventListener('click',toggleLineRace);
  $('lineRestart').addEventListener('click',()=>linePosition(0));
  $('lineToEnd').addEventListener('click',()=>linePosition(state.model?state.model.lineWeeks.length-1:0));
  $('lineModeToggle').addEventListener('click',e=>{const b=e.target.closest('[data-line-mode]');if(!b||!state.model)return;state.lineMode=b.dataset.lineMode;state.linePreviousLeader=null;state.lineScale=null;state.lineScaleAt=0;syncLineModes();renderLineRace();});
  $('lineSpeed').addEventListener('change',e=>{state.lineSpeed=(Number(e.target.value)||30)/7;renderLineRace();});
  $('lineSeek').addEventListener('input',e=>linePosition(Number(e.target.value)||0));
  $('lineRanks').addEventListener('click',e=>{const b=e.target.closest('.line-rank');if(!b||!state.model)return;const id=Number(b.dataset.id);state.linePinned=state.linePinned===id?null:id;renderLineRace();});
  $('playRace').addEventListener('click',playRace);
  $('resetRace').addEventListener('click',()=>{stopRace();state.raceDay=0;renderRace();});
  $('speedSelect').addEventListener('change',e=>{state.speed=Number(e.target.value)||30;});
  $('raceCount').addEventListener('change',e=>{
    if(!state.model)return;
    state.raceCount=Number(e.target.value)||10;
    $('raceCountLabel').textContent=`TOP ${state.raceCount} CUMULÉ`;
    $('raceInner').style.height=Math.max(570,state.raceCount*52+12)+'px';
    $('raceRows').scrollTop=0;
    renderRace();
  });
  $('seekRace').addEventListener('input',e=>{stopRace();state.raceDay=Number(e.target.value)||0;renderRace();});

})();
