/* ── StudyHub Presence System ──
   Include this on every page AFTER firebase is initialized:
   <script src="presence.js"></script>
   Requires: firebase.auth(), firebase.firestore() already initialized as `auth`/`db` on window,
   OR this file will grab them itself via firebase.auth()/firebase.firestore().
*/
(function(){
  const ONLINE_THRESHOLD_MS = 45 * 1000;   // considered "online" if pinged within 45s
  const HEARTBEAT_MS        = 25 * 1000;   // ping every 25s while tab is active

  let heartbeatTimer = null;

  function db(){ return firebase.firestore(); }

  async function pingPresence(uid){
    try{
      await db().collection('presence').doc(uid).set({
        lastActive: firebase.firestore.FieldValue.serverTimestamp(),
        online: true
      }, { merge:true });
    }catch(e){ /* fail silently, presence is non-critical */ }
  }

  async function markOffline(uid){
    try{
      await db().collection('presence').doc(uid).set({
        lastActive: firebase.firestore.FieldValue.serverTimestamp(),
        online:false
      }, { merge:true });
    }catch(e){}
  }

  function startHeartbeat(uid){
    stopHeartbeat();
    pingPresence(uid);
    heartbeatTimer = setInterval(()=>{
      if(document.visibilityState === 'visible') pingPresence(uid);
    }, HEARTBEAT_MS);
  }

  function stopHeartbeat(){
    if(heartbeatTimer){ clearInterval(heartbeatTimer); heartbeatTimer=null; }
  }

  firebase.auth().onAuthStateChanged(user=>{
    if(user){
      startHeartbeat(user.uid);
      document.addEventListener('visibilitychange', ()=>{
        if(document.visibilityState==='visible') pingPresence(user.uid);
      });
      window.addEventListener('beforeunload', ()=>{ markOffline(user.uid); });
    } else {
      stopHeartbeat();
    }
  });

  // ── Public helper: get + format presence for any uid ──
  window.SHPresence = {
    threshold: ONLINE_THRESHOLD_MS,

    async get(uid){
      try{
        const doc = await db().collection('presence').doc(uid).get();
        if(!doc.exists) return { online:false, lastActive:null };
        const d = doc.data();
        const lastActive = d.lastActive ? d.lastActive.toDate() : null;
        const online = lastActive ? (Date.now() - lastActive.getTime() < ONLINE_THRESHOLD_MS) : false;
        return { online, lastActive };
      }catch(e){ return { online:false, lastActive:null }; }
    },

    // Live-updating label, e.g. "Active now" / "Active 5m ago"
    formatLabel(presence){
      if(!presence.lastActive) return 'Offline';
      if(presence.online) return 'Active now';
      const diffMs = Date.now() - presence.lastActive.getTime();
      const mins = Math.floor(diffMs/60000);
      if(mins < 1)   return 'Active just now';
      if(mins < 60)  return `Active ${mins}m ago`;
      const hrs = Math.floor(mins/60);
      if(hrs < 24)   return `Active ${hrs}h ago`;
      const days = Math.floor(hrs/24);
      if(days < 7)   return `Active ${days}d ago`;
      return `Last seen ${presence.lastActive.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`;
    },

    // Attach a live-updating presence badge to a DOM element for a given uid
    // dotEl: small dot element, labelEl: optional text element
    watch(uid, dotEl, labelEl){
      async function refresh(){
        const p = await SHPresence.get(uid);
        if(dotEl){
          dotEl.classList.toggle('sh-presence-online', p.online);
          dotEl.classList.toggle('sh-presence-offline', !p.online);
          dotEl.title = SHPresence.formatLabel(p);
        }
        if(labelEl) labelEl.textContent = SHPresence.formatLabel(p);
      }
      refresh();
      return setInterval(refresh, 30000); // refresh label every 30s
    }
  };
})();