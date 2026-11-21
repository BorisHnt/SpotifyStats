/* Trois imports indépendants. Aucun traitement avant le clic explicite. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const selected={music:null,tech:null,account:null};
  const names={music:'musicSelected',tech:'techSelected',account:'accountSelected'};
  const zones={music:'uploadZone',tech:'techUploadZone',account:'accountUploadZone'};
  let active=false;
  const formatSize=n=>n>=1024*1024?(n/1024/1024).toFixed(1)+' Mo':Math.max(1,Math.round(n/1024))+' Ko';
  function pick(kind,file){
    if(active||!file)return;
    if(!/\.zip$/i.test(file.name)){$('importNotice').textContent='Les trois imports attendent un ZIP Spotify.';return;}
    selected[kind]=file;
    $(names[kind]).textContent=file.name+' · '+formatSize(file.size);
    $(zones[kind]).classList.add('has-archive');
    $('runAnalysis').disabled=false;
    $('importNotice').textContent='Archive(s) sélectionnée(s). Aucun fichier n’est transmis au serveur.';
  }
  async function run(){
    if(active)return;
    if(!Object.values(selected).some(Boolean)){$('importNotice').textContent='Choisis au moins une archive ZIP.';return;}
    active=true;$('runAnalysis').disabled=true;$('runAnalysis').textContent='Analyse en cours…';
    const results=[];
    try {
      if(selected.music){
        $('importNotice').textContent='Analyse de l’historique musical…';
        try {const ok=await window.MusicStudio.importFile(selected.music);results.push(ok?'Écoutes : chargées':'Écoutes : non reconnues');}
        catch(e){console.warn('Import musical :',e?.message);results.push('Écoutes : '+(e?.message||'erreur'));}
      }
      if(selected.tech){
        $('importNotice').textContent='Analyse des journaux techniques…';
        try{await window.TechStudio.importArchive(selected.tech);results.push('Technique : chargée');}
        catch(e){console.warn('Import technique :',e?.message);results.push('Technique : '+(e?.message||'erreur'));}
      }
      if(selected.account){
        $('importNotice').textContent='Analyse de l’archive du compte (données personnelles masquées)…';
        try{await window.AccountStudio.importArchive(selected.account);results.push('Compte : chargé');}
        catch(e){console.warn('Import compte :',e?.message);results.push('Compte : '+(e?.message||'erreur'));}
      }
      const music=Boolean(window.MusicStudio.hasModel()),tech=Boolean(window.TechStudio.getModel()),account=Boolean(window.AccountStudio.getModel());
      window.AccountStudio.refreshCross();
      $('dashboard').hidden=!music;
      $('techDashboard').hidden=!tech;
      $('accountDashboard').hidden=!account;
      $('techMusicNavLink').hidden=!tech;
      $('accountMusicNavLink').hidden=!account;
      $('emptyState').hidden=music||tech||account;
      $('reimportBtn').hidden=!(music||tech||account);
      const available=[music?'écoutes':null,tech?'technique':null,account?'compte':null].filter(Boolean);
      $('importNotice').textContent=results.join(' · ')+'. '+(available.length?`Modules visibles : ${available.join(', ')}.`:'Aucune archive exploitable.');
      (music?$('dashboard'):tech?$('techDashboard'):account?$('accountDashboard'):$('importNotice')).scrollIntoView({behavior:'smooth',block:'start'});
    }finally{active=false;$('runAnalysis').disabled=false;$('runAnalysis').textContent='▶ Lancer l’analyse';}
  }
  for(const kind of ['tech','account']){
    const input=kind==='tech'?'techFileInput':'accountFileInput',zone=zones[kind];
    $(input).addEventListener('change',e=>{pick(kind,e.target.files?.[0]);e.target.value='';});
    $(zone).addEventListener('click',() => $(input).click());
    $(zone).addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$(input).click();}});
  }
  $('runAnalysis').addEventListener('click',run);
  window.ImportManager={selectMusic:file=>pick('music',file),selectTech:file=>pick('tech',file),selectAccount:file=>pick('account',file),run};
})();