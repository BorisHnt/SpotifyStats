/* Listening Atlas — Spotify Technical Log Observatory.
   Stateless Github Pages module. ZIPs processed only in local browser memory.
   No IDs, tokens, IPs, URLs, filenames, raw records or personal strings are stored. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const fmt=(x,d=0)=>Number(x||0).toLocaleString('fr-FR',{maximumFractionDigits:d});
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=(v,total)=>total?fmt(v*100/total,1)+' %':'—';
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const num=v=>finite(v)?v:null;
  const dayUTC=t=>typeof t==='string' && /^20\d\d-\d\d-\d\dT/.test(t) && Number.isFinite(Date.parse(t)) ? t.slice(0,10):null;
  const ymd=d=>Date.parse(d+'T12:00:00Z');
  const monthLabel=s=>new Date(ymd(s+'-01')).toLocaleDateString('fr-FR',{month:'short',year:'2-digit',timeZone:'UTC'});
  const dateLabel=s=>new Date(ymd(s)).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
  const formatBytes=n=>n>=1e9?fmt(n/1e9,2)+' Go':n>=1e6?fmt(n/1e6,1)+' Mo':fmt(n/1000,1)+' Ko';
  const capped=(v,l=65)=>String(v).slice(0,l).replace(/[\u0000-\u001f\u007f]/g,'');
  const reduceArray=(arr, limit=12)=>arr.slice(0,limit);
  const groupTypes={
    'Lecture':['RawCoreStream','TrackNotPlayed','ContextPlayerCommandEvent','ListPlayerEvent','AutoTransition','ShuffleSequenceEvent','OnRepeatContents','CoreAutoplayLoadingResults','ResumePointRevisionCreated','TrackPlaybackGenericRequest'],
    'Audio / qualité':['AudioSettingsReport','AudioStreamingSettingsReport','AudioFileSelection','AudioOffliningSettingsReport','AudioResolve','AudioRouteSegmentEnd','SystemVolumeControl','PlaybackSettingsPersistedSetting'],
    'Réseau / cache':['Download','ProgressiveDownload','SegmentedDownload','HeadFileDownload','CacheReport','CacheRealmReport','CacheError','CachePruningReport','OfflineReport','OfflineEvent','Offline2ClientEvent','Offline2ResourceEvent','ConnectionInfo','AutomaticDataSaverEvent','MediaPrefetch','Prefetch'],
    'Appareils / Connect':['AndroidDeviceReport','ConnectActiveDeviceChanged','ConnectDeviceDiscovered','ClientConnectEnvironment','ClientCoreConnectCommand','ClientCoreConnectPullOperation','ClientRespondedToConnectStateCommand','ClientSentConnectStateCommand','ClientSentSetVolumeCommand','DeviceCapabilitiesRequest','AudioRouteSegmentEnd','AccessoryStateEvent','CarDetectionEvent','BluetoothMtuNegotiationResult'],
    'Erreurs / stabilité':['PlaybackError','RequestFailure','Stutter','StutterPrediction','TrackNotPlayed','ConnectConnectivityError','JumpstartError','HomeFeedLoadingErrorEvent','AndroidAppExitReason','AdvanceStuck','DeadEndsPlaybackTimeoutEvent','CacheError','ExternalAccessoryRemoteError'],
    'Bibliothèque / social':['AddToPlaylist','AddedToPlaylist','AddedToCollection','RemovedFromCollection','CreatePlaylist','PlaylistCreated','AddedToRootlist','Share','SocialConnectSessionCreated','SocialConnectSessionEnded','SocialListeningClientSessionCreated','JamNearbyBroadcastStarted','SocialConnectInviteNotificationSentV2'],
    'Interface / suggestions':['HomeSectionResponse','ContinuumSectionResponseV1','CanvasState','SearchViewResponse','HomeFeedLoadingEvent','CoreAutoplayLoadingResults','ReleaseRadarServedRecs','NPVScrollSectionResponse','LyricsSnippetViewEvent','VotingBannerDisplayed','PushNotificationDisplayedAndroidEvent','ClientMessagingPlatformRequestEvent']
  };
  const groups=Object.entries(groupTypes);
  const groupOf=type=>{
    const matches=groups.filter(([,types])=>types.includes(type));
    if(matches.length)return matches[0][0];
    if(/error|fail|stutter|stuck|timeout/i.test(type))return 'Erreurs / stabilité';
    if(/Social|Jam|Share|Playlist|Collection/i.test(type))return 'Bibliothèque / social';
    if(/Download|Network|Cache|Offline|Request/i.test(type))return 'Réseau / cache';
    if(/Device|Connect|Bluetooth|CarDetection|Accessory/i.test(type))return 'Appareils / Connect';
    if(/Audio|Volume|Playback|Player/i.test(type))return 'Audio / qualité';
    return 'Autres événements';
  };
  const niceName={
    context_device_type:'Catégorie d’appareil',context_os_name:'Système',
    message_media_type:'Type de média',message_reason_start:'Raison de démarrage',message_reason_end:'Raison de fin',
    message_shuffle:'Mode aléatoire',message_live:'En direct',message_content_is_downloaded:'Contenu téléchargé',message_social_listening:'Écoute partagée',
    message_bitrate:'Débit du fichier (kb/s)',message_target_bitrate:'Débit visé (kb/s)',
    message_strategy_name:'Stratégie de chargement',message_file_origin:'Origine du fichier',
    message_play_bitrate_cellular:'Qualité réseau mobile (kb/s)',message_play_bitrate_wifi:'Qualité Wi-Fi (kb/s)',
    message_user_selected_play_bitrate_cellular:'Préférence données mobiles',message_user_selected_play_bitrate_wifi:'Préférence Wi-Fi',
    message_enable_crossfade:'Fondu enchaîné',message_enable_gapless:'Lecture sans blanc',message_enable_normalization:'Normalisation',
    message_enable_equalizer:'Égaliseur',message_enable_automix:'Mix automatique',message_enable_mono_downmixer:'Mono',
    message_audio_loudness_level:'Volume de normalisation',message_offline_mode:'Mode hors ligne',
    message_current_route_type:'Sortie audio',message_new_active_device_audio_output_device_type:'Sortie Spotify Connect',
    message_request_type:'Type de requête',message_cdn_protocol:'Protocole CDN',message_initial_disk_state:'État du disque',
    message_content_type:'Type de contenu',message_reason_not_played:'Pourquoi non joué',
    message_error_category_name:'Catégorie d’erreur',message_error_code:'Code erreur',message_source:'Source',message_error:'Erreur',
    message_command:'Commande',message_command_source:'Origine commande',message_reason:'Motif',
    message_change_reason:'Cause du changement',message_send_reason:'Rapport déclenché par',message_reachability_type:'État réseau',
    message_result:'Résultat',message_client_platform:'Plateforme',message_audiocodec:'Codec',message_fatal:'Erreur fatale',
    message_enabled:'Activé',message_connection_quality:'Qualité connexion',message_volume:'Volume système',message_screen_density_dpi:'Densité écran',
    message_num_downloaded_tracks:'Titres hors ligne',message_num_downloaded_episodes:'Épisodes hors ligne',
    message_cache_age:'Âge cache',message_num_entries:'Éléments en cache',message_size_kb:'Taille cache (Ko)',
    message_total_time:'Durée téléchargement (ms)',message_bytes_from_cdn:'Données CDN',message_bytes_from_cache:'Données cache',
    message_bytes_from_wifi:'Données Wi-Fi',message_bytes_from_carrier:'Données mobiles',message_cdn_initial_latency:'Latence CDN (ms)',
    message_num_cache_error:'Erreurs cache',message_error_from_cdn:'Erreurs CDN',
    message_playback_speed:'Vitesse lecture',message_crossfade_time:'Durée fondu (ms)',
    message_memory:'Mémoire appareil (octets)',message_num_processors:'Processeurs',message_screen_width:'Largeur écran',message_screen_height:'Hauteur écran',
    message_no_playback_duration:'Durée sans lecture',message_ms_played:'Durée jouée (ms)'
  };
  // Exact safe list: do not collect arbitrary free-text log values.
  const safeCategories=new Set([
    'context_device_type','context_os_name','message_media_type','message_reason_start','message_reason_end','message_shuffle','message_live',
    'message_content_is_downloaded','message_social_listening','message_strategy_name','message_file_origin',
    'message_enable_crossfade','message_enable_gapless','message_enable_normalization','message_enable_equalizer','message_enable_automix',
    'message_enable_mono_downmixer','message_audio_loudness_level','message_offline_mode','message_current_route_type',
    'message_new_active_device_audio_output_device_type','message_request_type','message_cdn_protocol','message_initial_disk_state',
    'message_content_type','message_reason_not_played','message_error_category_name','message_error_code','message_source','message_error',
    'message_command','message_command_source','message_reason','message_change_reason','message_send_reason','message_reachability_type',
    'message_result','message_audiocodec','message_fatal','message_enabled','message_connection_quality','message_client_platform'
  ]);
  const safeNumbers=new Set([
    'message_ms_played','message_bitrate','message_target_bitrate','message_play_bitrate_cellular','message_play_bitrate_wifi','message_crossfade_time',
    'message_volume','message_num_downloaded_tracks','message_num_downloaded_episodes','message_num_entries','message_size_kb',
    'message_total_time','message_bytes_from_cdn','message_bytes_from_cache','message_bytes_from_wifi','message_bytes_from_carrier',
    'message_bytes_from_ap','message_cdn_initial_latency','message_cdn_avg_latency','message_cdn_avg_bw','message_num_cache_error',
    'message_error_from_cdn','message_num_processors','message_memory','message_screen_width','message_screen_height','message_screen_density_dpi',
    'message_no_playback_duration','message_playback_speed','message_total_num_tracks','message_total_num_links','message_permanent_size_kb',
    'message_num_full_entries','message_estimated_frame_loss','message_buffered_ms'
  ]);
  const state={model:null,year:'all',group:'all',type:'RawCoreStream',trend:'all',file:null,busy:false};
  const blank=()=>({count:0,byMonth:new Map(),byDay:new Map(),times:[],fields:new Map(),cat:new Map(),num:new Map()});
  const inc=(m,k,n=1)=>m.set(k,(m.get(k)||0)+n);
  const newNum=()=>({n:0,sum:0,min:Infinity,max:-Infinity,byMonth:new Map(),latest:null});
  const safeCatValue=(v,k)=>{
    if(typeof v==='boolean')return v?'Oui':'Non';
    if(typeof v==='number')return finite(v)?String(v):null;
    if(typeof v!=='string'||!v||v.length>55)return null;
    if(/[\n\r<>@]|\/\/|\\|[?=&]|spotify:|[a-f0-9]{30}|\b(?:https?|tcp):/i.test(v))return null;
    // No high-cardinality free strings, even from allowlisted keys.
    if(/(token|uri|uuid|_id$|ip|email|serial|key|path|name|model|firmware|url|mac)/i.test(k))return null;
    return capped(v,55);
  };
  const process=(model,type,r)=>{
    if(!r||typeof r!=='object'||Array.isArray(r))return;
    const day=dayUTC(r.timestamp_utc);
    const cat=groupOf(type);
    const obj=model.types.get(type)||blank();model.types.set(type,obj);
    obj.count++;model.total++;inc(model.categories,cat);
    if(day){
      const month=day.slice(0,7);inc(obj.byMonth,month);inc(obj.byDay,day);inc(model.monthly,month);inc(model.daily,day);
      const hours=Number(r.timestamp_utc.slice(11,13));if(hours>=0&&hours<24)model.hours[hours]++;
      if(!model.first||day<model.first)model.first=day;if(!model.last||day>model.last)model.last=day;
      if(typeof r.context_device_type==='string'){const v=safeCatValue(r.context_device_type,'context_device_type');if(v)inc(model.devices,v);}
      if(typeof r.context_os_name==='string'){const v=safeCatValue(r.context_os_name,'context_os_name');if(v)inc(model.os,v);}
      // Device models and Spotify versions are ordinary product identifiers, not unique device/account IDs.
      if(typeof r.context_device_model==='string' && /^[a-z\d_.() +-]{2,45}$/i.test(r.context_device_model))inc(model.deviceModels,r.context_device_model);
      if(typeof r.context_application_version==='string' && /^\d+(?:\.\d+){1,4}$/.test(r.context_application_version))inc(model.appVersions,r.context_application_version);
    }else model.noDate++;
    for(const [key,val] of Object.entries(r)){
      // Keep aggregate field presence only; never the original field value.
      inc(obj.fields,key);
      if(!day)continue;
      if(safeCategories.has(key)){
        const safe=safeCatValue(val,key);
        if(safe===null)continue;
        if(!obj.cat.has(key))obj.cat.set(key,new Map());
        const dist=obj.cat.get(key);
        if(dist.has(safe)||dist.size<40)inc(dist,safe);else inc(dist,'Autres valeurs');
      }
      if(safeNumbers.has(key)&&finite(val)&&val>=0&&val<1e16){
        if(!obj.num.has(key))obj.num.set(key,newNum());
        const metric=obj.num.get(key);
        metric.n++;metric.sum+=val;metric.min=Math.min(val,metric.min);metric.max=Math.max(val,metric.max);
        const monthly=metric.byMonth.get(day.slice(0,7))||{sum:0,n:0};monthly.sum+=val;monthly.n++;metric.byMonth.set(day.slice(0,7),monthly);
        if(!metric.latest || day>=metric.latest[0])metric.latest=[day,val];
      }
    }
    // 5 specialized datasets: controlled, typed aggregates (no raw event objects).
    if(type==='RawCoreStream'){
      const ms=num(r.message_ms_played);if(ms!==null&&ms>=0){model.stream.ms+=ms;model.stream.valid++;
        if(ms>=30000)model.stream.qualified++;
        inc(model.stream.monthly,day.slice(0,7),ms);
      }
      if(r.message_shuffle===true)model.stream.shuffle++;
      if(r.message_content_is_downloaded===true)model.stream.downloaded++;
    }
    if(type==='AudioFileSelection'){
      const bitrate=num(r.message_bitrate);if(bitrate!==null&&bitrate>=0)inc(model.bitRates,fmt(bitrate/1000)+' kb/s');
    }
    if(type==='AudioStreamingSettingsReport'){
      const cell=num(r.message_play_bitrate_cellular),wifi=num(r.message_play_bitrate_wifi);
      if(day && cell!==null&&cell>=0)model.audioNetwork.push({day,wifi: (wifi!==null&&wifi>=0)?wifi/1000:null,cell:cell/1000});
    }
    if(type==='AudioSettingsReport'&&day){
      const snap={day};for(const field of ['message_enable_crossfade','message_enable_gapless','message_enable_normalization','message_enable_equalizer','message_enable_automix','message_offline_mode','message_enable_mono_downmixer']){
        if(typeof r[field]==='boolean')snap[field]=r[field];
      }
      if(Object.keys(snap).length>1)model.settingSnapshots.push(snap);
    }
    if(type==='Download'){
      const fields=['message_bytes_from_cdn','message_bytes_from_cache','message_bytes_from_wifi','message_bytes_from_carrier','message_bytes_from_ap'];
      for(const f of fields){const v=num(r[f]);if(v!==null&&v>=0)model.network[f]=(model.network[f]||0)+v;}
    }
    if(type==='OfflineReport'&&day){const v=num(r.message_num_downloaded_tracks);if(v!==null&&v>=0)model.offlineSnapshots.push({day,tracks:v});}
    if(type==='CacheReport'&&day){const v=num(r.message_size_kb);if(v!==null&&v>=0)model.cacheSnapshots.push({day,mb:v/1024});}
    if(type==='SystemVolumeControl'&&day){const v=num(r.message_volume);if(v!==null&&v<=1&&v>=0){const p=day.slice(0,7);const a=model.volumes.get(p)||{sum:0,n:0};a.sum+=v*100;a.n++;model.volumes.set(p,a);}}
  };
  function newModel(){return {types:new Map(),categories:new Map(),monthly:new Map(),daily:new Map(),devices:new Map(),deviceModels:new Map(),appVersions:new Map(),os:new Map(),hours:Array(24).fill(0),first:null,last:null,total:0,noDate:0,files:0,stream:{valid:0,ms:0,qualified:0,shuffle:0,downloaded:0,monthly:new Map()},bitRates:new Map(),audioNetwork:[],settingSnapshots:[],network:{},offlineSnapshots:[],cacheSnapshots:[],volumes:new Map(),parseWarnings:[]};}
  const timeseries=(map,year)=>[...map].filter(([k])=>year==='all'||k.startsWith(year)).sort(([a],[b])=>a.localeCompare(b));
  const keyCount=(map,limit=12)=>[...map].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]))).slice(0,limit);
  const panel=(title,sub,inner)=>`<article class="tech-panel"><div class="tech-panel-head"><h3>${esc(title)}</h3>${sub?`<p>${esc(sub)}</p>`:''}</div>${inner}</article>`;
  const empty=(s='Pas de données disponibles sur cette période.')=>`<p class="tech-empty">${esc(s)}</p>`;
  const cards=list=>`<div class="tech-metrics">${list.map(([t,v,n])=>`<div class="tech-metric"><span>${esc(t)}</span><strong>${esc(v)}</strong><small>${esc(n||'')}</small></div>`).join('')}</div>`;
  function bars(entries,max=12,formatter=fmt){
    const a=entries.slice(0,max),greatest=Math.max(1,...a.map(x=>x[1]));
    return a.length?`<div class="tech-bars">${a.map(([name,value],i)=>`<div class="tech-bar-row"><span class="tech-bar-index">${i+1}</span><span class="tech-bar-name" title="${esc(name)}">${esc(name)}</span><div class="tech-bar-track"><div style="width:${(value/greatest*100).toFixed(2)}%"></div></div><strong>${esc(formatter(value))}</strong></div>`).join('')}</div>`:empty();
  }
  function line(points,label,{color='#c8ff77',axis='total',digits=0}={}){
    if(!points.length)return empty();
    const W=880,H=250,L=62,R=16,T=20,B=40,pw=W-L-R,ph=H-T-B;
    const max=Math.max(1,...points.map(x=>x[1]));const x=i=>L+(i/(Math.max(1,points.length-1)))*pw,y=v=>T+ph-v/max*ph;
    let svg='';for(let j=0;j<=4;j++){const v=max*j/4,Y=y(v);svg+=`<line x1="${L}" y1="${Y}" x2="${W-R}" y2="${Y}" stroke="#4d6868" stroke-opacity=".44" stroke-dasharray="5 6"/><text x="${L-9}" y="${Y+4}" fill="#a8c0b9" text-anchor="end" font-size="12">${esc(fmt(v,digits))}</text>`;}
    const skip=Math.max(1,Math.ceil(points.length/10));for(let i=0;i<points.length;i++)if(i%skip===0||i===points.length-1){const date=points[i][0],short=/^\d{4}-\d{2}$/.test(date)?monthLabel(date):date.slice(5);svg+=`<text x="${x(i).toFixed(2)}" y="${H-12}" text-anchor="middle" fill="#b0c6bf" font-size="11">${esc(short)}</text>`;}
    svg+=`<polyline points="${points.map((p,i)=>x(i).toFixed(2)+','+y(p[1]).toFixed(2)).join(' ')}" fill="none" stroke="${color}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>`;
    if(points.length<28)svg+=points.map((p,i)=>`<circle cx="${x(i).toFixed(2)}" cy="${y(p[1]).toFixed(2)}" r="2.7" fill="${color}"><title>${esc(p[0])} · ${esc(fmt(p[1],digits))} ${esc(label)}</title></circle>`).join('');
    return `<svg class="tech-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${svg}</svg>`;
  }
  function selectors(m){
    const years=[...new Set([...m.monthly.keys()].map(x=>x.slice(0,4)))].sort();
    $('techYear').innerHTML='<option value="all">Toute la période</option>'+years.map(y=>`<option value="${esc(y)}">${esc(y)}</option>`).join('');
    state.year='all';$('techYear').value='all';
    $('techEventType').innerHTML=[...m.types].sort((a,b)=>b[1].count-a[1].count).map(([k,v])=>`<option value="${esc(k)}">${esc(k)} (${fmt(v.count)})</option>`).join('');
    state.type=m.types.has('RawCoreStream')?'RawCoreStream':[...m.types.keys()][0];$('techEventType').value=state.type;
    const groups=[...m.categories.keys()].sort();
    $('techTrend').innerHTML='<option value="all">Tous les événements</option>'+groups.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
    state.trend='all';state.group='all';
  }
  const groupCounts=(m,year)=>{
    const counts=new Map();for(const [typ,o] of m.types){const n=timeseries(o.byMonth,year).reduce((a,b)=>a+b[1],0);if(n)inc(counts,groupOf(typ),n);}return counts;
  };
  const typeCounts=(m,year)=>[...m.types].map(([type,o])=>[type,timeseries(o.byMonth,year).reduce((a,b)=>a+b[1],0)]).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]);
  const monthlyGroup=(m,group,year)=>{
    const combined=new Map();for(const [type,obj] of m.types){if(group!=='all'&&groupOf(type)!==group)continue;for(const [k,v] of obj.byMonth){if(year==='all'||k.startsWith(year))inc(combined,k,v);}}
    return timeseries(combined,year);
  };
  const filterCat=(o,k,year)=>{
    // Distributions are aggregated for the full archive; never label them as annual.
    return o.cat.get(k)||new Map();
  };
  function trend(){const m=state.model,yr=state.year,total=timeseries(m.monthly,yr).reduce((n,[,v])=>n+v,0);
    const typeN=typeCounts(m,yr),groupsN=groupCounts(m,yr);
    $('techSummary').innerHTML=cards([
      ['Événements enregistrés',fmt(total),'Journaux techniques, pas des lectures'],
      ['Types d’événements',fmt(typeN.length),'Catégories de fichiers réellement présentes'],
      ['Période des journaux',m.first&&m.last?dateLabel(m.first)+' — '+dateLabel(m.last):'—','Période globale de l’archive'],
      ['Journaux JSON analysés',fmt(m.files),'Types et métadonnées agrégés localement']
    ]);
    $('techTimeline').innerHTML=line(monthlyGroup(m,state.trend,yr),'événements par mois');
    $('techHours').innerHTML=bars(m.hours.map((n,h)=>[String(h).padStart(2,'0')+' h UTC',n]),24);
    $('techCategories').innerHTML=bars(keyCount(groupsN,14));
    $('techPopular').innerHTML=bars(typeN.slice(0,18),18);
    $('techTrendHint').textContent=state.trend==='all'?'Tous les types techniques':state.trend;
  }
  function eventsFor(type){return state.model.types.get(type);}
  function dataFor(type,field){return state.model.types.get(type)?.cat.get(field)||new Map();}
  const metricFor=(type,field)=>state.model.types.get(type)?.num.get(field);
  function metricLine(type,field,scale=1,mode='mean'){
    const metric=metricFor(type,field);
    if(!metric)return empty();
    const rows=timeseries(metric.byMonth,state.year).map(([m,x])=>[m,(mode==='sum'?x.sum:x.sum/Math.max(1,x.n))/scale]);
    return line(rows,niceName[field]||field,{color:'#77d8f4',digits:rows.some(x=>x[1]<10)?1:0});
  }
  const metricCards=(type,fields)=>fields.map(([field,label,fmtfn])=>{
    const d=metricFor(type,field);return [label,d?.n?fmtfn(d.latest?.[1]??d.sum/d.n):'—',d?.n?fmt(d.n)+' relevés':'Non renseigné'];
  });
  function describe(type,k,year){const m=eventsFor(type);return bars(keyCount(dataFor(type,k)),12);}
  function categoryBlock(type,keys){const o=eventsFor(type);return keys.map(k=>o?.cat.has(k)?panel(niceName[k]||k,'Répartition sur toute l’archive (pas seulement l’année filtrée).',describe(type,k)):null).filter(Boolean).join('');}
  function streaming(){const m=state.model,s=m.stream,core=eventsFor('RawCoreStream');
    const msYear=timeseries(s.monthly,state.year).reduce((acc,[,v])=>acc+v,0);const n=core?timeseries(core.byMonth,state.year).reduce((a,[,v])=>a+v,0):0;
    return `<div class="tech-area">${cards([
      ['Lectures techniques',fmt(n),'RawCoreStream : sous-ensemble des écoutes'],
      ['Durée des événements RawCoreStream',fmt(msYear/3600000,1)+' h','Ne pas additionner à l’historique musical'],
      ['Mode aléatoire',pct(s.shuffle,s.valid),'Sur tous les RawCoreStream de l’archive'],
      ['Contenus téléchargés',pct(s.downloaded,s.valid),'Sur tous les RawCoreStream de l’archive']])}
      <div class="tech-grid">${panel('Durée jouée : journal technique','Heures par mois, échantillon RawCoreStream.',line(timeseries(s.monthly,state.year).map(([m,v])=>[m,v/3600000]),'heures jouées',{color:'#9ce28f',digits:1}))}
        ${panel('Origine du démarrage','Toutes les occurrences enregistrées.',describe('RawCoreStream','message_reason_start'))}
        ${panel('Pourquoi la lecture s’arrête','Toutes les occurrences enregistrées.',describe('RawCoreStream','message_reason_end'))}
        ${panel('Morceaux non lancés','Motifs techniques, distincts des skips de l’historique.',describe('TrackNotPlayed','message_reason_not_played'))}</div></div>`;
  }
  function audio(){const m=state.model;const latest=m.settingSnapshots.slice().sort((a,b)=>a.day.localeCompare(b.day)).at(-1);
    const settings=[['message_enable_crossfade','Fondu enchaîné'],['message_enable_gapless','Sans blanc'],['message_enable_normalization','Normalisation'],['message_enable_equalizer','Égaliseur'],['message_enable_automix','AutoMix'],['message_offline_mode','Hors ligne']];
    const settingsHTML=latest?cards(settings.map(([k,label])=>[label,latest[k]===undefined?'—':latest[k]?'Activé':'Désactivé','Dernier rapport du '+dateLabel(latest.day)])):empty();
    const d=m.audioNetwork.slice().sort((a,b)=>a.day.localeCompare(b.day));
    const aggregate=new Map();for(const o of d)if(state.year==='all'||o.day.startsWith(state.year)){
      const mon=o.day.slice(0,7),a=aggregate.get(mon)||{wifi:null,cell:null};a.wifi=o.wifi??a.wifi;a.cell=o.cell??a.cell;aggregate.set(mon,a);
    }
    const wifi=[...aggregate].map(([k,v])=>[k,v.wifi]).filter(v=>v[1]!==null),cell=[...aggregate].map(([k,v])=>[k,v.cell]).filter(v=>v[1]!==null);
    return `<div class="tech-area">${settingsHTML}<div class="tech-grid">
      ${panel('Qualité des fichiers choisis','Débits enregistrés : chaque événement de sélection audio.',bars(keyCount(m.bitRates)))}
      ${panel('Évolution qualité Wi-Fi','Débit de configuration en kb/s : dernière valeur connue par mois.',line(wifi,'kb/s Wi-Fi',{color:'#7fe6b2'}))}
      ${panel('Évolution qualité mobile','Débit de configuration en kb/s : dernière valeur connue par mois.',line(cell,'kb/s données mobiles',{color:'#ffc47f'}))}
      ${panel('Chargement audio','Stratégies de sélection des fichiers.',describe('AudioFileSelection','message_strategy_name'))}
      ${panel('Origine des fichiers','Catégories déclarées par Spotify.',describe('AudioFileSelection','message_file_origin'))}
      ${panel('Codec, erreurs de lecture','Rapports d’erreur audio, lorsqu’ils existent.',describe('PlaybackError','message_audiocodec'))}</div></div>`;
  }
  function network(){const m=state.model,n=m.network;
    const sample=['message_bytes_from_cdn','message_bytes_from_cache','message_bytes_from_wifi','message_bytes_from_carrier','message_bytes_from_ap'];
    const totalNum=type=>timeseries(m.types.get(type)?.byMonth||new Map(),state.year).reduce((s,[,v])=>s+v,0);
    const points=m.cacheSnapshots.filter(x=>state.year==='all'||x.day.startsWith(state.year));
    const offline=m.offlineSnapshots.filter(x=>state.year==='all'||x.day.startsWith(state.year));
    const monthlyLast=(items,key)=>[...new Map(items.sort((a,b)=>a.day.localeCompare(b.day)).map(x=>[x.day.slice(0,7),x[key]]))].sort((a,b)=>a[0].localeCompare(b[0]));
    return `<div class="tech-area">${cards([
      ['Téléchargements instrumentés',fmt(totalNum('Download')),'Rapports Download sur la période'],
      ['Téléchargements progressifs',fmt(totalNum('ProgressiveDownload')),'Événements de téléchargement, pas fichiers uniques'],
      ['Cache CDN (rapports)',formatBytes(n.message_bytes_from_cdn||0),'Sommes des journaux, possible chevauchement'],
      ['Cache local (rapports)',formatBytes(n.message_bytes_from_cache||0),'Sommes des journaux, pas une mesure de bande passante']])}
      <div class="tech-grid">${panel('Sources de données instrumentées','Addition des compteurs Download (toute l’archive). Attention aux doublons et chevauchements.',bars(sample.map(k=>[niceName[k]||k,n[k]||0]),5,formatBytes))}
      ${panel('Téléchargements mensuels','Nombre d’événements Download, non nombre de titres distincts.',line(timeseries(m.types.get('Download')?.byMonth||new Map(),state.year),'téléchargements',{color:'#79e1d3'}))}
      ${panel('Cache relevé dans le temps','Taille cache des snapshots en Mo, dernier relevé de chaque mois.',line(monthlyLast(points,'mb'),'Mo de cache',{color:'#b7a7ff',digits:1}))}
      ${panel('Titres hors ligne','Dernier état recensé par mois, pas nombre de téléchargements du mois.',line(monthlyLast(offline,'tracks'),'titres hors ligne',{color:'#f3bb86'}))}
      ${panel('État du stockage','Valeurs signalées lors des téléchargements.',describe('Download','message_initial_disk_state'))}
      ${panel('Protocole CDN','Protocole des sessions téléchargées, quand renseigné.',describe('Download','message_cdn_protocol'))}</div></div>`;
  }
  function devices(){const m=state.model;
    const volumes=timeseries(m.volumes,state.year).map(([k,v])=>[k,v.sum/v.n]);
    const os=keyCount(m.os,12),dev=keyCount(m.devices,12);
    const current=m.types.get('AndroidDeviceReport');
    return `<div class="tech-area">${cards(metricCards('AndroidDeviceReport',[
      ['message_num_processors','Cœurs processeur',x=>fmt(x)],['message_memory','Mémoire signalée',formatBytes],
      ['message_screen_width','Largeur écran',x=>fmt(x)+' px'],['message_screen_height','Hauteur écran',x=>fmt(x)+' px']]))}
      <div class="tech-grid">${panel('Systèmes signalés','Présence dans les journaux ; ce ne sont pas des durées d’utilisation.',bars(os))}
      ${panel('Catégories d’appareils','Nombre d’événements possédant ce type d’appareil.',bars(dev))}
      ${panel('Modèles d’appareils','Modèles génériques enregistrés dans les journaux, sans numéro de série.',bars(keyCount(m.deviceModels,14)))}
      ${panel('Versions Spotify observées','Occurrences des versions de l’application. Plusieurs événements peuvent correspondre au même lancement.',bars(keyCount(m.appVersions,14)))}
      ${panel('Volume moyen signalé','Moyenne des changements enregistrés, en pourcentage du maximum.',line(volumes,'% volume',{color:'#ffb584',digits:1}))}
      ${panel('Sorties Spotify Connect','Type de périphérique audio actif ; identifiants masqués.',describe('ConnectActiveDeviceChanged','message_new_active_device_audio_output_device_type'))}
      ${panel('Routage audio','Catégories des routes sonores du lecteur.',describe('AudioRouteSegmentEnd','message_current_route_type'))}
      ${panel('Événements Connect','Changements d’appareil actif par mois.',line(timeseries(m.types.get('ConnectActiveDeviceChanged')?.byMonth||new Map(),state.year),'changements',{color:'#9de9ff'}))}
      </div></div>`;
  }
  function errors(){const m=state.model;
    const errorTypes=[...m.types].filter(([type])=>groupOf(type)==='Erreurs / stabilité');
    const cnt=errorTypes.map(([type,o])=>[type,timeseries(o.byMonth,state.year).reduce((s,[,n])=>s+n,0)]).filter(x=>x[1]);
    const monthly=new Map();for(const [type,o] of errorTypes)for(const [k,v] of o.byMonth)if(state.year==='all'||k.startsWith(state.year))inc(monthly,k,v);
    return `<div class="tech-area">${cards([
      ['Événements de diagnostic',fmt(cnt.reduce((s,[,v])=>s+v,0)),'Inclut avertissements non fatals et traces de lecture'],
      ['PlaybackError',fmt(timeseries(m.types.get('PlaybackError')?.byMonth||new Map(),state.year).reduce((s,[,n])=>s+n,0)),'Rapports de lecture, pas incidents uniques'],
      ['Stutter',fmt(timeseries(m.types.get('Stutter')?.byMonth||new Map(),state.year).reduce((s,[,n])=>s+n,0)),'Signalements de coupure audio'],
      ['RequestFailure',fmt(timeseries(m.types.get('RequestFailure')?.byMonth||new Map(),state.year).reduce((s,[,n])=>s+n,0)),'Rapports d’échec de requête']])}
      <div class="tech-grid">${panel('Évolution des alertes techniques','Compteur de journaux de catégories sélectionnées : pas un taux de panne.',line(timeseries(monthly,state.year),'signalements',{color:'#ff9d9d'}))}
      ${panel('Types d’alerte','Dénombrement par événement technique.',bars(cnt.sort((a,b)=>b[1]-a[1]),14))}
      ${panel('Motifs de requêtes en échec','Codes techniques agrégés sans URL ni contenu de requête.',describe('RequestFailure','message_error'))}
      ${panel('Motifs de lecture non lancée','Événement TrackNotPlayed ; ne pas assimiler au bouton Suivant.',describe('TrackNotPlayed','message_reason_not_played'))}</div></div>`;
  }
  function social(){const m=state.model,types=['AddedToPlaylist','AddToPlaylist','PlaylistCreated','CreatePlaylist','AddedToCollection','RemovedFromCollection','Share','SocialConnectSessionCreated','SocialConnectSessionEnded','JamNearbyBroadcastStarted','SocialListeningClientSessionCreated'];
    const rows=types.map(t=>[t,timeseries(m.types.get(t)?.byMonth||new Map(),state.year).reduce((s,[,n])=>s+n,0)]).filter(x=>x[1]).sort((a,b)=>b[1]-a[1]);
    return `<div class="tech-area">${cards([
      ['Ajouts en playlist',fmt(rows.filter(x=>x[0]==='AddedToPlaylist').reduce((s,[,v])=>s+v,0)),'Événements, sans noms de playlists'],
      ['Partages enregistrés',fmt(rows.filter(x=>x[0]==='Share').reduce((s,[,v])=>s+v,0)),'Événements Share'],
      ['Interactions Jam',fmt(rows.filter(x=>x[0].startsWith('Jam')).reduce((s,[,v])=>s+v,0)),'Événements liés à Jam'],
      ['Ajouts à la bibliothèque',fmt(rows.filter(x=>x[0]==='AddedToCollection').reduce((s,[,v])=>s+v,0)),'Événements AddedToCollection']])}
      ${panel('Activités bibliothèque et partage','Nombre d’événements, sans conservation de noms de playlists ni comptes tiers.',bars(rows,16))}
      ${panel('Évolution des activités sociales','Somme des événements observés chaque mois.',line((()=>{const x=new Map();for(const t of types)for(const [k,v] of m.types.get(t)?.byMonth||[])if(state.year==='all'||k.startsWith(state.year))inc(x,k,v);return timeseries(x,state.year)})(),'événements sociaux',{color:'#ffbada'}))}</div>`;
  }
  function explorer(){const m=state.model,type=state.type,o=eventsFor(type);if(!o)return;
    const total=timeseries(o.byMonth,state.year).reduce((s,[,n])=>s+n,0);
    const cats=[...o.cat].filter(([,dist])=>dist.size>0).sort((a,b)=>b[1].size-a[1].size).slice(0,8);
    const nums=[...o.num].filter(([,v])=>v.n>0).sort((a,b)=>b[1].n-a[1].n).slice(0,8);
    const allFields=[...o.fields].sort((a,b)=>b[1]-a[1]);
    $('techTypeSummary').innerHTML=cards([
      ['Événements filtrés',fmt(total),'Sur la période choisie'],['Événements dans l’archive',fmt(o.count),'Toutes dates'],
      ['Champs disponibles',fmt(o.fields.size),'Noms des propriétés observées'],
      ['Variables exploitables',fmt(cats.length+nums.length),'Distributions protégées et agrégées']]);
    $('techTypeChart').innerHTML=line(timeseries(o.byMonth,state.year),'événements par mois',{color:'#9eafff'});
    $('techFields').innerHTML=allFields.length?`<div class="tech-field-grid">${allFields.map(([k,n])=>`<div class="tech-field"><code>${esc(k)}</code><span>${esc(pct(n,o.count))} renseigné</span></div>`).join('')}</div>`:empty();
    $('techDetails').innerHTML=(cats.length?cats.map(([k,dist])=>panel(niceName[k]||k,'Valeurs autorisées, répartition sur l’archive complète.',bars(keyCount(dist,12)))).join(''):'')+
      (nums.length?nums.map(([k,d])=>panel(niceName[k]||k,`Mesure brute : ${fmt(d.n)} relevés, moyenne ${fmt(d.sum/d.n,1)}, min ${fmt(d.min,1)}, max ${fmt(d.max,1)}.`,metricLine(type,k))).join(''):'') || empty('Ce type ne comporte pas de valeurs catégorielles/numeriques autorisées à afficher. Les champs et la chronologie restent consultables.');
    $('techPrivacy').textContent=`${fmt(o.fields.size)} champs de l'événement, dont seuls les types explicitement autorisés peuvent être agrégés. Aucune valeur libre (identifiant, URL, token, adresse réseau ou compte tiers) n'est conservée.`;
  }
  function render(){if(!state.model)return;trend();
    $('techStreamContent').innerHTML=streaming();$('techAudioContent').innerHTML=audio();$('techNetworkContent').innerHTML=network();
    $('techDeviceContent').innerHTML=devices();$('techErrorContent').innerHTML=errors();$('techSocialContent').innerHTML=social();explorer();
  }
  function exportAggregates(){if(!state.model)return;
    const csv=[['type','categorie','mois','nombre_evenements']];
    for(const [type,o] of state.model.types){for(const [month,v] of o.byMonth)if(state.year==='all'||month.startsWith(state.year))csv.push([type,groupOf(type),month,v]);}
    const content='\uFEFF'+csv.map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(';')).join('\r\n');
    const blob=new Blob([content],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='spotify-technique-mensuel.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function progress(s,p){const element=$('techProgress');element.textContent=s;$('techProgressBar').style.width=p+'%';}
  async function importArchive(file){
    if(state.busy)throw new Error('Une analyse technique est déjà en cours.');
    if(!file||!file.name.toLowerCase().endsWith('.zip'))throw new Error('Sélectionne une archive ZIP Spotify.');
    if(!window.JSZip)throw new Error('Le décompresseur ZIP local est introuvable.');
    state.busy=true;let model=newModel();progress('Ouverture de l’archive technique…',3);
    try{
      const zip=await JSZip.loadAsync(file);
      const files=Object.values(zip.files).filter(x=>!x.dir&&/\.json$/i.test(x.name)&&!/(?:^|\/)(?:Streaming_History_Audio|Streaming_History_Video|StreamingHistory)/i.test(x.name));
      const selected=files.filter(x=>/Spotify Technical Log Information\//i.test(x.name));
      const candidates=selected.length?selected:files;
      const size=candidates.reduce((s,x)=>s+(x._data?.uncompressedSize||0),0);
      if(size>350*1024*1024)throw new Error('Archive trop grande (plus de 350 Mo de JSON décompressés).');
      if(!candidates.length)throw new Error('Aucun journal technique JSON détecté.');
      const done={files:0};
      for(const entry of candidates){
        if((entry._data?.uncompressedSize||0)>80*1024*1024){model.parseWarnings.push(entry.name.split('/').at(-1)+' : fichier trop grand');continue;}
        const type=entry.name.split('/').at(-1).replace(/\.json$/i,'');
        progress(`Analyse des journaux : ${done.files+1}/${candidates.length} — ${type}`,Math.round((done.files/candidates.length)*90+5));
        const s=await entry.async('string');let entries;
        try{entries=JSON.parse(s.replace(/^\uFEFF/,''));}catch(_){model.parseWarnings.push(type+' : JSON invalide');done.files++;continue;}
        if(!Array.isArray(entries)){done.files++;continue;}
        if(!entries.length){done.files++;continue;}
        // A technical export is identified by timestamps, context fields and message_ fields.
        if(!entries.some(row=>row&&typeof row==='object'&&('timestamp_utc' in row)&&Object.keys(row).some(k=>k.startsWith('message_')))){
          done.files++;continue;
        }
        for(const r of entries)process(model,type,r);
        model.files++;done.files++;
        // Yield between files to keep the import UI responsive.
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      if(!model.total||!model.files)throw new Error('Ce ZIP ne contient pas de journaux techniques Spotify exploitables. Charge l’archive « Spotify Technical Log Information ».');
      model.audioNetwork.sort((a,b)=>a.day.localeCompare(b.day));
      state.model=model;selectors(model);render();
      $('techDashboard').hidden=false;
      progress(`${fmt(model.total)} événements analysés dans ${fmt(model.files)} fichiers, exclusivement sur cet appareil.`,100);
      return true;
    }catch(e){progress('Erreur technique : '+(e?.message||'inconnue'),0);throw e;}
    finally{state.busy=false;}
  }
  $('techYear').addEventListener('change',e=>{state.year=e.target.value;render();});
  $('techTrend').addEventListener('change',e=>{state.trend=e.target.value;render();});
  $('techEventType').addEventListener('change',e=>{state.type=e.target.value;explorer();});
  $('techCsvBtn').addEventListener('click',exportAggregates);
  window.TechStudio={importArchive,getModel:()=>state.model};
})();
