/* Listening Atlas — account archive / privacy-first offline dashboard.
   No API, network, browser storage or raw-file upload. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const fmt=(n,places=0)=>Number(n||0).toLocaleString('fr-FR',{maximumFractionDigits:places});
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  const date=s=>String(s||'').slice(0,10);
  const month=s=>/^\d{4}-\d{2}/.test(String(s))?String(s).slice(0,7):'';
  const valid=(val,max=200)=>String(val??'').slice(0,max);
  const playlistFiles=/^Playlist\d+\.json$/i;
  const supported=new Set(['YourLibrary.json','Wrapped2025.json','YourSoundCapsule.json','SearchQueries.json','StreamingHistory_music_0.json','StreamingHistory_podcast_0.json','Inferences.json','Marquee.json','UserAttributes.json','Identity.json','Identifiers.json','Payments.json','Follow.json','MessageData.json','AdsIdentitySecondPartyIdentifiers.json','S4XProfile.json','UserPrompts.json','DuoNewFamily.json','PodcastInteractivityComments.json']);
  const state={model:null,year:'all',playlistFilter:'',libraryFilter:'',libraryType:'tracks',playlistIndex:0,capsuleIndex:0,privateOpen:false};
  const sum=(arr,fn)=>arr.reduce((t,x)=>t+n(fn(x)),0);
  function chart(target,entries,opts={}) {
    const node=$(target);if(!node)return;
    const items=[...entries].filter(([key])=>key).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
    if(!items.length){node.innerHTML='<p class="account-empty">Aucune série temporelle disponible.</p>';return;}
    const W=960,H=264,l=68,r=18,t=20,b=43,ph=H-t-b,pw=W-l-r,max=Math.max(1,...items.map(x=>n(x[1])));
    const xAt=i=>l+(items.length<2?pw/2:i*pw/(items.length-1));
    const yAt=v=>t+ph-n(v)/max*ph;
    const color=opts.color||'#c8ff77';
    let svg='';
    for(let j=0;j<=4;j++){
      const y=t+ph*(1-j/4);
      svg+=`<line x1="${l}" x2="${W-r}" y1="${y}" y2="${y}" stroke="#43615d" stroke-opacity=".45" stroke-dasharray="${j?'4 7':'0'}"/>`;
      svg+=`<text x="${l-10}" y="${y+4}" text-anchor="end" font-size="12" fill="#aac2b8">${esc(fmt(max*j/4,max<12?1:0))}</text>`;
    }
    if(items.length===1){svg+=`<circle cx="${xAt(0)}" cy="${yAt(items[0][1])}" r="5" fill="${color}"/>`;} else {
      const p=items.map(([key,v],i)=>`${i?'L':'M'}${xAt(i).toFixed(2)} ${yAt(v).toFixed(2)}`).join(' ');
      svg+=`<path d="${p}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
      items.forEach(([k,v],i)=>svg+=`<circle cx="${xAt(i)}" cy="${yAt(v)}" r="3" fill="${color}"><title>${esc(k)} : ${esc(fmt(v,1))}</title></circle>`);
    }
    const skip=Math.max(1,Math.ceil(items.length/10));
    items.forEach(([k],i)=>{if(i%skip!==0&&i!==items.length-1)return;const text=String(k).replace(/^\d{4}-(\d{2})$/,'$1');svg+=`<text x="${xAt(i)}" y="${H-12}" text-anchor="middle" fill="#9db7ab" font-size="11">${esc(text)}</text>`;});
    node.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label||'Évolution chronologique')}" preserveAspectRatio="xMidYMid meet">${svg}</svg>`;
  }
  function cols(target,counts,max=15){
    const rows=[...counts].sort((a,b)=>n(b[1])-n(a[1])).slice(0,max);
    const root=$(target);
    if(!rows.length){root.innerHTML='<p class="account-empty">Aucune donnée.</p>';return;}
    const highest=Math.max(1,rows[0][1]);
    root.innerHTML=rows.map(([key,v])=>`<div class="account-bar-row"><span title="${esc(key)}">${esc(key)}</span><div class="account-bar-bg"><span style="width:${(n(v)/highest*100).toFixed(2)}%"></span></div><strong>${fmt(v)}</strong></div>`).join('');
  }
  const counter=(arr,key)=>{const m=new Map();for(const e of arr){const k=key(e);if(k)m.set(k,(m.get(k)||0)+1);}return m;};
  const yearFilter=ds=>state.year==='all'||String(ds).startsWith(state.year);
  const pill=(label,value)=>`<div class="account-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  const labelTrack=t=>[t?.trackName||t?.track||t?.name,t?.artistName||t?.artist].filter(Boolean).join(' — ');
  const duration=v=>fmt(n(v)/60000,0)+' min';
  const infoCard=(heading,body)=>`<article class="account-detail"><h4>${esc(heading)}</h4><div>${body}</div></article>`;
  function renderOverview(){
    const m=state.model,tracks=(m.library.tracks||[]),ps=m.playlists;
    $('accountStats').innerHTML=[
      ['Playlists',fmt(ps.length)],['Titres en playlists',fmt(sum(ps,p=>(p.items||[]).length))],
      ['Titres sauvegardés',fmt(tracks.length)],['Albums sauvegardés',fmt(m.library.albums?.length)],
      ['Artistes sauvegardés',fmt(m.library.artists?.length)],['Bilans Sound Capsule',fmt(m.capsule.stats?.length)],
      ['Recherches enregistrées',fmt(m.searches.length)],['Genres signalés par Wrapped',m.wrapped?.topGenres?.totalNumGenres===undefined?'—':fmt(m.wrapped.topGenres.totalNumGenres)]
    ].map(([a,b])=>pill(a,b)).join('');
    const years=new Set();for(const p of ps)for(const h of p.history||[]){const y=date(h.timestamp).slice(0,4);if(/^\d{4}$/.test(y))years.add(y);}
    for(const s of m.capsule.stats||[]){const y=date(s.date).slice(0,4);if(/^\d{4}$/.test(y))years.add(y);}
    const opt=['<option value="all">Toutes les années</option>',...[...years].sort().map(y=>`<option value="${y}">${y}</option>`)].join('');
    $('accountYear').innerHTML=opt;$('accountYear').value=state.year;if($('accountYear').value!==state.year){state.year='all';$('accountYear').value='all';}
    $('accountFiles').textContent=`${fmt(m.files)} fichiers JSON reconnus · données du compte uniquement · aucune fusion automatique des écoutes.`;
  }
  function renderPlaylists(){
    const m=state.model;
    const filtered=m.playlists.filter(p=>yearFilter(p.lastModifiedDate)||(p.history||[]).some(h=>yearFilter(h.timestamp)));
    const byMonth=new Map(),byOp=new Map(),bySize=new Map();let events=0;
    for(const p of filtered){
      const size=(p.items||[]).length,band=size===0?'0':size<=10?'1–10':size<=50?'11–50':size<=100?'51–100':'101+';
      bySize.set(band,(bySize.get(band)||0)+1);
      for(const h of p.history||[]){if(!yearFilter(h.timestamp))continue;events++;
        const key=month(h.timestamp);if(key)byMonth.set(key,(byMonth.get(key)||0)+1);
        for(const op of h.operations||[]){const k=valid(op.kind||'Non précisé',80);byOp.set(k,(byOp.get(k)||0)+1);}
      }
    }
    $('accountPlaylistInfo').textContent=`${fmt(filtered.length)} playlists · ${fmt(events)} entrées d'historique (ce ne sont pas forcément des ajouts de titres).`;
    chart('accountPlaylistChart',byMonth,{label:'Modifications mensuelles des playlists'});
    cols('accountPlaylistOperations',byOp,10);
    cols('accountPlaylistSizes',bySize,10);
    const opt=m.playlists.map((p,i)=>({i,p})).filter(({p})=>p.name.toLowerCase().includes(state.playlistFilter.toLowerCase()));
    $('accountPlaylistSearchCount').textContent=`${fmt(opt.length)} playlists correspondent à la recherche`;
    $('accountPlaylistSelect').innerHTML=opt.map(({i,p})=>`<option value="${i}">${esc(valid(p.name,85))} (${fmt(p.items?.length)} titres)</option>`).join('')||'<option value="">Aucune playlist</option>';
    if(!opt.some(({i})=>i===state.playlistIndex))state.playlistIndex=opt[0]?.i??0;
    $('accountPlaylistSelect').value=String(state.playlistIndex);
    renderPlaylistDetail();
  }
  function renderPlaylistDetail(){
    const p=state.model.playlists[state.playlistIndex];
    if(!p){$('accountPlaylistDetail').innerHTML='Aucune playlist';return;}
    const songs=(p.items||[]),hist=p.history||[];
    const list=songs.slice(0,50).map((s,i)=>`<li><b>${i+1}.</b> ${esc(valid(labelTrack(s.track||{}),170))}<small>${esc(date(s.addedDate))}</small></li>`).join('');
    $('accountPlaylistDetail').innerHTML=`<div class="account-playlist-meta">${pill('Titres présents',fmt(songs.length))}${pill('Historique',fmt(hist.length))}${pill('Dernière modification',valid(p.lastModifiedDate||'—',20))}${pill('Abonnés indiqués',fmt(p.numberOfFollowers))}</div><div class="account-scroll"><ol class="account-song-list">${list||'<li>Playlist vide</li>'}</ol></div>${songs.length>50?`<p class="account-note">Aperçu des 50 premiers titres sur ${fmt(songs.length)}.</p>`:''}`;
  }
  function renderLibrary(){
    const m=state.model,lib=m.library||{},types=['tracks','albums','artists','shows','episodes'];
    $('accountLibraryType').innerHTML=types.map(k=>`<option value="${k}">${({tracks:'Morceaux',albums:'Albums',artists:'Artistes',shows:'Podcasts',episodes:'Épisodes'})[k]} (${fmt(lib[k]?.length)})</option>`).join('');
    $('accountLibraryType').value=state.libraryType;
    const rows=(lib[state.libraryType]||[]).map((item,i)=>({item,i,label:state.libraryType==='tracks'?labelTrack(item):state.libraryType==='albums'?[item.album,item.artist].filter(Boolean).join(' — '):item.name||item.track||item.album||item.show||'Élément sans nom'}))
      .filter(o=>o.label.toLowerCase().includes(state.libraryFilter.toLowerCase()));
    $('accountLibraryCount').textContent=`${fmt(rows.length)} résultat(s)`;
    $('accountLibraryResults').innerHTML=rows.slice(0,90).map((o,i)=>`<div class="account-library-row"><span>${fmt(i+1)}</span><strong title="${esc(o.label)}">${esc(valid(o.label,260))}</strong></div>`).join('')||'<p class="account-empty">Aucun résultat.</p>';
    $('accountLibraryMore').textContent=rows.length>90?`${fmt(rows.length-90)} autres résultats : affine la recherche.`:'';
    const artCounts=new Map();for(const t of lib.tracks||[]){const art=valid(t.artist||'',150);if(art)artCounts.set(art,(artCounts.get(art)||0)+1);}
    cols('accountLibraryArtists',artCounts,14);
    const cross=$('accountCross');
    const music=window.MusicStudio?.getModel?.();
    if(!music){cross.innerHTML='<p class="account-note">Importe aussi l’historique d’écoute pour comparer les titres sauvegardés avec les titres réellement présents dans cet historique.</p>';return;}
    const listened=new Set(music.tracks.map(t=>t.uri).filter(s=>/^spotify:track:[A-Za-z0-9]{22}$/.test(s||'')));
    const saved=(lib.tracks||[]).filter(t=>/^spotify:track:[A-Za-z0-9]{22}$/.test(t.uri||''));
    const common=saved.filter(t=>listened.has(t.uri)).length;
    cross.innerHTML=`<div class="account-metric-grid">${pill('Titres sauvegardés avec URI',fmt(saved.length))}${pill('URIs présentes dans l’historique',fmt(common))}${pill('Sans correspondance URI',fmt(saved.length-common))}${pill('Part correspondante',saved.length?fmt(common/saved.length*100,1)+' %':'—')}</div><p class="account-note">Correspondance stricte par identifiant Spotify. Un titre sans correspondance n'est pas nécessairement jamais écouté : les exports peuvent utiliser d'autres versions ou être incomplets.</p>`;
  }
  function renderWrapped(){
    const w=state.model.wrapped,root=$('accountWrapped');
    if(!w){root.innerHTML='<p class="account-empty">Pas de Wrapped dans l’archive.</p>';return;}
    const party=w.party||{},top=w.topTracks?.topTracks||[];
    const attr=[['Minutes Wrapped',fmt(party.totalNumListeningMinutes??n(w.yearlyMetrics?.totalMsListened)/60000)],['Jours d’écoute',fmt(party.totalNumListeningDays)],['Genres distincts',fmt(w.topGenres?.totalNumGenres)],['Artistes distincts',fmt(w.topArtists?.numUniqueArtists)],['Morceaux distincts',fmt(w.topTracks?.numUniqueTracks)],['BPM moyen pondéré',fmt(party.weightedMsAvgTempo,1)],['Âge musical Spotify',fmt(w.listeningAge?.listeningAge)+' ans'],['Artistes découverts',fmt(party.numArtistsDiscovered)],['Série de jours',fmt(party.streakNumListeningDays)],['Part nocturne',fmt(party.percentListenedNight,1)+' %'],['Morceaux explicites',fmt(party.percentListenedExplicit,1)+' %'],['Part du top artiste',fmt(party.percentListenedTopArtist,1)+' %']];
    $('accountWrappedMetrics').innerHTML=attr.map(([a,b])=>pill(a,b)).join('');
    const lib=state.model.library;
    const trackName=new Map((lib.tracks||[]).map(t=>[t.uri,labelTrack(t)]));
    const artistName=new Map((lib.artists||[]).map(a=>[a.uri,a.name]));
    const albumName=new Map((lib.albums||[]).map(a=>[a.uri,a.album+' — '+a.artist]));
    const topTracks=top.map((t,i)=>`<div class="account-library-row"><span>${i+1}</span><strong>${esc(trackName.get(t.trackUri)||'Morceau (identifiant non résolu)')}</strong><small>${fmt(t.count)} écoutes · ${duration(t.msPlayed)}</small></div>`).join('');
    const artists=(w.topArtists?.topArtistUris||[]).map((id,i)=>`<div class="account-library-row"><span>${i+1}</span><strong>${esc(artistName.get(id)||'Artiste (identifiant non résolu)')}</strong></div>`).join('');
    const albums=(w.topAlbums?.topAlbums||[]).map((id,i)=>`<div class="account-library-row"><span>${i+1}</span><strong>${esc(albumName.get(id)||'Album (identifiant non résolu)')}</strong></div>`).join('');
    const genres=(w.topGenres?.topGenres||[]).map((id,i)=>`<div class="account-library-row"><span>${i+1}</span><strong>Genre Spotify ${i+1}</strong><small>Nom absent · ${esc(valid(id,55))}</small></div>`).join('');
    root.innerHTML=`<div class="account-grid"><article class="account-detail"><h4>Top morceaux 2025</h4>${topTracks||'—'}</article><article class="account-detail"><h4>Top artistes 2025</h4>${artists||'—'}</article><article class="account-detail"><h4>Top albums 2025</h4>${albums||'—'}</article><article class="account-detail"><h4>Top genres 2025</h4>${genres||'—'}<p class="account-note">L’archive fournit les URI des concepts de genres, pas leurs noms. Aucune catégorie musicale n’est inventée.</p></article></div>`;
    const race=(w.topArtistRace?.topArtists||[]).slice(0,5);
    const months=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
    const short=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
    const present=months.filter(m=>race.some(a=>(a.monthsStats||[]).some(x=>x.month===m)));
    if(!present.length){$('accountWrappedArtistRace').innerHTML='<p class="account-empty">Pas de course mensuelle dans cet export.</p>';}else{
      const W=900,H=290,L=68,R=20,T=27,B=240,innerW=W-L-R;
      const xAt=i=>L+innerW*i/Math.max(1,present.length-1),yAt=r=>T+(Math.max(1,r)-1)/4*(B-T);
      const palette=['#c8ff77','#6acde4','#ffb87f','#d8a4f9','#ff8db3'];
      let svg='';for(let rank=1;rank<=5;rank++){
        const y=yAt(rank);
        svg+=`<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" stroke="#405952" stroke-dasharray="4 7" stroke-opacity=".6"/><text x="${L-16}" y="${y+4}" text-anchor="end" fill="#adc4bd" font-size="12">#${rank}</text>`;
      }
      present.forEach((m,i)=>svg+=`<text x="${xAt(i)}" y="${H-18}" font-size="11" text-anchor="middle" fill="#abc6bc">${short[months.indexOf(m)]}</text>`);
      let legend='';
      race.forEach((a,i)=>{
        const color=palette[i%palette.length],records=new Map((a.monthsStats||[]).map(rec=>[rec.month,rec]));
        const artist=artistName.get(a.artistUri)||`Artiste ${i+1} (URI non résolue)`;
        let path='';let last=null;
        for(const [j,m] of present.entries()){
          const rec=records.get(m);if(!rec||!Number.isFinite(Number(rec.rank)))continue;
          path+=(last===null?'M':'L')+xAt(j).toFixed(2)+','+yAt(Number(rec.rank)).toFixed(2)+' ';
          last=j;
          svg+=`<circle cx="${xAt(j)}" cy="${yAt(Number(rec.rank))}" r="3.5" fill="${color}"><title>${esc(artist)} · ${short[months.indexOf(m)]} : rang ${Number(rec.rank)} · trailSize ${esc(valid(rec.trailSize,20))}</title></circle>`;
        }
        svg+=`<path d="${path.trim()}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
        legend+=`<span class="account-race-key"><i style="background:${color}"></i>${esc(artist)}</span>`;
      });
      $('accountWrappedArtistRace').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution mensuelle des rangs des cinq premiers artistes du Wrapped 2025">${svg}</svg><div class="account-race-legend">${legend}</div>`;
    }
    $('accountWrappedRaceNote').textContent=race.length?'Classement mensuel officiel Wrapped : le rang 1 est le meilleur. La taille de traîne (trailSize) est qualitative et apparaît au survol des points. Ce graphique ne représente pas des minutes.':'';
  }
  function renderCapsule(){
    const m=state.model,stats=m.capsule.stats||[],high=m.capsule.highlights||[];
    const list=stats.filter(x=>yearFilter(x.date)).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    chart('accountCapsuleTime',list.map(x=>[x.date,n(x.secondsPlayed)/60]),{label:'Minutes des bilans Sound Capsule',color:'#f6c88b'});
    chart('accountCapsuleStreams',list.map(x=>[x.date,n(x.streamCount)]),{label:'Nombre de lectures Sound Capsule',color:'#72d9df'});
    const types=counter(high.filter(x=>yearFilter(x.date)),x=>x.highlightType);
    cols('accountCapsuleHighlights',types,14);
    $('accountCapsuleSelect').innerHTML=stats.map((s,i)=>`<option value="${i}">${esc(s.date)} · ${fmt(s.streamCount)} lectures</option>`).join('')||'<option>Pas de bilan</option>';
    state.capsuleIndex=Math.min(state.capsuleIndex,Math.max(0,stats.length-1));$('accountCapsuleSelect').value=String(state.capsuleIndex);
    renderCapsuleDetails();
  }
  function renderCapsuleDetails(){
    const s=state.model.capsule.stats?.[state.capsuleIndex],node=$('accountCapsuleDetails');
    if(!s){node.innerHTML='<p>Aucun bilan.</p>';return;}
    const songs=(s.topTracks||[]).slice(0,12).map((t,i)=>`<div class="account-library-row"><span>${i+1}</span><strong>${esc(valid(t.name,160))}</strong><small>${fmt(t.streamCount)} écoutes · ${duration(n(t.secondsPlayed)*1000)}</small></div>`).join('');
    const arts=(s.topArtists||[]).slice(0,12).map((t,i)=>`<div class="account-library-row"><span>${i+1}</span><strong>${esc(valid(t.name,160))}</strong><small>${fmt(t.streamCount)} écoutes · ${duration(n(t.secondsPlayed)*1000)}</small></div>`).join('');
    const gen=(s.topGenres||[]).slice(0,15).map((x,i)=>`<div class="account-library-row"><span>${i+1}</span><strong>${esc(valid(typeof x==='string'?x:x.name||x.genre,140))}</strong></div>`).join('')||'<p class="account-note">Ce bilan ne renseigne pas de noms de genres.</p>';
    node.innerHTML=`<div class="account-metric-grid">${pill('Date du bilan',valid(s.date,12))}${pill('Nombre de lectures',fmt(s.streamCount))}${pill('Durée',fmt(n(s.secondsPlayed)/3600,1)+' h')}</div><div class="account-grid">${infoCard('Morceaux mis en avant',songs)}${infoCard('Artistes mis en avant',arts)}${infoCard('Genres de ce bilan',gen)}</div><p class="account-note">Les périodes et définitions de Sound Capsule viennent de Spotify et peuvent différer de la somme de ton historique étendu.</p>`;
  }
  function renderAccountStreaming(){
    const m=state.model,streams=m.streaming,found=streams.music||[],pod=streams.podcast||[];
    const filtered=found.filter(x=>yearFilter(x.endTime));const byMonth=new Map();let total=0;
    for(const e of filtered){const k=month(e.endTime);if(!k)continue;byMonth.set(k,(byMonth.get(k)||0)+1);total+=n(e.msPlayed);}
    $('accountStreamingSummary').innerHTML=[pill('Événements musicaux',fmt(found.length)),pill('Dans la période filtrée',fmt(filtered.length)),pill('Minutes de la période',fmt(total/60000)),pill('Épisodes de podcast',fmt(pod.length))].join('');
    chart('accountStreamingChart',byMonth,{label:'Événements musicaux du fichier de compte',color:'#d1b2fc'});
    $('accountStreamingNotice').textContent='Ces événements peuvent recouper ceux de la première archive : ils ne sont pas ajoutés aux compteurs d’écoute, afin d’éviter les doublons. Sans identifiant de morceau ni horodatage à la seconde, une fusion exacte n’est pas garantie.';
  }
  function renderOther(){
    const m=state.model;
    $('accountOtherStats').innerHTML=[pill('Segments Marquee',fmt(m.marquee.length)),pill('Catégories publicitaires inférées',fmt(m.inferences.length)),pill('Recherches',fmt(m.searches.length)),pill('Salons de messagerie',fmt(Object.keys(m.messages).length)),pill('Abonnements / comptes suivis',fmt(m.follow.userIsFollowing?.length)),pill('Comptes abonnés',fmt(m.follow.userIsFollowedBy?.length))].join('');
    cols('accountMarquee',counter(m.marquee,x=>valid(x.segment,80)),10);
    const q=counter(m.searches.filter(x=>yearFilter(x.searchTime)),x=>month(x.searchTime));chart('accountSearchTrend',q,{label:'Nombre de recherches Spotify enregistrées'});
    cols('accountSearchPlatforms',counter(m.searches,x=>x.platform||'Non renseignée'),10);
  }
  function safePrivateField(v){return typeof v==='string'||typeof v==='number'||typeof v==='boolean'?valid(v,400):'Non renseigné';}
  function sensitiveHtml(){
    const m=state.model;const user=m.userAttributes||{},identity=m.identity||{},payment=m.payments||[];
    const labels={'username':'Identifiant de compte','email':'Adresse e-mail','country':'Pays','birthdate':'Date de naissance','gender':'Genre déclaré','creationTime':'Création du compte','displayName':'Nom d’affichage','firstName':'Prénom','lastName':'Nom','postalCode':'Code postal','mobileNumber':'Numéro mobile'};
    const rows=Object.entries(labels).map(([k,label])=>{
      const v=k in user?user[k]:identity[k];if(v===null||v===undefined||v==='')return'';
      return `<div class="account-private-field"><span>${esc(label)}</span><strong>${esc(safePrivateField(v))}</strong></div>`;
    }).join('');
    const pay=payment.map(p=>`<div class="account-private-field"><span>Paiement (${esc(valid(p.creation_date,18))})</span><strong>${esc(valid(p.payment_method,75))} · ${esc(valid(p.country,20))}</strong></div>`).join('');
    const q=m.searches.slice().sort((a,b)=>String(b.searchTime).localeCompare(String(a.searchTime)));
    const searches=q.map(x=>`<li><span>${esc(valid(x.searchTime,25))} · ${esc(valid(x.platform,30))}</span><strong>${esc(valid(x.searchQuery,260))}</strong></li>`).join('');
    const inferences=m.inferences.map(s=>`<li>${esc(valid(s,220))}</li>`).join('');
    const rooms=Object.values(m.messages).map(room=>{
      const messages=(room?.messages||[]);
      return `<details class="account-private-room"><summary>${esc(valid(room.group_name||'Conversation Spotify',110))} · ${fmt(messages.length)} messages</summary><ol>${messages.map(x=>`<li><span>${esc(valid(x.time,30))} · ${esc(valid(x.from,90))}</span><strong>${esc(valid(x.message,1500))}</strong></li>`).join('')||'<li>Pas de message</li>'}</ol></details>`;
    }).join('');
    return `<div class="account-grid"><article class="account-detail"><h4>Profil et compte</h4>${rows||'<p>Non renseigné</p>'}${pay}<p class="account-note">Les identifiants publicitaires et jetons techniques ne sont jamais affichés.</p></article><article class="account-detail"><h4>Recherches Spotify · ${fmt(q.length)}</h4><div class="account-private-scroll"><ol class="account-private-list">${searches||'<li>Aucune recherche.</li>'}</ol></div></article><article class="account-detail"><h4>Catégories publicitaires · ${fmt(m.inferences.length)}</h4><div class="account-private-scroll"><ol class="account-tags">${inferences||'<li>Aucune catégorie.</li>'}</ol></div></article><article class="account-detail"><h4>Messages et conversations · ${fmt(Object.keys(m.messages).length)}</h4><p class="account-note">Peut contenir des messages de tiers, affichés ici uniquement après ton action explicite.</p><div class="account-private-scroll">${rooms||'<p>Aucune conversation.</p>'}</div></article></div>`;
  }
  function setPrivate(open){
    state.privateOpen=!!open&&!!state.model;
    const root=$('accountPrivateContent'),button=$('accountPrivateToggle'),preview=$('accountPrivateCurtain');
    if(state.privateOpen){root.innerHTML=sensitiveHtml();root.hidden=false;preview.hidden=true;button.textContent='◉ Recensurer les informations';button.setAttribute('aria-expanded','true');}
    else {root.replaceChildren();root.hidden=true;preview.hidden=false;button.textContent='◉ Révéler mes informations';button.setAttribute('aria-expanded','false');}
  }
  function renderAll(){
    if(!state.model)return;
    renderOverview();renderPlaylists();renderLibrary();renderWrapped();renderCapsule();renderAccountStreaming();renderOther();setPrivate(false);
  }
  async function importArchive(file){
    if(!file || !/\.zip$/i.test(file.name))throw new Error('Choisis un ZIP de données de compte Spotify.');
    if(!window.JSZip)throw new Error('Bibliothèque JSZip absente.');
    $('accountProgress').textContent='Ouverture des données du compte…';
    const zip=await window.JSZip.loadAsync(file);
    const entries=Object.values(zip.files).filter(x=>!x.dir&&/\.json$/i.test(x.name));
    const recognized=entries.filter(x=>playlistFiles.test(x.name.split('/').pop())||supported.has(x.name.split('/').pop()));
    const totalSize=recognized.reduce((t,x)=>t+n(x._data?.uncompressedSize),0);
    if(totalSize>200*1024*1024)throw new Error('Données du compte trop volumineuses (limite : 200 Mo de JSON).');
    if(!recognized.some(x=>/\/|^Playlist/i.test(x.name) && (x.name.includes('Spotify Account Data')||x.name.includes('Playlist'))))throw new Error('Archive de compte Spotify non reconnue.');
    const d={};let loaded=0,malformed=0;
    for(const entry of recognized){
      if(n(entry._data?.uncompressedSize)>80*1024*1024)throw new Error('Fichier JSON trop volumineux.');
      const filename=entry.name.split('/').pop();
      try {d[filename]=JSON.parse((await entry.async('string')).replace(/^\uFEFF/,''));loaded++;}
      catch(err){malformed++;}
      $('accountProgress').textContent=`Lecture des données du compte : ${fmt(loaded+malformed)} / ${fmt(recognized.length)}…`;
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    const playlistSources=Object.keys(d).filter(k=>playlistFiles.test(k)).sort((a,b)=>n(a.match(/\d+/)?.[0])-n(b.match(/\d+/)?.[0]));
    const playlists=playlistSources.flatMap(k=>Array.isArray(d[k]?.playlists)?d[k].playlists:[]);
    const library=d['YourLibrary.json']||{},wrapped=d['Wrapped2025.json']||null,capsule=d['YourSoundCapsule.json']||{};
    if(!loaded || (!playlists.length&&!Array.isArray(library.tracks)&&!wrapped&&!Array.isArray(capsule.stats)))throw new Error('Aucun ensemble de données de compte exploitable. Sélectionne le ZIP « Spotify Account Data ».');
    state.model={
      files:loaded,skippedFiles:malformed,playlists,library,wrapped,
      capsule:{stats:Array.isArray(capsule.stats)?capsule.stats:[],highlights:Array.isArray(capsule.highlights)?capsule.highlights:[]},
      streaming:{music:Array.isArray(d['StreamingHistory_music_0.json'])?d['StreamingHistory_music_0.json']:[],podcast:Array.isArray(d['StreamingHistory_podcast_0.json'])?d['StreamingHistory_podcast_0.json']:[]},
      searches:Array.isArray(d['SearchQueries.json'])?d['SearchQueries.json']:[],
      marquee:Array.isArray(d['Marquee.json'])?d['Marquee.json']:[],
      inferences:Array.isArray(d['Inferences.json']?.inferences)?d['Inferences.json'].inferences:[],
      messages:d['MessageData.json']||{},userAttributes:d['UserAttributes.json']||{},identity:d['Identity.json']||{},
      payments:Array.isArray(d['Payments.json'])?d['Payments.json']:[],follow:d['Follow.json']||{}
    };
    state.year='all';state.playlistFilter='';state.libraryFilter='';state.libraryType='tracks';state.playlistIndex=0;state.capsuleIndex=0;
    $('accountPlaylistQuery').value='';$('accountLibraryQuery').value='';
    renderAll();$('accountDashboard').hidden=false;
    $('accountProgress').textContent=`${fmt(loaded)} fichiers JSON analysés${malformed?' · '+fmt(malformed)+' fichiers non lus':''}. Informations privées masquées.`;
    return true;
  }
  $('accountYear').addEventListener('change',e=>{state.year=e.target.value;renderPlaylists();renderCapsule();renderAccountStreaming();renderOther();});
  $('accountPlaylistQuery').addEventListener('input',e=>{state.playlistFilter=e.target.value;renderPlaylists();});
  $('accountPlaylistSelect').addEventListener('change',e=>{state.playlistIndex=Number(e.target.value)||0;renderPlaylistDetail();});
  $('accountLibraryType').addEventListener('change',e=>{state.libraryType=e.target.value;renderLibrary();});
  $('accountLibraryQuery').addEventListener('input',e=>{state.libraryFilter=e.target.value;renderLibrary();});
  $('accountCapsuleSelect').addEventListener('change',e=>{state.capsuleIndex=Number(e.target.value)||0;renderCapsuleDetails();});
  $('accountPrivateToggle').addEventListener('click',()=>setPrivate(!state.privateOpen));
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.privateOpen)setPrivate(false);});
  window.AccountStudio={importArchive,getModel:()=>state.model,refreshCross:()=>{if(state.model)renderLibrary();}};
})();