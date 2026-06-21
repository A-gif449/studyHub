// ════════════════════════════════════════
// IMPORTANT QUESTIONS — ADMIN SCRIPT
// Paste this whole block into admin.html's <script>,
// right after the existing PDF upload functions
// (e.g. right after the closing of handleUpload() /
// before the "// ── Notify Followers" comment, or
// anywhere else in the same <script> tag).
// ════════════════════════════════════════

let allIqSets = [];
let selectedIqFile = null;

// ── Load Important Questions list ──
function loadIqSets(){
  db.collection('importantQuestions').orderBy('createdAt','desc').onSnapshot(snap => {
    allIqSets = snap.docs.map(d => ({id:d.id, ...d.data()}));
    renderIqList(allIqSets);
  }, err => {
    document.getElementById('iqList').innerHTML =
      `<div class="empty-list"><i class="ti ti-alert-circle"></i><p>Error: ${err.message}</p></div>`;
  });
}

function renderIqList(items){
  const el = document.getElementById('iqList');
  if(!items.length){
    el.innerHTML = `<div class="empty-list"><i class="ti ti-star-off"></i><p>No question sets uploaded yet.<br/>Use the form to add your first one!</p></div>`;
    return;
  }
  el.innerHTML = items.map(q => `
    <div class="pdf-item">
      <div class="pdf-emoji"><i class="ti ${escHtml(q.icon||'ti-file-text')}"></i></div>
      <div class="pdf-info">
        <div class="pdf-title">${escHtml(q.title||'Untitled')}</div>
        <div class="pdf-meta">
          <span class="tag">Important Questions</span>
          ${q.description ? `<span>${escHtml(q.description.slice(0,40))}${q.description.length>40?'…':''}</span>` : ''}
        </div>
      </div>
      <div class="pdf-actions">
        <button class="icon-btn" title="Preview" onclick="window.open('${escHtml(q.fileUrl||'#')}','_blank')"><i class="ti ti-eye"></i></button>
        <button class="icon-btn del" title="Delete" onclick="deleteIqSet('${q.id}','${escHtml(q.title)}')"><i class="ti ti-trash"></i></button>
      </div>
    </div>`).join('');
}

function filterIqList(){
  const q = document.getElementById('iqSearchInput').value.toLowerCase();
  renderIqList(allIqSets.filter(s => (s.title||'').toLowerCase().includes(q)));
}

// ── File select (reuses same Cloudinary upload pattern as PDFs) ──
function handleIqFileSelect(input){
  const file = input.files[0];
  if(!file) return;
  if(!file.type.startsWith('image/')){ showIqUploadError('Only image/PDF files are allowed.'); input.value=''; return; }
  if(file.size > 52428800){ showIqUploadError('File exceeds 50 MB limit.'); input.value=''; return; }
  selectedIqFile = file;
  const dz = document.getElementById('iqDropZone');
  dz.classList.add('file-chosen');
  dz.innerHTML = `<i class="ti ti-circle-check" style="color:var(--green);font-size:28px"></i><span style="color:var(--green);font-size:13px;font-weight:600">${escHtml(file.name)} (${(file.size/1048576).toFixed(1)} MB)</span>`;
  clearIqUploadMessages();
}

const iqDz = document.getElementById('iqDropZone');
if(iqDz){
  iqDz.addEventListener('dragover', e=>{ e.preventDefault(); iqDz.classList.add('dragging'); });
  iqDz.addEventListener('dragleave', ()=> iqDz.classList.remove('dragging'));
  iqDz.addEventListener('drop', e=>{
    e.preventDefault(); iqDz.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if(file){ const inp = document.getElementById('iqFile'); inp.files = e.dataTransfer.files; handleIqFileSelect(inp); }
  });
}

// ── Upload ──
async function handleIqUpload(){
  clearIqUploadMessages();
  const title = document.getElementById('iqTitle').value.trim();
  const desc  = document.getElementById('iqDesc').value.trim();
  const icon  = document.getElementById('iqIcon').value.trim() || 'ti-file-text';

  if(!selectedIqFile){ showIqUploadError('Please select a file.'); return; }
  if(!title){ showIqUploadError('Title is required.'); return; }

  const btn = document.getElementById('iqUploadBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Uploading…';

  const pw = document.getElementById('iqProgressWrap');
  pw.style.display = 'block';
  setIqProgress(0, 'Uploading to Cloudinary…');

  try {
    const cloudUrl = await uploadToCloudinary(
      selectedIqFile,
      pct => setIqProgress(pct * 0.9, 'Uploading to Cloudinary…')
    );
    setIqProgress(95, 'Saving to database…');

    await db.collection('importantQuestions').add({
      title,
      description: desc,
      icon,
      fileUrl: cloudUrl,
      uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      uploadedBy: auth.currentUser.email
    });

    setIqProgress(100, 'Done!');
    setTimeout(()=>{ pw.style.display='none'; setIqProgress(0,''); }, 1200);

    resetIqForm();
    document.getElementById('iqUploadSuccessMsg').textContent = `"${title}" published successfully!`;
    document.getElementById('iqUploadSuccess').classList.add('show');
    setTimeout(()=> document.getElementById('iqUploadSuccess').classList.remove('show'), 4000);
    showToast('Question set published! ⭐', 'success');

  } catch(err){
    pw.style.display = 'none';
    showIqUploadError('Upload failed: ' + err.message);
    showToast('Upload failed', 'error');
    console.error('IQ upload error:', err);
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-upload"></i> Upload & Publish Question Set';
}

function setIqProgress(pct, label){
  const fill = document.getElementById('iqProgressFill');
  const pctEl = document.getElementById('iqProgressPct');
  const textEl = document.getElementById('iqProgressText');
  if(fill) fill.style.width = pct + '%';
  if(pctEl) pctEl.textContent = Math.round(pct) + '%';
  if(textEl) textEl.textContent = label;
}

function resetIqForm(){
  selectedIqFile = null;
  const dz = document.getElementById('iqDropZone');
  dz.classList.remove('file-chosen');
  dz.innerHTML = `
    <input type="file" id="iqFile" accept="image/*" onchange="handleIqFileSelect(this)"/>
    <div class="drop-icon"><i class="ti ti-star"></i></div>
    <h4>Drop file here or click to browse</h4>
    <p>Maximum file size: 50 MB</p>`;
  ['iqTitle','iqDesc','iqIcon'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
}

async function deleteIqSet(id, title){
  if(!confirm(`Delete "${title}"?\n\nThis removes it from Important Questions.`)) return;
  try {
    await db.collection('importantQuestions').doc(id).delete();
    showToast('Question set deleted.', 'success');
  } catch(e){ showToast('Error: ' + e.message, 'error'); }
}

function showIqUploadError(msg){
  const el = document.getElementById('iqUploadError');
  el.textContent = msg; el.classList.add('show');
}
function clearIqUploadMessages(){
  document.getElementById('iqUploadError').classList.remove('show');
  document.getElementById('iqUploadSuccess').classList.remove('show');
}

// ── Initialize: call this alongside your existing loadPdfs()/loadViews()/loadDownloads() ──
loadIqSets();