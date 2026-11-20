/* Deux imports optionnels : le calcul ne commence que sur clic explicite.
   La séparation n'ajoute aucune dépendance réseau à GitHub Pages. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const selected={music:null,tech:null};
  let active=false;
  const formatSize=n=>n>1024*1024?(n/1024/1024).toFixed(1)+' Mo':Math.round(n/1024)+' Ko';
  const label=(kind,file)=>{
    const id=kind==='music'?'musicSelected':'techSelected';
    $(id).textContent=file?file.name+' · '+formatSize(file.size):'Aucune archive sélectionnée';
    $(kind==='music'?'uploadZone':'techUploadZone').classList.toggle('has-archive',!!file);
  };
  function pick(kind,file){
    if(active)return;
    if(!file)return;
    if(!/\.zip$/i.test(file.name)){$('importNotice').textContent='Les deux imports attendent des fichiers ZIP Spotify.';return;}
    selected[kind]=file;label(kind,file);
    $('runAnalysis').disabled=false;
    $('importNotice').textContent='Archives sélectionnées. Les fichiers restent locaux ; lance le calcul quand tu veux.';
  }
  async function run(){
    if(active)return;
    if(!selected.music&&!selected.tech){$('importNotice').textContent='Choisis au moins une archive ZIP.';return;}
    active=true;$('runAnalysis').disabled=true;$('runAnalysis').textContent='Analyse en cours…';
    const results=[];
    // Les archives sont indépendantes : une erreur n’empêche pas l’autre d’être analysée.
    if(selected.music){
      $('importNotice').textContent='Analyse de l’historique musical…';
      try{
        const ok=await window.MusicStudio.importFile(selected.music);
        if(ok)results.push('écoutes musicales');else results.push('historique musical non reconnu');
      }catch(e){console.warn('Historique non chargé :',e?.message);results.push('historique musical : erreur');}
    }
    if(selected.tech){
      $('importNotice').textContent='Analyse du journal technique (jusqu’à plusieurs centaines de Mo décompressés)…';
      try{await window.TechStudio.importArchive(selected.tech);results.push('diagnostic technique');}
      catch(e){console.warn('Journal technique non chargé :',e?.message);results.push('journal technique : '+(e?.message||'erreur'));}
    }
    const hasMusic=!!window.MusicStudio.hasModel(),hasTech=!!window.TechStudio.getModel();
    $('dashboard').hidden=!hasMusic;$('techDashboard').hidden=!hasTech;
    $('techMusicNavLink').hidden=!hasTech;
    $('emptyState').hidden=hasMusic||hasTech;
    $('importNotice').textContent=results.join(' · ')+'. '+(hasMusic&&hasTech?'Toutes les sections sont accessibles.':hasMusic?'Seul le module musical est affiché.':hasTech?'Seul le module technique est affiché.':'Aucun module chargé.');
    $('runAnalysis').disabled=false;$('runAnalysis').textContent='▶ Lancer l’analyse';
    $('reimportBtn').hidden=!(hasMusic||hasTech);
    active=false;
    (hasMusic?$('dashboard'):hasTech?$('techDashboard'):$('importNotice')).scrollIntoView({behavior:'smooth',block:'start'});
  }
  $('techFileInput').addEventListener('change',e=>{pick('tech',e.target.files?.[0]);e.target.value='';});
  $('techUploadZone').addEventListener('click',()=>$('techFileInput').click());
  $('techUploadZone').addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();$('techFileInput').click();}});
  $('runAnalysis').addEventListener('click',run);
  window.ImportManager={selectMusic:f=>pick('music',f),selectTech:f=>pick('tech',f),run};
})();
