// Admin Dashboard functionality
const { ipcRenderer } = require('electron');
let currentUser = null;
let users = [];
let editingUserId = null;
let devices = [];
let unmappedDevices = [];
let mappedDevices = [];

// Initialize admin dashboard
document.addEventListener('DOMContentLoaded', () => {
    // Window controls
    document.getElementById('minimize-btn').addEventListener('click', () => {
        ipcRenderer.send('window-minimize');
    });
    
    document.getElementById('maximize-btn').addEventListener('click', () => {
        ipcRenderer.send('window-maximize');
    });
    
    document.getElementById('close-btn').addEventListener('click', () => {
        ipcRenderer.send('window-close');
    });
    // Check authentication and admin role
    const userStr = sessionStorage.getItem('currentUser');
    if (!userStr) {
        window.location.href = 'login.html';
        return;
    }
    
    currentUser = JSON.parse(userStr);
    if (currentUser.role !== 'admin') {
        alert('Access denied. Admin privileges required.');
        window.location.href = 'dashboard.html';
        return;
    }
    
    initializeAdminDashboard();
    initializeUsersData();
    initializeDeviceManagement();
});

function initializeAdminDashboard() {
    // Set user info
    document.querySelector('.user-name').textContent = currentUser.name;
    
    // Navigation
    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = e.target.dataset.view;
            switchView(view);
        });
    });
    
    // Logout
    document.querySelector('.logout-btn').addEventListener('click', () => {
        sessionStorage.removeItem('currentUser');
        window.location.href = 'login.html';
    });
    
    // Add user button
    document.getElementById('add-user-btn').addEventListener('click', () => {
        openUserModal();
    });
    
    // User search
    document.getElementById('user-search').addEventListener('input', (e) => {
        filterUsers(e.target.value);
    });
    
    // User form
    document.getElementById('user-form').addEventListener('submit', saveUser);
    
    // Modal close buttons
    document.querySelectorAll('.close-modal, .cancel-btn').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });
    
    // Settings
    document.getElementById('save-settings').addEventListener('click', saveSettings);
    
    // Confirmation modal
    document.getElementById('confirm-cancel').addEventListener('click', closeAllModals);
}

async function initializeUsersData() {
    await loadUsers();
    renderUsers();
    updateStats();
}

async function loadUsers() {
    try {
        // Load users from API
        const response = await apiService.getAllUsers();
        
        if (response.success && response.data) {
            users = response.data.users || response.data;
            console.log('Users loaded from API:', users.length);
        } else {
            throw new Error(response.error || 'Failed to load users from API');
        }
        
    } catch (error) {
        console.error('Failed to load users from API:', error);
        
        // Show error notification
        showNotification('Failed to load users from server. Check your connection.', 'error');
        
        // Fallback: try to load from sessionStorage as backup
        const savedUsers = sessionStorage.getItem('systemUsers');
        if (savedUsers) {
            users = JSON.parse(savedUsers);
            console.log('Loaded users from sessionStorage backup');
        } else {
            // Last resort: empty array
            users = [];
            console.log('No users available - starting with empty list');
        }
    }
}

// Users are now managed via API - no local storage needed

function renderUsers() {
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = '';
    
    users.forEach(user => {
        const row = createUserRow(user);
        tbody.appendChild(row);
    });
    
    updatePermissionsMatrix();
}

function createUserRow(user) {
    const row = document.createElement('tr');
    
    const permissionBadges = user.permissions.map(perm => 
        `<span class="permission-badge ${perm}">${perm.toUpperCase()}</span>`
    ).join('');
    
    row.innerHTML = `
        <td>${user.username}</td>
        <td>${user.name}</td>
        <td>${user.role.toUpperCase()}</td>
        <td>${permissionBadges}</td>
        <td><span class="status-badge ${user.status}">${user.status.toUpperCase()}</span></td>
        <td>
            <div class="table-actions">
                <button class="table-btn edit" onclick="editUser('${user.id}')">EDIT</button>
                <button class="table-btn delete" onclick="deleteUser('${user.id}')">DELETE</button>
            </div>
        </td>
    `;
    
    return row;
}

function openUserModal(userId = null) {
    editingUserId = userId;
    const modal = document.getElementById('user-modal');
    const title = document.getElementById('user-modal-title');
    const form = document.getElementById('user-form');
    
    if (userId) {
        const user = users.find(u => u.id === userId);
        title.textContent = 'EDIT USER';
        
        // Populate form
        document.getElementById('user-username').value = user.username;
        document.getElementById('user-name').value = user.name;
        document.getElementById('user-password').value = user.password;
        document.getElementById('user-role').value = user.role;
        document.getElementById('user-status').value = user.status;
        
        // Set permissions
        document.querySelectorAll('input[name="permissions"]').forEach(checkbox => {
            checkbox.checked = user.permissions.includes(checkbox.value);
        });
    } else {
        title.textContent = 'ADD NEW USER';
        form.reset();
    }
    
    modal.classList.add('active');
}

async function saveUser(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const userData = {
        username: formData.get('username') || document.getElementById('user-username').value,
        name: formData.get('name') || document.getElementById('user-name').value,
        password: formData.get('password') || document.getElementById('user-password').value,
        role: formData.get('role') || document.getElementById('user-role').value,
        status: formData.get('status') || document.getElementById('user-status').value,
        permissions: []
    };
    
    // Get selected permissions
    document.querySelectorAll('input[name="permissions"]:checked').forEach(checkbox => {
        userData.permissions.push(checkbox.value);
    });
    
    try {
        let response;
        
        if (editingUserId) {
            // Update existing user
            response = await apiService.updateUser(editingUserId, userData);
            if (response.success) {
                showNotification('User updated successfully', 'success');
            } else {
                throw new Error(response.error || 'Failed to update user');
            }
        } else {
            // Add new user
            response = await apiService.createUser(userData);
            if (response.success) {
                showNotification('User created successfully', 'success');
            } else {
                throw new Error(response.error || 'Failed to create user');
            }
        }
        
        // Reload users from API to get updated data
        await loadUsers();
        renderUsers();
        updateStats();
        closeAllModals();
        
    } catch (error) {
        console.error('Failed to save user:', error);
        showNotification(`Failed to save user: ${error.message}`, 'error');
        
        // Don't close modal on error so user can try again
    }
}

function editUser(userId) {
    openUserModal(userId);
}

function deleteUser(userId) {
    const user = users.find(u => u.id === userId);
    showConfirmModal(
        'DELETE USER',
        `Are you sure you want to delete user "${user.name}"? This action cannot be undone.`,
        async () => {
            try {
                const response = await apiService.deleteUser(userId);
                
                if (response.success) {
                    showNotification('User deleted successfully', 'success');
                    
                    // Reload users from API
                    await loadUsers();
                    renderUsers();
                    updateStats();
                } else {
                    throw new Error(response.error || 'Failed to delete user');
                }
                
            } catch (error) {
                console.error('Failed to delete user:', error);
                showNotification(`Failed to delete user: ${error.message}`, 'error');
            }
        }
    );
}

function filterUsers(searchTerm) {
    const tbody = document.getElementById('users-tbody');
    const rows = tbody.querySelectorAll('tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm.toLowerCase()) ? '' : 'none';
    });
}

function updatePermissionsMatrix() {
    const container = document.getElementById('permissions-matrix');
    const permissions = ['audio', 'video', 'location'];
    
    let html = `
        <div class="matrix-header">
            <div>USER</div>
            <div>AUDIO</div>
            <div>VIDEO</div>
            <div>LOCATION</div>
        </div>
    `;
    
    users.forEach(user => {
        html += `<div class="matrix-row">
            <div>${user.name}</div>`;
        
        permissions.forEach(perm => {
            const hasPermission = user.permissions.includes(perm);
            html += `<div class="matrix-cell">
                <div class="permission-indicator ${hasPermission ? 'granted' : 'denied'}"></div>
            </div>`;
        });
        
        html += '</div>';
    });
    
    container.innerHTML = html;
}


function updateStats() {
    // Permission stats
    const audioUsers = users.filter(u => u.permissions.includes('audio')).length;
    const videoUsers = users.filter(u => u.permissions.includes('video')).length;
    const locationUsers = users.filter(u => u.permissions.includes('location')).length;
    const fullAccessUsers = users.filter(u => 
        u.permissions.includes('audio') && 
        u.permissions.includes('video') && 
        u.permissions.includes('location')
    ).length;
    
    document.getElementById('audio-users').textContent = audioUsers;
    document.getElementById('video-users').textContent = videoUsers;
    document.getElementById('location-users').textContent = locationUsers;
    document.getElementById('full-access-users').textContent = fullAccessUsers;
}

function switchView(viewName) {
    // Update navigation
    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewName);
    });
    
    // Update views
    document.querySelectorAll('.view-container').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`${viewName}-view`).classList.add('active');
    
    // Load data for specific views
    if (viewName === 'settings') {
        loadSettings();
    }
}

async function loadSettings() {
    const saveButton = document.getElementById('save-settings');
    const originalText = saveButton.textContent;
    
    try {
        // Show loading state
        saveButton.textContent = 'LOADING...';
        saveButton.disabled = true;
        
        const response = await apiService.getSystemSettings();
        
        if (response.success && response.data.settings) {
            const settings = response.data.settings;
            
            // Update form with current settings
            document.getElementById('default-audio').checked = settings.defaultPermissions.audio;
            document.getElementById('default-video').checked = settings.defaultPermissions.video;
            document.getElementById('default-location').checked = settings.defaultPermissions.location;
            document.getElementById('max-users').value = settings.maxUsers;
            document.getElementById('auto-disable-days').value = settings.autoDisableDays;
        } else {
            showNotification('Failed to load system settings', 'error');
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
        showNotification('Failed to load system settings', 'error');
    } finally {
        // Restore button state
        saveButton.textContent = originalText;
        saveButton.disabled = false;
    }
}

async function saveSettings() {
    const saveButton = document.getElementById('save-settings');
    const originalText = saveButton.textContent;
    
    const settings = {
        defaultPermissions: {
            audio: document.getElementById('default-audio').checked,
            video: document.getElementById('default-video').checked,
            location: document.getElementById('default-location').checked
        },
        maxUsers: parseInt(document.getElementById('max-users').value),
        autoDisableDays: parseInt(document.getElementById('auto-disable-days').value)
    };
    
    // Validate settings
    if (settings.maxUsers < 1) {
        showNotification('Maximum users must be at least 1', 'error');
        return;
    }
    
    if (settings.autoDisableDays < 1) {
        showNotification('Auto-disable days must be at least 1', 'error');
        return;
    }
    
    try {
        // Show saving state
        saveButton.textContent = 'SAVING...';
        saveButton.disabled = true;
        
        const response = await apiService.updateSystemSettings(settings);
        
        if (response.success) {
            showNotification('Settings saved successfully', 'success');
        } else {
            throw new Error(response.error || 'Failed to save settings');
        }
    } catch (error) {
        console.error('Failed to save settings:', error);
        showNotification('Failed to save system settings', 'error');
    } finally {
        // Restore button state
        saveButton.textContent = originalText;
        saveButton.disabled = false;
    }
}

function showConfirmModal(title, message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    
    // Remove existing listeners
    const newButton = document.getElementById('confirm-action').cloneNode(true);
    document.getElementById('confirm-action').parentNode.replaceChild(newButton, document.getElementById('confirm-action'));
    
    newButton.addEventListener('click', () => {
        onConfirm();
        closeAllModals();
    });
    
    modal.classList.add('active');
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
    editingUserId = null;
}

// Function to determine device status based on location timestamp
function getDeviceStatusFromLocation(device) {
    // Device is only online if it has location data with a recent timestamp
    // No location data = offline immediately
    
    // Check if device has location data with timestamp
    let hasValidLocation = false;
    let lastLocationTime = null;
    
    // Only consider devices with actual location data
    if (device.lastKnownLocation && 
        device.lastKnownLocation.timestamp && 
        (device.lastKnownLocation.lat !== undefined || device.lastKnownLocation.lng !== undefined)) {
        lastLocationTime = new Date(device.lastKnownLocation.timestamp).getTime();
        hasValidLocation = true;
    }
    
    // If no valid location data, device is offline
    if (!hasValidLocation || !lastLocationTime || isNaN(lastLocationTime)) {
        return 'offline';
    }
    
    // Check if last location update was within 5 minutes
    const now = Date.now();
    const timeDiff = now - lastLocationTime;
    const OFFLINE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
    
    // Only online if location was received within timeout period
    if (timeDiff <= OFFLINE_TIMEOUT) {
        return 'online';
    } else {
        return 'offline';
    }
}

// Device Management Functions
function initializeDeviceManagement() {
    // Refresh devices button
    document.getElementById('refresh-devices-btn').addEventListener('click', loadDevicesData);
    
    // Load initial data
    loadDevicesData();
    
    // Set up auto-refresh every 30 seconds
    setInterval(() => {
        loadDevicesData(true); // Silent refresh
    }, 30000);
}

async function loadDevicesData(silent = false) {
    try {
        // Get all devices and unmapped devices in parallel
        const [allDevicesResponse, unmappedResponse] = await Promise.all([
            apiService.getAllDevices(),
            apiService.getUnmappedDevices()
        ]);
        
        if (allDevicesResponse.success) {
            devices = allDevicesResponse.data?.devices || [];
            
            // Update device status based on location timestamps
            devices = devices.map(device => {
                const status = getDeviceStatusFromLocation(device);
                return { ...device, status };
            });
            
            mappedDevices = devices.filter(d => d.is_mapped);
            if (!silent) {
                console.log('Admin: All devices loaded:', devices.length);
            }
        } else {
            devices = [];
            mappedDevices = [];
            if (!silent) {
                console.error('Admin: Failed to load all devices:', allDevicesResponse.error);
            }
        }
        
        if (unmappedResponse.success) {
            unmappedDevices = unmappedResponse.data?.unmapped_devices || [];
            
            // Update unmapped devices status as well
            unmappedDevices = unmappedDevices.map(device => {
                const status = getDeviceStatusFromLocation(device);
                return { ...device, status };
            });
            
            if (!silent) {
                console.log('Admin: Unmapped devices loaded:', unmappedDevices.length);
            }
        } else {
            unmappedDevices = [];
            if (!silent) {
                console.error('Admin: Failed to load unmapped devices:', unmappedResponse.error);
            }
        }
        
        updateDeviceStats();
        renderUnmappedDevices();
        renderMappedDevices();
        
    } catch (error) {
        console.error('Failed to load device data:', error);
        if (!silent) {
            showNotification('Failed to load device data. Please try again.', 'error');
        }
    }
}

function updateDeviceStats() {
    const totalDevices = devices.length;
    const mappedCount = mappedDevices.length;
    const unmappedCount = unmappedDevices.length;
    const mappingRate = totalDevices > 0 ? ((mappedCount / totalDevices) * 100).toFixed(1) : 0;
    
    document.getElementById('total-devices-admin').textContent = totalDevices;
    document.getElementById('mapped-devices-admin').textContent = mappedCount;
    document.getElementById('unmapped-devices-admin').textContent = unmappedCount;
    document.getElementById('mapping-rate-admin').textContent = `${mappingRate}%`;
    document.getElementById('unmapped-count').textContent = unmappedCount;
    document.getElementById('mapped-count').textContent = mappedCount;
}

function renderUnmappedDevices() {
    const container = document.getElementById('unmapped-devices-container');
    
    if (unmappedDevices.length === 0) {
        container.innerHTML = '<div class="empty-state">🎉 All devices have been mapped!</div>';
        return;
    }
    
    container.innerHTML = unmappedDevices.map(device => `
        <div class="device-mapping-card unmapped">
            <div class="device-info">
                <h4>${device.device_name}</h4>
                <div class="device-details">
                    <span><strong>ID:</strong> ${device.device_id}</span>
                    <span><strong>Platform:</strong> ${device.platform}</span>
                    ${device.device_model ? `<span><strong>Model:</strong> ${device.device_model}</span>` : ''}
                    <span><strong>OS:</strong> ${device.os_version}</span>
                    <span><strong>Registered:</strong> ${formatDeviceDate(device.created_at)}</span>
                    <span class="status ${device.status}"><strong>Status:</strong> ${device.status.toUpperCase()}</span>
                </div>
            </div>
            <div class="device-actions">
                <div class="name-input-group">
                    <input type="text" placeholder="Enter meaningful name (e.g., Stephen Device)" 
                           class="admin-name-input" data-device-id="${device.device_id}">
                    <button class="action-btn primary assign-name-btn" data-device-id="${device.device_id}">
                        ASSIGN NAME
                    </button>
                </div>
            </div>
        </div>
    `).join('');
    
    // Add event listeners
    container.querySelectorAll('.assign-name-btn').forEach(btn => {
        btn.addEventListener('click', handleAssignDeviceName);
    });
    
    // Enter key support
    container.querySelectorAll('.admin-name-input').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const deviceId = e.target.dataset.deviceId;
                const btn = container.querySelector(`[data-device-id="${deviceId}"].assign-name-btn`);
                if (btn) btn.click();
            }
        });
    });
}

function renderMappedDevices() {
    const container = document.getElementById('mapped-devices-container');
    
    if (mappedDevices.length === 0) {
        container.innerHTML = '<div class="empty-state">No devices have been mapped yet.</div>';
        return;
    }
    
    container.innerHTML = mappedDevices.map(device => `
        <div class="device-mapping-card mapped">
            <div class="device-info">
                <h4>${device.display_name}</h4>
                <div class="device-details">
                    <span><strong>Original Name:</strong> ${device.device_name}</span>
                    <span><strong>ID:</strong> ${device.device_id}</span>
                    <span><strong>Platform:</strong> ${device.platform}</span>
                    ${device.device_model ? `<span><strong>Model:</strong> ${device.device_model}</span>` : ''}
                    <span><strong>OS:</strong> ${device.os_version}</span>
                    <span><strong>Last Seen:</strong> ${formatDeviceDate(device.lastSeen)}</span>
                    <span class="status ${device.status}"><strong>Status:</strong> ${device.status.toUpperCase()}</span>
                </div>
            </div>
            <div class="device-actions">
                <button class="action-btn secondary edit-name-btn" data-device-id="${device.device_id}" 
                        data-current-name="${device.admin_assigned_name}">
                    EDIT NAME
                </button>
                <button class="action-btn danger unmap-btn" data-device-id="${device.device_id}">
                    UNMAP
                </button>
            </div>
        </div>
    `).join('');
    
    // Add event listeners
    container.querySelectorAll('.edit-name-btn').forEach(btn => {
        btn.addEventListener('click', handleEditDeviceName);
    });
    
    container.querySelectorAll('.unmap-btn').forEach(btn => {
        btn.addEventListener('click', handleUnmapDevice);
    });
}

async function handleAssignDeviceName(e) {
    const deviceId = e.target.dataset.deviceId;
    const input = document.querySelector(`.admin-name-input[data-device-id="${deviceId}"]`);
    
    if (!input) {
        console.error('❌ Admin input field not found for device:', deviceId);
        showNotification('Input field not found', 'error');
        return;
    }
    
    const name = input.value.trim();
    
    console.log('🎯 Admin handleAssignDeviceName called:', { 
        deviceId, 
        name,
        inputElement: input,
        rawValue: input.value,
        trimmedValue: name
    });
    
    if (!name) {
        console.warn('⚠️ Empty device name provided in admin');
        showNotification('Please enter a device name', 'error');
        input.focus();
        return;
    }
    
    // Validate name
    const validation = apiService.validateDeviceName(name);
    console.log('✅ Admin name validation result:', validation);
    
    if (!validation.valid) {
        console.warn('⚠️ Admin name validation failed:', validation.error);
        showNotification(validation.error, 'error');
        input.focus();
        return;
    }
    
    // Show loading state
    const btn = e.target;
    const originalText = btn.textContent;
    btn.textContent = 'ASSIGNING...';
    btn.disabled = true;
    
    try {
        console.log('🚀 Admin calling apiService.assignDeviceName...');
        const response = await apiService.assignDeviceName(deviceId, name);
        
        console.log('📨 Admin assignDeviceName API response:', response);
        
        if (response.success) {
            console.log('✅ Admin device name assigned successfully');
            showNotification('Device name assigned successfully!', 'success');
            await loadDevicesData(); // Refresh data
        } else {
            console.error('❌ Admin API returned error:', response.error);
            showNotification(response.error || 'Failed to assign device name', 'error');
        }
    } catch (error) {
        console.error('❌ Admin exception in handleAssignDeviceName:', error);
        showNotification('Failed to assign device name. Please try again.', 'error');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

async function handleEditDeviceName(e) {
    const deviceId = e.target.dataset.deviceId;
    const currentName = e.target.dataset.currentName;
    
    console.log('🎯 Admin handleEditDeviceName called:', { deviceId, currentName });
    
    const newName = prompt('Enter new device name:', currentName);
    if (newName === null) {
        console.log('📝 User cancelled name edit');
        return; // User cancelled
    }
    
    console.log('📝 Admin edit name details:', { 
        deviceId, 
        currentName, 
        newName,
        trimmedName: newName.trim()
    });
    
    if (!newName.trim()) {
        console.warn('⚠️ Empty device name provided in admin edit');
        showNotification('Please enter a device name', 'error');
        return;
    }
    
    // Validate name
    const validation = apiService.validateDeviceName(newName.trim());
    console.log('✅ Admin edit name validation result:', validation);
    
    if (!validation.valid) {
        console.warn('⚠️ Admin edit name validation failed:', validation.error);
        showNotification(validation.error, 'error');
        return;
    }
    
    try {
        console.log('🚀 Admin calling apiService.updateDeviceName...');
        const response = await apiService.updateDeviceName(deviceId, newName.trim());
        
        console.log('📨 Admin updateDeviceName API response:', response);
        
        if (response.success) {
            console.log('✅ Admin device name updated successfully');
            showNotification('Device name updated successfully!', 'success');
            await loadDevicesData(); // Refresh data
        } else {
            console.error('❌ Admin API returned error:', response.error);
            showNotification(response.error || 'Failed to update device name', 'error');
        }
    } catch (error) {
        console.error('❌ Admin exception in handleEditDeviceName:', error);
        showNotification('Failed to update device name. Please try again.', 'error');
    }
}

async function handleUnmapDevice(e) {
    const deviceId = e.target.dataset.deviceId;
    console.log('🎯 handleUnmapDevice called with device_id:', deviceId);
    const device = mappedDevices.find(d => d.device_id === deviceId);
    
    if (!confirm(`Are you sure you want to remove the name mapping for "${device.display_name}"?\n\nThis will revert the device to using its original name: "${device.device_name}"`)) {
        return;
    }
    
    try {
        const response = await apiService.unmapDevice(deviceId);
        
        if (response.success) {
            showNotification('Device unmapped successfully!', 'success');
            await loadDevicesData(); // Refresh data
        } else {
            showNotification(response.error || 'Failed to unmap device', 'error');
        }
    } catch (error) {
        console.error('Failed to unmap device:', error);
        showNotification('Failed to unmap device. Please try again.', 'error');
    }
}

function formatDeviceDate(dateString) {
    if (!dateString) return 'Unknown';
    
    try {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        
        if (diffMinutes < 1) return 'Just now';
        if (diffMinutes < 60) return `${diffMinutes}m ago`;
        if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
        
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
        return dateString;
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Modal click outside to close
window.onclick = (event) => {
    if (event.target.classList.contains('modal')) {
        closeAllModals();
    }
};