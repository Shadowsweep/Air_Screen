let folders = [];
let selectedFolder = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadFolders();
  setupEventListeners();
  renderFolders();
});

async function loadFolders() {
  const result = await chrome.storage.sync.get(['folders', 'selectedFolder']);
  folders = result.folders || [
    { id: 1, name: 'Screenshots', path: 'Screenshots' }
  ];
  selectedFolder = result.selectedFolder || folders[0];
  updateCurrentFolder();
}

function updateCurrentFolder() {
  const currentFolderPath = document.getElementById('currentFolderPath');
  currentFolderPath.textContent = selectedFolder?.path || 'No folder selected';
}

function renderFolders() {
  const foldersListElement = document.getElementById('foldersList');
  foldersListElement.innerHTML = folders.map(folder => `
    <div class="folder-item" data-folder-id="${folder.id}">
      <input 
        type="radio" 
        name="folder" 
        class="folder-radio"
        data-folder-id="${folder.id}"
        ${selectedFolder?.id === folder.id ? 'checked' : ''}
      >
      <div class="folder-info">
        <div class="folder-name">${folder.name}</div>
        <div class="folder-path">${folder.path}</div>
      </div>
      <button class="btn edit-btn" data-folder-id="${folder.id}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      </button>
      <button class="btn delete-btn" data-folder-id="${folder.id}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  `).join('');
}

function setupEventListeners() {
  document.getElementById('screenshotBtn').addEventListener('click', takeScreenshot);
  document.getElementById('addFolderBtn').addEventListener('click', addNewFolder);
  
  const foldersList = document.getElementById('foldersList');
  foldersList.addEventListener('click', handleFolderListClick);
  foldersList.addEventListener('change', handleFolderRadioChange);
}

async function takeScreenshot() {
  if (!selectedFolder) {
    showNotification('Please select a folder first', 'error');
    return;
  }

  try {
    // Request permission for the active tab
    await chrome.tabs.query({active: true, currentWindow: true}, async function(tabs) {
      const tab = tabs[0];
      try {
        // Capture the visible tab
        const dataUrl = await chrome.tabs.captureVisibleTab(null, {format: 'png'});
        
        // Generate filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedTitle = tab.title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
        const filename = `${selectedFolder.path}/screenshot-${sanitizedTitle}-${timestamp}.png`;
        
        // Download the screenshot
        await chrome.downloads.download({
          url: dataUrl,
          filename: filename,
          saveAs: false
        });

        showNotification('Screenshot saved successfully!', 'success');
      } catch (error) {
        
        showNotification('Failed to take screenshot: ' + error.message, 'error');
      }
    });
  } catch (error) {
    
    showNotification('Failed to access tab: ' + error.message, 'error');
  }
}

async function addNewFolder() {
  const nameInput = document.getElementById('newFolderName');
  const pathInput = document.getElementById('newFolderPath');
  
  if (!nameInput.value || !pathInput.value) {
    showNotification('Please enter both folder name and path', 'error');
    return;
  }

  try {
    const sanitizedPath = pathInput.value.replace(/[<>:"|?*]/g, '-');
    
    const newFolder = {
      id: Date.now(),
      name: nameInput.value,
      path: sanitizedPath
    };
    
    folders.push(newFolder);
    if (!selectedFolder) {
      selectedFolder = newFolder;
    }
    
    nameInput.value = '';
    pathInput.value = '';
    await saveFolders();
    showNotification('Folder created successfully!', 'success');
  } catch (error) {
    showNotification(`Failed to create folder: ${error.message}`, 'error');
  }
}

function handleFolderListClick(event) {
  const folderId = parseInt(event.target.closest('[data-folder-id]')?.dataset.folderId);
  if (!folderId) return;

  if (event.target.closest('.edit-btn')) {
    editFolder(folderId);
  } else if (event.target.closest('.delete-btn')) {
    deleteFolder(folderId);
  }
}

function handleFolderRadioChange(event) {
  if (event.target.classList.contains('folder-radio')) {
    const folderId = parseInt(event.target.dataset.folderId);
    selectFolder(folderId);
  }
}

async function selectFolder(id) {
  selectedFolder = folders.find(f => f.id === id);
  await saveFolders();
}

function editFolder(id) {
  const folderElement = document.querySelector(`[data-folder-id="${id}"]`);
  const folder = folders.find(f => f.id === id);
  
  folderElement.innerHTML = `
    <div class="edit-mode">
      <input type="text" class="input-field" value="${folder.name}" id="edit-name-${id}">
      <input type="text" class="input-field" value="${folder.path}" id="edit-path-${id}">
      <button class="save-btn" data-folder-id="${id}">Save</button>
    </div>
  `;

  const saveBtn = folderElement.querySelector('.save-btn');
  saveBtn.addEventListener('click', () => saveEdit(id));
}

async function saveEdit(id) {
  const nameInput = document.getElementById(`edit-name-${id}`);
  const pathInput = document.getElementById(`edit-path-${id}`);
  
  if (!nameInput.value || !pathInput.value) {
    showNotification('Please enter both folder name and path', 'error');
    return;
  }

  try {
    const sanitizedPath = pathInput.value.replace(/[<>:"|?*]/g, '-');
    
    folders = folders.map(folder => 
      folder.id === id 
        ? { ...folder, name: nameInput.value, path: sanitizedPath }
        : folder
    );
    
    if (selectedFolder?.id === id) {
      selectedFolder = folders.find(f => f.id === id);
    }
    
    await saveFolders();
    showNotification('Folder updated successfully!', 'success');
  } catch (error) {
    showNotification(`Failed to update folder: ${error.message}`, 'error');
  }
}

async function deleteFolder(id) {
  if (!confirm('Are you sure you want to delete this folder from the list?')) {
    return;
  }
  
  folders = folders.filter(folder => folder.id !== id);
  if (selectedFolder?.id === id) {
    selectedFolder = folders[0] || null;
  }
  await saveFolders();
  showNotification('Folder removed from list', 'success');
}

async function saveFolders() {
  await chrome.storage.sync.set({
    folders: folders,
    selectedFolder: selectedFolder
  });
  renderFolders();
  updateCurrentFolder();
}

function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    border-radius: 4px;
    color: white;
    background-color: ${type === 'success' ? '#22c55e' : '#ef4444'};
    z-index: 1000;
    animation: fadeInOut 3s forwards;
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}