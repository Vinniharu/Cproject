// Dashboard functionality
const { ipcRenderer, shell } = require('electron');
let currentUser = null;
let devices = [];
let selectedDevice = null;
let scheduledRecordings = [];
let currentStream = null;
let streamTimer = null;
let deviceDetailsRefreshInterval = null;
let audioContext = null;
let analyser = null;

// Initialize dashboard
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
    // Check authentication
    const userStr = sessionStorage.getItem('currentUser');
    if (!userStr || !apiService.isAuthenticated()) {
        // If no user data or no valid token, redirect to login
        sessionStorage.removeItem('currentUser');
        window.location.href = 'login.html';
        return;
    }
    
    currentUser = JSON.parse(userStr);
    initializeDashboard();
    loadDevices();
    initializeSearch();
    
    // Set up auto-refresh every 30 seconds
    setInterval(() => {
        loadDevices(true); // Silent refresh
    }, 30000);
});

function initializeDashboard() {
    // Set user info
    document.querySelector('.user-role').textContent = currentUser.role.toUpperCase();
    document.querySelector('.user-name').textContent = currentUser.name;
    
    // Debug user permissions
    console.log('🔒 User loaded with permissions:', {
        username: currentUser.username,
        name: currentUser.name,
        role: currentUser.role,
        permissions: currentUser.permissions,
        hasAudio: hasPermission('audio'),
        hasVideo: hasPermission('video'),
        hasLocation: hasPermission('location')
    });
    
    // Hide admin features for regular users
    if (currentUser.role !== 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = 'none';
        });
    }
    
    
    // Navigation
    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = e.target.dataset.view;
            if (view === 'admin' && currentUser.role !== 'admin') return;
            
            switchView(view);
        });
    });
    
    // Logout
    document.querySelector('.logout-btn').addEventListener('click', async () => {
        try {
            // Call API logout endpoint
            await apiService.logout();
            showNotification('Logged out successfully', 'info');
        } catch (error) {
            console.error('Logout error:', error);
            // Even if API call fails, still logout locally
            showNotification('Logged out (offline)', 'warning');
        } finally {
            // Always clear session storage and redirect
            sessionStorage.removeItem('currentUser');
            window.location.href = 'login.html';
        }
    });
    
    // Search functionality
    document.querySelector('.search-input').addEventListener('input', (e) => {
        filterDevices(e.target.value);
    });
    
    // View toggle functionality
    initializeViewToggle();
    
    // Modal close buttons
    document.querySelectorAll('.close-modal, .cancel-btn').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });
    
    // Device controls with permission checks
    document.getElementById('record-audio').addEventListener('click', async () => {
        if (!hasPermission('audio')) {
            showNotification('Access denied: Audio recording not permitted', 'error');
            return;
        }
        
        if (!selectedDevice) {
            showNotification('No device selected', 'error');
            return;
        }
        
        // Check if there's an active recording
        if (selectedDevice.activeAudioRecording) {
            await stopAudioRecording();
        } else {
            await startAudioRecording();
        }
    });
    
    document.getElementById('record-video').addEventListener('click', async () => {
        if (!hasPermission('video')) {
            showNotification('Access denied: Video recording not permitted', 'error');
            return;
        }
        
        if (!selectedDevice) {
            showNotification('No device selected', 'error');
            return;
        }
        
        // Check if there's an active recording
        if (selectedDevice.activeVideoRecording) {
            await stopVideoRecording();
        } else {
            await startVideoRecording();
        }
    });
    
    document.getElementById('live-location').addEventListener('click', async () => {
        if (!hasPermission('location')) {
            showNotification('Access denied: Location tracking not permitted', 'error');
            return;
        }
        
        if (!selectedDevice) {
            showNotification('No device selected', 'error');
            return;
        }
        
        await toggleLiveLocation();
    });
    document.getElementById('remove-device').addEventListener('click', () => {
        if (currentUser.role !== 'admin') {
            showNotification('Access denied: Admin privileges required to remove devices', 'error');
            return;
        }
        initiateDeviceRemoval();
    });
    document.getElementById('open-maps-btn').addEventListener('click', openInGoogleMaps);
    
    document.getElementById('schedule-recording').addEventListener('click', () => {
        if (!hasPermission('audio') && !hasPermission('video')) {
            showNotification('Access denied: Recording permissions required', 'error');
            return;
        }
        showScheduleModal();
    });
    
    document.getElementById('stream-audio').addEventListener('click', () => {
        if (!hasPermission('audio')) {
            showNotification('Access denied: Audio streaming not permitted', 'error');
            return;
        }
        startAudioStream();
    });
    
    document.getElementById('stream-video').addEventListener('click', () => {
        if (!hasPermission('video')) {
            showNotification('Access denied: Video streaming not permitted', 'error');
            return;
        }
        startVideoStream();
    });
    
    // Confirmation modal flow
    setupConfirmationFlow();
    
    // Schedule form submission
    setupSchedulingSystem();
    
    // Setup streaming controls
    setupStreamingControls();
    
    
    // Check and update scheduled recordings status every minute
    setInterval(checkScheduledRecordings, 60000);
}

// Initialize view toggle functionality
function initializeViewToggle() {
    const gridBtn = document.getElementById('grid-view-btn');
    const listBtn = document.getElementById('list-view-btn');
    const devicesGrid = document.getElementById('devices-grid');
    
    // Load saved view preference
    const savedView = localStorage.getItem('devicesViewMode') || 'grid';
    if (savedView === 'list') {
        devicesGrid.classList.add('list-view');
        gridBtn.classList.remove('active');
        listBtn.classList.add('active');
    }
    
    // Grid view button click
    gridBtn.addEventListener('click', () => {
        devicesGrid.classList.remove('list-view');
        gridBtn.classList.add('active');
        listBtn.classList.remove('active');
        localStorage.setItem('devicesViewMode', 'grid');
    });
    
    // List view button click
    listBtn.addEventListener('click', () => {
        devicesGrid.classList.add('list-view');
        listBtn.classList.add('active');
        gridBtn.classList.remove('active');
        localStorage.setItem('devicesViewMode', 'list');
    });
}

async function loadDevices(silent = false) {
    try {
        // Show loading state only if not silent
        const grid = document.getElementById('devices-grid');
        if (!silent) {
            grid.innerHTML = '<div class="loading-message">Loading devices...</div>';
        }
        
        // Fetch devices from API
        const response = await apiService.getAllDevices();
        
        if (response.success) {
            // The API response structure might be response.data.devices or response.devices
            devices = response.data?.devices || response.devices || response.data || [];
            console.log('Devices loaded from API:', devices.length);
            if (!silent) {
                console.log('API Response structure:', response);
                console.log('Extracted devices:', devices);
            }
            
            // Process each device to set status based on lastSeen timestamp
            devices = devices.map(device => {
                const calculatedStatus = calculateDeviceStatus(device);
                return { ...device, status: calculatedStatus };
            });
            
            if (!silent) {
                console.log('📊 Devices with calculated status:');
                devices.forEach(device => {
                    console.log(`  ${device.device_id} (${device.device_name}): ${device.status}`);
                });
            }
            
            // Initialize device status tracking
            initializeDeviceStatusTracking();
            
            // If no devices, show empty state
            if (devices.length === 0) {
                grid.innerHTML = '<div class="empty-state">No devices available. Please add devices through the admin interface.</div>';
            } else {
                renderDevices();
            }
        } else {
            throw new Error(response.error || 'Failed to load devices');
        }
        
    } catch (error) {
        console.error('Failed to load devices:', error);
        
        // Only show error notifications and UI if not a silent refresh
        if (!silent) {
            showNotification('Failed to load devices. Check your connection.', 'error');
            
            // Show error state
            const grid = document.getElementById('devices-grid');
            grid.innerHTML = '<div class="error-state">Failed to load devices. Please refresh the page.</div>';
            
            devices = [];
        }
        // If silent refresh fails, just keep the existing data
    }
    
    updateStats();
}

function renderDevices() {
    const grid = document.getElementById('devices-grid');
    grid.innerHTML = '';
    
    devices.forEach(device => {
        const card = createDeviceCard(device);
        grid.appendChild(card);
    });
    
    updateStats();
}

// Function to calculate device status based on lastSeen timestamp
function calculateDeviceStatus(device) {
    // Check multiple possible field names for last seen timestamp
    const lastSeen = device.lastSeen || device.last_seen || device.last_updated || device.updated_at;
    
    if (!lastSeen) {
        console.log(`📱 Device ${device.device_id} has no lastSeen timestamp - marking as offline`);
        console.log('Available device properties:', Object.keys(device));
        return 'offline';
    }
    
    try {
        const lastSeenTime = new Date(lastSeen).getTime();
        const now = Date.now();
        const timeDiffMinutes = (now - lastSeenTime) / (1000 * 60); // Convert to minutes
        
        const isOnline = timeDiffMinutes <= 1; // Online if last seen within 1 minute
        
        console.log(`📱 Device ${device.device_id} (${device.device_name}):`, {
            lastSeen: lastSeen,
            timeDiffMinutes: timeDiffMinutes.toFixed(2),
            status: isOnline ? 'online' : 'offline'
        });
        
        return isOnline ? 'online' : 'offline';
    } catch (error) {
        console.error(`❌ Error parsing lastSeen for device ${device.device_id}:`, error);
        return 'offline';
    }
}

function createDeviceCard(device) {
    // Calculate status based on lastSeen timestamp
    const status = calculateDeviceStatus(device);
    
    const card = document.createElement('div');
    card.className = `device-card ${status}`;
    
    // Handle the actual device data format from API - use display_name first, then fallback
    const displayName = device.display_name || device.admin_assigned_name || device.device_name || 'Unknown Device';
    const deviceId = device.device_id;
    const deviceModel = device.device_model || 'Unknown Model';
    const platform = device.platform || 'unknown';
    const osVersion = device.os_version || 'Unknown OS';
    const appVersion = device.app_version || 'Unknown';
    
    const lastSeen = device.lastSeen || device.last_seen || device.last_updated || device.updated_at || 'Never';
    const createdAt = device.created_at || '';
    const isMapped = device.is_mapped === true || !!device.admin_assigned_name;
    
    // Format platform display
    const platformDisplay = platform.charAt(0).toUpperCase() + platform.slice(1);
    
    card.innerHTML = `
        <div class="device-header">
            <h3>${displayName}</h3>
        </div>
        <div class="device-status-group">
            <span class="device-status ${status}" style="color: ${status === 'online' ? '#4CAF50' : '#f44336'}; font-weight: bold;">
                <span style="display: inline-block; width: 8px; height: 8px; background: ${status === 'online' ? '#4CAF50' : '#f44336'}; border-radius: 50%; margin-right: 5px;"></span>
                ${status.toUpperCase()}
            </span>
            ${isMapped ? '<span class="mapping-status mapped">MAPPED</span>' : '<span class="mapping-status unmapped">UNMAPPED</span>'}
        </div>
        <div class="device-info">
            <p><strong>Device ID:</strong> ${deviceId}</p>
            ${device.device_name && device.admin_assigned_name && device.device_name !== device.admin_assigned_name ? 
                `<p><strong>Original Name:</strong> ${device.device_name}</p>` : ''}
            <p><strong>Model:</strong> ${deviceModel}</p>
            <p><strong>Platform:</strong> ${platformDisplay}</p>
            <p><strong>OS Version:</strong> ${osVersion}</p>
            <p><strong>App Version:</strong> ${appVersion}</p>
            <p><strong>Last Seen:</strong> ${formatLastSeen(lastSeen)}</p>
            ${createdAt ? `<p><strong>Registered:</strong> ${formatLastSeen(createdAt)}</p>` : ''}
        </div>
        <div class="device-actions">
            <button class="device-action primary" onclick="showDeviceDetails('${device.device_id}')">VIEW DETAILS</button>
            ${currentUser.role === 'admin' ? `<button class="device-action secondary" onclick="showEditNameModal('${device.device_id}', '${displayName.replace(/'/g, "\\'")}', ${isMapped})">${isMapped ? 'UPDATE NAME' : 'ASSIGN NAME'}</button>` : ''}
        </div>
    `;
    return card;
}

function formatLastSeen(lastSeen) {
    if (!lastSeen || lastSeen === 'Never') return 'Never';
    
    try {
        const date = new Date(lastSeen);
        const now = new Date();
        const diffInMinutes = Math.floor((now - date) / (1000 * 60));
        
        if (diffInMinutes < 1) return 'Just now';
        if (diffInMinutes < 60) return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
        if (diffInMinutes < 1440) {
            const hours = Math.floor(diffInMinutes / 60);
            return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
        }
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } catch (error) {
        return lastSeen;
    }
}

async function showEditNameModal(deviceId, currentName, isMapped) {
    console.log('🎯 showEditNameModal called with:', { deviceId, currentName, isMapped });
    
    // Close any existing modal first
    const existingModal = document.getElementById('edit-name-modal');
    if (existingModal) {
        console.log('🗑️ Removing existing modal');
        existingModal.remove();
    }
    
    // Get fresh device data from API to ensure we have the latest information
    console.log('🔄 Fetching fresh device data...');
    try {
        const deviceResponse = await apiService.getDeviceDetails(deviceId);
        if (!deviceResponse.success || !deviceResponse.device) {
            console.error('❌ Failed to fetch fresh device data:', deviceResponse.error);
            // Fallback to cached device data
            var device = devices.find(d => d.device_id === deviceId);
        } else {
            var device = deviceResponse.device;
            console.log('✅ Using fresh device data:', device);
        }
    } catch (error) {
        console.error('❌ Exception fetching device data:', error);
        // Fallback to cached device data
        var device = devices.find(d => d.device_id === deviceId);
    }
    
    if (!device) {
        console.error('❌ Device not found with device_id:', deviceId);
        return;
    }
    console.log('✅ Final device data:', device);
    
    // Recalculate mapping status based on fresh device data
    const actuallyMapped = device.is_mapped === true || !!device.admin_assigned_name;
    console.log('🔍 Mapping status check:', {
        passedIsMapped: isMapped,
        device_is_mapped: device.is_mapped,
        has_admin_assigned_name: !!device.admin_assigned_name,
        actuallyMapped: actuallyMapped
    });
    
    // Determine the current display name for the input field
    // For updates (mapped devices), clear the field so user can type new name
    // For assignments (unmapped devices), show current name as placeholder
    const currentDisplayName = actuallyMapped ? '' : (device.admin_assigned_name || device.display_name || device.device_name);
    const placeholderText = actuallyMapped ? 
        `Current: ${device.admin_assigned_name || device.display_name || device.device_name}` : 
        'Enter meaningful device name (e.g., Stephen Device)';
    
    console.log('📝 Setting input configuration:', { 
        actuallyMapped, 
        admin_assigned_name: device.admin_assigned_name,
        display_name: device.display_name,
        device_name: device.device_name,
        finalValue: currentDisplayName,
        placeholder: placeholderText
    });
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'edit-name-modal';
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>${actuallyMapped ? 'Update Device Name' : 'Assign Device Name'}</h3>
                <button class="modal-close" onclick="closeModal('edit-name-modal')">&times;</button>
            </div>
            <div class="modal-body">
                <div class="device-info-summary">
                    <p><strong>Device ID:</strong> ${device.device_id}</p>
                    <p><strong>Original Name:</strong> ${device.device_name}</p>
                    <p><strong>Platform:</strong> ${device.platform}</p>
                    ${device.device_model ? `<p><strong>Model:</strong> ${device.device_model}</p>` : ''}
                </div>
                <div class="form-group">
                    <label for="admin-assigned-name">Admin Assigned Name:</label>
                    <input type="text" id="admin-assigned-name" value="${currentDisplayName}" placeholder="${placeholderText}" autocomplete="off">
                    <small>${actuallyMapped ? 'Update the display name for this device' : 'This name will be displayed instead of the original device name'}</small>
                </div>
            </div>
            <div class="modal-footer">
                <button class="action-btn secondary" onclick="closeModal('edit-name-modal')">Cancel</button>
                ${actuallyMapped ? 
                    `<button class="action-btn danger" onclick="unmapDevice('${device.device_id}')">Remove Mapping</button>
                     <button class="action-btn primary" onclick="assignDeviceName('${device.device_id}')">Update Name</button>` :
                    `<button class="action-btn primary" onclick="assignDeviceName('${device.device_id}')">Assign Name</button>`
                }
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.classList.add('active');
    
    // Verify the input field is accessible after modal creation
    setTimeout(() => {
        const inputField = document.getElementById('admin-assigned-name');
        if (inputField) {
            console.log('✅ Input field created successfully:', {
                id: inputField.id,
                value: inputField.value,
                placeholder: inputField.placeholder,
                expectedValue: currentDisplayName,
                valuesMatch: inputField.value === currentDisplayName,
                isMapped: actuallyMapped
            });
            inputField.focus(); // Focus the input field
            
            if (actuallyMapped && inputField.value === '') {
                // For updates (mapped devices), input is empty - ready to type new name
                console.log('🔧 Input cleared for update - ready for new name');
            } else if (inputField.value) {
                // For assignments (unmapped devices), select existing text for easy replacement
                inputField.select();
            }
        } else {
            console.error('❌ Input field not found after modal creation');
        }
    }, 100);
}

async function assignDeviceName(deviceId) {
    console.log('🎯 assignDeviceName UI function called:', { deviceId });
    
    // Get the input field and check if it exists
    const nameInput = document.getElementById('admin-assigned-name');
    if (!nameInput) {
        console.error('❌ Input field "admin-assigned-name" not found');
        showNotification('Input field not found', 'error');
        return;
    }
    
    // Get the current value from the input field
    const name = nameInput.value.trim();
    
    console.log('📝 Device name input details:', { 
        deviceId, 
        name, 
        inputElement: nameInput,
        rawValue: nameInput.value,
        trimmedValue: name
    });
    
    if (!name) {
        console.warn('⚠️ Empty device name provided');
        showNotification('Please enter a device name', 'error');
        nameInput.focus(); // Focus the input field
        return;
    }
    
    // Validate name
    const validation = apiService.validateDeviceName(name);
    console.log('✅ Name validation result:', validation);
    
    if (!validation.valid) {
        console.warn('⚠️ Name validation failed:', validation.error);
        showNotification(validation.error, 'error');
        nameInput.focus(); // Focus the input field
        return;
    }
    
    try {
        console.log('🚀 Calling apiService.assignDeviceName with:', { deviceId, name });
        const response = await apiService.assignDeviceName(deviceId, name);
        
        console.log('📨 assignDeviceName API response:', response);
        
        if (response.success) {
            console.log('✅ Device name updated successfully');
            showNotification('Device name updated successfully!', 'success');
            closeModal('edit-name-modal');
            await loadDevices();
        } else {
            console.error('❌ API returned error:', response.error);
            showNotification(response.error || 'Failed to update device name', 'error');
        }
    } catch (error) {
        console.error('❌ Exception in assignDeviceName:', error);
        showNotification('Failed to update device name. Please try again.', 'error');
    }
}


async function unmapDevice(deviceId) {
    if (!confirm('Are you sure you want to remove the name mapping for this device? It will revert to using the original device name.')) {
        return;
    }
    
    try {
        const response = await apiService.unmapDevice(deviceId);
        
        if (response.success) {
            showNotification('Device unmapped successfully!', 'success');
            closeModal('edit-name-modal');
            await loadDevices();
        } else {
            showNotification(response.error || 'Failed to unmap device', 'error');
        }
    } catch (error) {
        console.error('Failed to unmap device:', error);
        showNotification('Failed to unmap device. Please try again.', 'error');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    }
}

async function showDeviceDetails(deviceId) {
    try {
        // Show loading state
        showNotification('Loading device details...', 'info');
        
        // Fetch device details from API
        const response = await apiService.getDeviceDetails(deviceId);
        
        if (response.success && response.device) {
            // Extract device from response.device (direct from API response)
            selectedDevice = response.device;
            
            // Update modal content with all field names
            const displayName = selectedDevice.display_name || selectedDevice.device_name || 'Unknown Device';
            document.getElementById('device-name').textContent = displayName;
            document.getElementById('device-id').textContent = selectedDevice.device_id || selectedDevice.id;
            document.getElementById('device-original-name').textContent = selectedDevice.device_name || 'N/A';
            document.getElementById('device-model').textContent = selectedDevice.device_model || 'N/A';
            
            // Format platform
            const platform = selectedDevice.platform || 'unknown';
            document.getElementById('device-platform').textContent = platform.charAt(0).toUpperCase() + platform.slice(1);
            
            document.getElementById('device-os').textContent = selectedDevice.os_version || 'N/A';
            document.getElementById('device-app-version').textContent = selectedDevice.app_version || 'N/A';
            
            // Calculate status based on lastSeen timestamp
            const currentStatus = calculateDeviceStatus(selectedDevice);
            
            // Status with styling
            const statusElement = document.getElementById('device-status');
            statusElement.textContent = currentStatus.toUpperCase();
            statusElement.className = currentStatus;
            
            // Add online/offline indicator
            if (currentStatus === 'online') {
                statusElement.style.color = '#4CAF50';
                statusElement.innerHTML = '<span style="display: inline-block; width: 8px; height: 8px; background: #4CAF50; border-radius: 50%; margin-right: 5px;"></span>ONLINE';
            } else {
                statusElement.style.color = '#f44336';
                statusElement.innerHTML = '<span style="display: inline-block; width: 8px; height: 8px; background: #f44336; border-radius: 50%; margin-right: 5px;"></span>OFFLINE';
            }
            
            // Use lastKnownLocation if available, otherwise use lat/lng
            let locationText = 'Unknown';
            if (selectedDevice.lastKnownLocation) {
                const loc = selectedDevice.lastKnownLocation;
                locationText = loc.address || `${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`;
            } else if (selectedDevice.lat && selectedDevice.lng) {
                locationText = `${selectedDevice.lat.toFixed(6)}, ${selectedDevice.lng.toFixed(6)}`;
            }
            document.getElementById('device-location').textContent = locationText;
            
            // Battery
            if (selectedDevice.battery !== null && selectedDevice.battery !== undefined) {
                document.getElementById('device-battery').textContent = `${selectedDevice.battery}%`;
            } else {
                document.getElementById('device-battery').textContent = 'Unknown';
            }
            
            // Last seen - check multiple possible field names
            const lastSeenValue = selectedDevice.lastSeen || selectedDevice.last_seen || selectedDevice.last_updated || selectedDevice.updated_at;
            document.getElementById('device-last-seen').textContent = formatLastSeen(lastSeenValue);
            
            // Created at
            document.getElementById('device-created').textContent = formatLastSeen(selectedDevice.created_at);
            
            // Mapping status - check both is_mapped and admin_assigned_name
            const isMapped = selectedDevice.is_mapped === true || !!selectedDevice.admin_assigned_name;
            const mappingStatus = isMapped ? 'MAPPED' : 'UNMAPPED';
            const mappingElement = document.getElementById('device-mapping-status');
            mappingElement.textContent = mappingStatus;
            mappingElement.className = isMapped ? 'mapped' : 'unmapped';
            
            // Store lat/lng for location features
            if (selectedDevice.lastKnownLocation || (selectedDevice.lat && selectedDevice.lng)) {
                selectedDevice.latitude = selectedDevice.lastKnownLocation?.lat || selectedDevice.lat;
                selectedDevice.longitude = selectedDevice.lastKnownLocation?.lng || selectedDevice.lng;
            }
            
            // Update control buttons based on permissions
            updateControlButtons();
            
            // Populate saved content sections
            await populateSavedContent();
            
            // Show modal
            document.getElementById('device-modal').classList.add('active');
            
            // Start 30-second auto-refresh for device details
            startDeviceDetailsRefresh(selectedDevice.device_id);
        } else {
            throw new Error(response.error || 'Failed to load device details');
        }
        
    } catch (error) {
        console.error('Failed to load device details:', error);
        showNotification('Failed to load device details', 'error');
    }
}

// Function to start 30-second refresh for device details
function startDeviceDetailsRefresh(deviceId) {
    // Clear any existing refresh interval
    stopDeviceDetailsRefresh();
    
    // Set up new refresh interval
    deviceDetailsRefreshInterval = setInterval(async () => {
        // Check if modal is still open
        const modal = document.getElementById('device-modal');
        if (!modal || !modal.classList.contains('active')) {
            stopDeviceDetailsRefresh();
            return;
        }
        
        try {
            // Fetch updated device details
            await refreshDeviceDetails(deviceId);
        } catch (error) {
            console.error('Failed to refresh device details:', error);
        }
    }, 30000); // 30 seconds
}

// Function to stop device details refresh
function stopDeviceDetailsRefresh() {
    if (deviceDetailsRefreshInterval) {
        clearInterval(deviceDetailsRefreshInterval);
        deviceDetailsRefreshInterval = null;
    }
}

// Function to refresh device details without closing modal
async function refreshDeviceDetails(deviceId) {
    try {
        // Fetch device details from API
        const response = await apiService.getDeviceDetails(deviceId);
        
        if (response.success && response.device) {
            const device = response.device;
            
            // Update selectedDevice
            selectedDevice = device;
            
            // Update only the dynamic content (status, location, battery, last seen)
            // Calculate status based on lastSeen timestamp
            const currentStatus = calculateDeviceStatus(device);
            
            // Update status with styling
            const statusElement = document.getElementById('device-status');
            statusElement.textContent = currentStatus.toUpperCase();
            statusElement.className = currentStatus;
            
            // Add online/offline indicator
            if (currentStatus === 'online') {
                statusElement.style.color = '#4CAF50';
                statusElement.innerHTML = '<span style="display: inline-block; width: 8px; height: 8px; background: #4CAF50; border-radius: 50%; margin-right: 5px;"></span>ONLINE';
            } else {
                statusElement.style.color = '#f44336';
                statusElement.innerHTML = '<span style="display: inline-block; width: 8px; height: 8px; background: #f44336; border-radius: 50%; margin-right: 5px;"></span>OFFLINE';
            }
            
            // Update location
            let locationText = 'Unknown';
            if (device.lastKnownLocation) {
                const loc = device.lastKnownLocation;
                locationText = loc.address || `${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`;
            } else if (device.lat && device.lng) {
                locationText = `${device.lat.toFixed(6)}, ${device.lng.toFixed(6)}`;
            }
            document.getElementById('device-location').textContent = locationText;
            
            // Update battery
            if (device.battery !== null && device.battery !== undefined) {
                document.getElementById('device-battery').textContent = `${device.battery}%`;
            } else {
                document.getElementById('device-battery').textContent = 'Unknown';
            }
            
            // Update last seen - check multiple possible field names
            const lastSeenValue = device.lastSeen || device.last_seen || device.last_updated || device.updated_at;
            document.getElementById('device-last-seen').textContent = formatLastSeen(lastSeenValue);
            
            // Update mapping status - check both is_mapped and admin_assigned_name
            const isMapped = device.is_mapped === true || !!device.admin_assigned_name;
            const mappingStatus = isMapped ? 'MAPPED' : 'UNMAPPED';
            const mappingElement = document.getElementById('device-mapping-status');
            mappingElement.textContent = mappingStatus;
            mappingElement.className = isMapped ? 'mapped' : 'unmapped';
            
            console.log(`Device details refreshed for ${deviceId} at ${new Date().toLocaleTimeString()}`);
        }
    } catch (error) {
        console.error('Failed to refresh device details:', error);
        // Don't show error notification for silent refresh
    }
}

function hasPermission(permission) {
    return currentUser.permissions && currentUser.permissions.includes(permission);
}

function updateControlButtons() {
    console.log('🔧 Updating control buttons based on user permissions:', currentUser.permissions);
    
    // Audio recording button
    const audioBtn = document.getElementById('record-audio');
    if (!hasPermission('audio')) {
        audioBtn.style.display = 'none';
    } else {
        audioBtn.style.display = 'flex';
        audioBtn.classList.remove('disabled');
        audioBtn.style.opacity = '1';
        audioBtn.style.cursor = 'pointer';
    }
    
    // Video recording button
    const videoBtn = document.getElementById('record-video');
    if (!hasPermission('video')) {
        videoBtn.style.display = 'none';
    } else {
        videoBtn.style.display = 'flex';
        videoBtn.classList.remove('disabled');
        videoBtn.style.opacity = '1';
        videoBtn.style.cursor = 'pointer';
    }
    
    // Audio streaming button
    const streamAudioBtn = document.getElementById('stream-audio');
    if (!hasPermission('audio')) {
        streamAudioBtn.style.display = 'none';
    } else {
        streamAudioBtn.style.display = 'flex';
    }
    
    // Video streaming button
    const streamVideoBtn = document.getElementById('stream-video');
    if (!hasPermission('video')) {
        streamVideoBtn.style.display = 'none';
    } else {
        streamVideoBtn.style.display = 'flex';
    }
    
    // Live location button
    const locationBtn = document.getElementById('live-location');
    if (!hasPermission('location')) {
        locationBtn.style.display = 'none';
    } else {
        locationBtn.style.display = 'flex';
        locationBtn.classList.remove('disabled');
        locationBtn.style.opacity = '1';
        locationBtn.style.cursor = 'pointer';
    }
    
    // Schedule recording button (requires at least audio or video permission)
    const scheduleBtn = document.getElementById('schedule-recording');
    if (!hasPermission('audio') && !hasPermission('video')) {
        scheduleBtn.style.display = 'none';
    } else {
        scheduleBtn.style.display = 'flex';
    }
    
    // Remove device button (admin only)
    const removeBtn = document.getElementById('remove-device');
    if (currentUser.role !== 'admin') {
        removeBtn.style.display = 'none';
    } else {
        removeBtn.style.display = 'flex';
    }
    
    // Hide/show saved content sections based on permissions
    const audioSection = document.getElementById('audio-section');
    if (audioSection) {
        audioSection.style.display = hasPermission('audio') ? 'block' : 'none';
    }
    
    const videoSection = document.getElementById('video-section');
    if (videoSection) {
        videoSection.style.display = hasPermission('video') ? 'block' : 'none';
    }
    
    const locationSection = document.getElementById('location-section');
    if (locationSection) {
        locationSection.style.display = hasPermission('location') ? 'block' : 'none';
    }
    
    console.log('✅ Control buttons and sections updated:', {
        audio: hasPermission('audio'),
        video: hasPermission('video'),
        location: hasPermission('location'),
        isAdmin: currentUser.role === 'admin'
    });
}


async function toggleLiveLocation() {
    const locationDisplay = document.getElementById('location-display');
    const btn = document.getElementById('live-location');
    
    if (locationDisplay.classList.contains('hidden')) {
        try {
            // Start location tracking via API
            const response = await apiService.startLocationTracking(selectedDevice.device_id);
            if (response.success) {
                locationDisplay.classList.remove('hidden');
                btn.classList.add('active');
                showNotification('Location tracking started', 'info');
                
                // Start live location updates
                updateLiveLocation();
                
                // Update location every 5 seconds
                selectedDevice.locationInterval = setInterval(() => {
                    if (!document.getElementById('device-modal').classList.contains('active')) {
                        clearInterval(selectedDevice.locationInterval);
                        return;
                    }
                    updateLiveLocation();
                }, 5000);
            } else {
                showNotification(`Failed to start location tracking: ${response.error}`, 'error');
            }
        } catch (error) {
            showNotification(`Error starting location tracking: ${error.message}`, 'error');
        }
    } else {
        try {
            // Stop location tracking via API
            const response = await apiService.stopLocationTracking(selectedDevice.device_id);
            if (response.success) {
                locationDisplay.classList.add('hidden');
                btn.classList.remove('active');
                showNotification('Location tracking stopped', 'info');
                
                // Stop location updates
                if (selectedDevice.locationInterval) {
                    clearInterval(selectedDevice.locationInterval);
                    selectedDevice.locationInterval = null;
                }
            } else {
                showNotification(`Failed to stop location tracking: ${response.error}`, 'error');
            }
        } catch (error) {
            showNotification(`Error stopping location tracking: ${error.message}`, 'error');
        }
    }
}

async function updateLiveLocation() {
    try {
        const response = await apiService.getDeviceLiveLocation(selectedDevice.device_id);
        
        if (response.success && response.location) {
            const location = response.location;
            
            // Check if location data is available
            if (location.lat !== null && location.lng !== null) {
                document.getElementById('lat').textContent = location.lat.toFixed(4);
                document.getElementById('lng').textContent = location.lng.toFixed(4);
                document.getElementById('location-time').textContent = 
                    location.timestamp ? new Date(location.timestamp).toLocaleTimeString() : 'Live';
                
                // Update selected device location
                selectedDevice.lat = location.lat;
                selectedDevice.lng = location.lng;
                selectedDevice.lastSeen = location.timestamp || new Date().toISOString();
                
                // Update device status to online since we received location data
                updateDeviceStatusOnline(selectedDevice.device_id, {
                    lat: location.lat,
                    lng: location.lng,
                    address: location.address
                });
                
            } else {
                document.getElementById('lat').textContent = 'N/A';
                document.getElementById('lng').textContent = 'N/A';
                document.getElementById('location-time').textContent = 'No location data';
            }
        } else {
            document.getElementById('lat').textContent = 'N/A';
            document.getElementById('lng').textContent = 'N/A';
            document.getElementById('location-time').textContent = 'No location data';
        }
    } catch (error) {
        console.error('Failed to get live location:', error);
        showNotification('Failed to update location', 'error');
        document.getElementById('lat').textContent = 'Error';
        document.getElementById('lng').textContent = 'Error';
        document.getElementById('location-time').textContent = 'Failed to update';
    }
}

// Global map instance
let deviceMap = null;

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

// Device status tracking
const deviceStatusTracker = {
    timers: new Map(), // Device ID -> timeout ID
    lastActivity: new Map(), // Device ID -> timestamp
    OFFLINE_TIMEOUT: 5 * 60 * 1000 // 5 minutes in milliseconds
};

// Function to update device status to online when location is received
function updateDeviceStatusOnline(deviceId, locationData = null) {
    const now = Date.now();
    const nowISO = new Date().toISOString();
    deviceStatusTracker.lastActivity.set(deviceId, now);
    
    // Update device's lastKnownLocation when a location ping is received
    const device = devices.find(d => d.device_id === deviceId);
    if (device) {
        // Update last seen timestamp
        device.lastSeen = nowISO;
        
        // Update or create lastKnownLocation with current timestamp
        if (locationData) {
            device.lastKnownLocation = {
                lat: locationData.lat,
                lng: locationData.lng,
                timestamp: nowISO,
                address: locationData.address || null
            };
        } else if (!device.lastKnownLocation) {
            // If no specific location data provided, create minimal location object
            device.lastKnownLocation = {
                timestamp: nowISO
            };
        } else {
            // Update existing location timestamp
            device.lastKnownLocation.timestamp = nowISO;
        }
    }
    
    // Clear existing offline timer for this device
    if (deviceStatusTracker.timers.has(deviceId)) {
        clearTimeout(deviceStatusTracker.timers.get(deviceId));
        deviceStatusTracker.timers.delete(deviceId);
    }
    
    // Re-render devices to show updated status
    renderDevices();
    
    // Set new offline timer
    const timeoutId = setTimeout(() => {
        updateDeviceStatusOffline(deviceId);
    }, deviceStatusTracker.OFFLINE_TIMEOUT);
    
    deviceStatusTracker.timers.set(deviceId, timeoutId);
    
    console.log(`Device ${deviceId} status updated to ONLINE - location received at ${new Date().toLocaleTimeString()}`);
}

// Function to update device status to offline after timeout
function updateDeviceStatusOffline(deviceId) {
    // Clear timer
    if (deviceStatusTracker.timers.has(deviceId)) {
        clearTimeout(deviceStatusTracker.timers.get(deviceId));
        deviceStatusTracker.timers.delete(deviceId);
    }
    
    // Re-render devices to show updated status
    renderDevices();
    
    console.log(`Device ${deviceId} status updated to OFFLINE - no location for 5 minutes`);
}

// Function to update device status in local devices array and UI
function updateLocalDeviceStatus(deviceId, status) {
    // Update in devices array
    const deviceIndex = devices.findIndex(d => d.device_id === deviceId);
    if (deviceIndex !== -1) {
        devices[deviceIndex].status = status;
        
        // Update the device card if it exists
        updateDeviceCardStatus(deviceId, status);
    }
    
    // Update in selectedDevice if it matches
    if (selectedDevice && selectedDevice.device_id === deviceId) {
        selectedDevice.status = status;
        
        // Update device details modal if open
        const deviceModal = document.getElementById('device-modal');
        if (deviceModal && deviceModal.classList.contains('active')) {
            updateDeviceDetailsStatus(status);
        }
    }
    
    // Update statistics
    updateStats();
}

// Function to update device card status in the grid
function updateDeviceCardStatus(deviceId, status) {
    const deviceCards = document.querySelectorAll('.device-card');
    deviceCards.forEach(card => {
        // Find the card by checking the onclick attribute or data attribute
        const viewDetailsBtn = card.querySelector('[onclick*="showDeviceDetails"]');
        if (viewDetailsBtn) {
            const onclickAttr = viewDetailsBtn.getAttribute('onclick');
            if (onclickAttr && onclickAttr.includes(deviceId)) {
                // Update card class
                card.className = `device-card ${status}`;
                
                // Update status text in card with styling
                const statusElement = card.querySelector('.device-status');
                if (statusElement) {
                    statusElement.className = `device-status ${status}`;
                    statusElement.style.color = status === 'online' ? '#4CAF50' : '#f44336';
                    statusElement.style.fontWeight = 'bold';
                    statusElement.innerHTML = `<span style="display: inline-block; width: 8px; height: 8px; background: ${status === 'online' ? '#4CAF50' : '#f44336'}; border-radius: 50%; margin-right: 5px;"></span>${status.toUpperCase()}`;
                }
            }
        }
    });
}

// Function to update device details modal status
function updateDeviceDetailsStatus(status) {
    const statusElement = document.getElementById('device-status');
    if (statusElement) {
        statusElement.textContent = status.toUpperCase();
        statusElement.className = status;
    }
}

// Function to initialize device status tracking for all devices
function initializeDeviceStatusTracking() {
    devices.forEach(device => {
        // Check if device has valid location data
        let hasValidLocation = false;
        let lastLocationTime = null;
        
        if (device.lastKnownLocation && 
            device.lastKnownLocation.timestamp && 
            (device.lastKnownLocation.lat !== undefined || device.lastKnownLocation.lng !== undefined)) {
            lastLocationTime = new Date(device.lastKnownLocation.timestamp).getTime();
            hasValidLocation = true;
        }
        
        if (hasValidLocation && lastLocationTime) {
            const now = Date.now();
            const timeSinceLastLocation = now - lastLocationTime;
            
            if (timeSinceLastLocation < deviceStatusTracker.OFFLINE_TIMEOUT) {
                // Device has recent location, set timer for remaining time
                const remainingTime = deviceStatusTracker.OFFLINE_TIMEOUT - timeSinceLastLocation;
                deviceStatusTracker.lastActivity.set(device.device_id, lastLocationTime);
                
                const timeoutId = setTimeout(() => {
                    updateDeviceStatusOffline(device.device_id);
                }, remainingTime);
                
                deviceStatusTracker.timers.set(device.device_id, timeoutId);
                
                // Status should already be set correctly by getDeviceStatusFromLocation
            } else {
                // Location is too old, device should be offline
                if (device.status !== 'offline') {
                    updateLocalDeviceStatus(device.device_id, 'offline');
                }
            }
        } else {
            // No valid location data, device should be offline
            if (device.status !== 'offline') {
                updateLocalDeviceStatus(device.device_id, 'offline');
            }
        }
    });
}

// Function to simulate location updates (for testing)
function simulateLocationUpdate(deviceId, lat, lng) {
    updateDeviceStatusOnline(deviceId);
    
    // Update device location data
    const deviceIndex = devices.findIndex(d => d.device_id === deviceId);
    if (deviceIndex !== -1) {
        devices[deviceIndex].lat = lat;
        devices[deviceIndex].lng = lng;
        devices[deviceIndex].lastSeen = new Date().toISOString();
        
        if (devices[deviceIndex].lastKnownLocation) {
            devices[deviceIndex].lastKnownLocation.lat = lat;
            devices[deviceIndex].lastKnownLocation.lng = lng;
            devices[deviceIndex].lastKnownLocation.timestamp = new Date().toISOString();
        }
    }
    
    showNotification(`Location update received for device ${deviceId} - Status: ONLINE`, 'info');
}

// Function to clean up all device status timers (call when closing app)
function cleanupDeviceStatusTracking() {
    deviceStatusTracker.timers.forEach(timeoutId => {
        clearTimeout(timeoutId);
    });
    deviceStatusTracker.timers.clear();
    deviceStatusTracker.lastActivity.clear();
    console.log('Device status tracking cleanup completed');
}

// Add cleanup when page unloads
window.addEventListener('beforeunload', cleanupDeviceStatusTracking);

// Testing functions for the admin panel
function testLocationUpdate() {
    if (devices.length === 0) {
        showNotification('No devices available for testing', 'error');
        return;
    }
    
    // Pick a random device or use the first one
    const device = devices[0];
    
    // Generate random coordinates near the current location or default location
    const baseLat = device.lat || 9.0793049;
    const baseLng = device.lng || 7.4088214;
    
    // Add small random offset to simulate movement
    const newLat = baseLat + (Math.random() - 0.5) * 0.001; // ~100m range
    const newLng = baseLng + (Math.random() - 0.5) * 0.001;
    
    simulateLocationUpdate(device.device_id, newLat, newLng);
}

function showStatusTrackingInfo() {
    const info = [];
    info.push(`Total devices: ${devices.length}`);
    info.push(`Active timers: ${deviceStatusTracker.timers.size}`);
    info.push(`Tracked devices: ${deviceStatusTracker.lastActivity.size}`);
    info.push(`Offline timeout: ${deviceStatusTracker.OFFLINE_TIMEOUT / 1000 / 60} minutes`);
    
    let deviceStatus = '\n\nDevice Status:';
    devices.forEach(device => {
        const lastActivity = deviceStatusTracker.lastActivity.get(device.device_id);
        const hasTimer = deviceStatusTracker.timers.has(device.device_id);
        const timeSinceActivity = lastActivity ? Date.now() - lastActivity : 'Never';
        
        deviceStatus += `\n${device.display_name || device.device_name}:`;
        deviceStatus += `\n  Status: ${device.status}`;
        deviceStatus += `\n  Has Timer: ${hasTimer}`;
        deviceStatus += `\n  Last Activity: ${timeSinceActivity === 'Never' ? 'Never' : Math.round(timeSinceActivity / 1000) + 's ago'}`;
    });
    
    alert(info.join('\n') + deviceStatus);
}

// Make testing functions available globally
window.testLocationUpdate = testLocationUpdate;
window.showStatusTrackingInfo = showStatusTrackingInfo;

function openInGoogleMaps() {
    if (!selectedDevice) {
        showNotification('No device selected', 'error');
        return;
    }
    
    const lat = selectedDevice.latitude || selectedDevice.lat;
    const lng = selectedDevice.longitude || selectedDevice.lng;
    
    if (!lat || !lng) {
        showNotification('No location data available for this device', 'error');
        return;
    }
    
    openMapModal(lat, lng, selectedDevice.display_name || selectedDevice.device_name || 'Device', 'current');
}

function openMapModal(lat, lng, deviceName, locationType = 'current') {
    // Set modal title
    const title = locationType === 'current' ? `${deviceName} - Current Location` : 
                  locationType === 'last_known' ? `${deviceName} - Last Known Location` : 
                  `${deviceName} - Location`;
    document.getElementById('map-title').textContent = title;
    
    // Update map info
    document.getElementById('map-coordinates').textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    
    // Set timestamp based on location type
    let timestamp = 'N/A';
    if (selectedDevice && selectedDevice.lastKnownLocation && selectedDevice.lastKnownLocation.timestamp) {
        timestamp = formatLastSeen(selectedDevice.lastKnownLocation.timestamp);
    } else if (selectedDevice && selectedDevice.lastSeen) {
        timestamp = formatLastSeen(selectedDevice.lastSeen);
    }
    document.getElementById('map-timestamp').textContent = timestamp;
    
    // Set address
    const address = (selectedDevice && selectedDevice.lastKnownLocation && selectedDevice.lastKnownLocation.address) || 'Address not available';
    document.getElementById('map-address').textContent = address;
    
    // Show modal
    document.getElementById('map-modal').classList.add('active');
    
    // Initialize map after a short delay to ensure the modal is visible
    setTimeout(() => {
        initializeMap(lat, lng, deviceName, locationType);
        
        // Add resize handler to ensure map displays correctly
        window.addEventListener('resize', () => {
            if (deviceMap) {
                setTimeout(() => {
                    deviceMap.invalidateSize();
                }, 100);
            }
        });
    }, 100);
}

function initializeMap(lat, lng, deviceName, locationType) {
    // Remove existing map if any
    if (deviceMap) {
        deviceMap.remove();
        deviceMap = null;
    }
    
    // Create new map
    deviceMap = L.map('map-container').setView([lat, lng], 15);
    
    // Add tile layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(deviceMap);
    
    // Create marker icon based on location type
    let markerColor = 'red';
    let iconText = '📍';
    
    if (locationType === 'last_known') {
        markerColor = 'blue';
        iconText = '📌';
    }
    
    // Create custom marker
    const marker = L.marker([lat, lng]).addTo(deviceMap);
    
    // Create popup content
    const popupContent = `
        <div style="color: #fff;">
            <strong>${deviceName}</strong><br>
            <em>${locationType === 'current' ? 'Current Location' : 'Last Known Location'}</em><br>
            <strong>Coordinates:</strong> ${lat.toFixed(6)}, ${lng.toFixed(6)}<br>
            ${selectedDevice && selectedDevice.lastKnownLocation && selectedDevice.lastKnownLocation.address ? 
                `<strong>Address:</strong> ${selectedDevice.lastKnownLocation.address}` : ''}
        </div>
    `;
    
    marker.bindPopup(popupContent).openPopup();
    
    // Add circle to show accuracy area
    L.circle([lat, lng], {
        color: markerColor,
        fillColor: markerColor,
        fillOpacity: 0.1,
        radius: 50 // 50 meter radius
    }).addTo(deviceMap);
}

async function populateSavedContent() {
    if (!selectedDevice) return;
    
    // Populate audio recordings
    const audioContainer = document.getElementById('audio-recordings');
    audioContainer.innerHTML = '<div class="loading-message">Loading audio recordings...</div>';
    
    if (hasPermission('audio')) {
        try {
            const response = await apiService.getDeviceRecordings(selectedDevice.device_id);
            if (response.success && response.data.recordings && response.data.recordings.length > 0) {
                audioContainer.innerHTML = '';
                response.data.recordings.forEach(recording => {
                    const recordingEl = createRecordingElement(recording, 'audio');
                    audioContainer.appendChild(recordingEl);
                });
            } else {
                audioContainer.innerHTML = '<div class="no-content">No audio recordings found</div>';
            }
        } catch (error) {
            audioContainer.innerHTML = '<div class="no-content">Failed to load audio recordings</div>';
        }
    } else {
        audioContainer.innerHTML = '<div class="no-content">Access denied - Audio permission required</div>';
    }
    
    // Populate video recordings
    const videoContainer = document.getElementById('video-recordings');
    videoContainer.innerHTML = '<div class="loading-message">Loading video recordings...</div>';
    
    if (hasPermission('video')) {
        try {
            const response = await apiService.getDeviceVideoRecordings(selectedDevice.device_id);
            if (response.success && response.data.recordings && response.data.recordings.length > 0) {
                videoContainer.innerHTML = '';
                response.data.recordings.forEach(recording => {
                    const recordingEl = createRecordingElement(recording, 'video');
                    videoContainer.appendChild(recordingEl);
                });
            } else {
                videoContainer.innerHTML = '<div class="no-content">No video recordings found</div>';
            }
        } catch (error) {
            videoContainer.innerHTML = '<div class="no-content">Failed to load video recordings</div>';
        }
    } else {
        videoContainer.innerHTML = '<div class="no-content">Access denied - Video permission required</div>';
    }
    
    // Populate last known location
    const locationContainer = document.getElementById('last-location');
    locationContainer.innerHTML = '<div class="loading-message">Loading location...</div>';
    
    if (hasPermission('location')) {
        try {
            const response = await apiService.getLastKnownLocation(selectedDevice.device_id);
            if (response.success && response.data.location) {
                const location = response.data.location;
                locationContainer.innerHTML = `
                    <div class="location-details">
                        <div class="location-item">
                            <span class="location-label">Address:</span>
                            <span class="location-value">${location.address || 'N/A'}</span>
                        </div>
                        <div class="location-item">
                            <span class="location-label">Coordinates:</span>
                            <span class="location-value">${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}</span>
                        </div>
                        <div class="location-item">
                            <span class="location-label">Last Seen:</span>
                            <span class="location-value">${new Date(location.timestamp).toLocaleString()}</span>
                        </div>
                        <button class="action-btn secondary" onclick="openLastKnownLocation()">
                            <span class="control-icon">🗺️</span>
                            <span>VIEW ON MAP</span>
                        </button>
                        <button class="action-btn secondary" onclick="showLocationHistory()" style="margin-top: 0.5rem;">
                            <span class="control-icon">📍</span>
                            <span>VIEW HISTORY</span>
                        </button>
                    </div>
                `;
                // Store location for Google Maps functionality
                selectedDevice.lastKnownLocation = location;
            } else {
                locationContainer.innerHTML = '<div class="no-content">No location data available</div>';
            }
        } catch (error) {
            console.error('Failed to get last known location:', error);
            locationContainer.innerHTML = '<div class="no-content">Failed to load location data</div>';
        }
    } else {
        locationContainer.innerHTML = '<div class="no-content">Access denied - Location permission required</div>';
    }
}

function createRecordingElement(recording, type) {
    const recordingEl = document.createElement('div');
    recordingEl.className = 'recording-item';
    
    recordingEl.innerHTML = `
        <div class="recording-header">
            <span class="recording-filename">${recording.filename}</span>
            <span class="recording-size">${recording.size}</span>
        </div>
        <div class="recording-details">
            <span class="recording-timestamp">${recording.timestamp}</span>
            <span class="recording-duration">Duration: ${recording.duration}</span>
            <span class="recording-quality">Quality: ${recording.quality}</span>
        </div>
        <div class="recording-actions">
            <button class="recording-btn play" onclick="playRecording('${recording.id}', '${type}')">
                <span>▶️ PLAY</span>
            </button>
            <button class="recording-btn download" onclick="downloadRecording('${recording.id}', '${type}')">
                <span>💾 DOWNLOAD</span>
            </button>
            <button class="recording-btn delete" onclick="deleteRecording('${recording.id}', '${type}')">
                <span>🗑️ DELETE</span>
            </button>
        </div>
    `;
    
    return recordingEl;
}

function openLastKnownLocation() {
    if (!selectedDevice || !selectedDevice.lastKnownLocation) {
        showNotification('No last known location available', 'error');
        return;
    }
    
    const location = selectedDevice.lastKnownLocation;
    openMapModal(location.lat, location.lng, selectedDevice.display_name || selectedDevice.device_name || 'Device', 'last_known');
}

async function showLocationHistory() {
    if (!selectedDevice) {
        showNotification('No device selected', 'error');
        return;
    }
    
    if (!hasPermission('location')) {
        showNotification('Access denied: Location permission required', 'error');
        return;
    }
    
    try {
        const response = await apiService.getLocationHistory(selectedDevice.device_id, 10);
        
        if (response.success && response.data.locations && response.data.locations.length > 0) {
            const locations = response.data.locations;
            
            let historyHtml = `
                <div class="modal" id="location-history-modal">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h2>Location History - ${selectedDevice.display_name || selectedDevice.device_name}</h2>
                            <button class="close-modal">&times;</button>
                        </div>
                        <div class="location-history-list">
            `;
            
            locations.forEach((location, index) => {
                const date = new Date(location.timestamp);
                historyHtml += `
                    <div class="location-history-item ${location.isLastKnown ? 'current' : ''}">
                        <div class="location-header">
                            <span class="location-time">${date.toLocaleString()}</span>
                            ${location.isLastKnown ? '<span class="current-badge">CURRENT</span>' : ''}
                        </div>
                        <div class="location-details">
                            <p><strong>Address:</strong> ${location.address || 'N/A'}</p>
                            <p><strong>Coordinates:</strong> ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}</p>
                        </div>
                        <button class="location-map-btn" onclick="openLocationInMaps(${location.lat}, ${location.lng}, '${location.address || 'Location'}')">
                            View on Map
                        </button>
                    </div>
                `;
            });
            
            historyHtml += `
                        </div>
                    </div>
                </div>
            `;
            
            // Add modal to page
            document.body.insertAdjacentHTML('beforeend', historyHtml);
            
            // Show modal
            document.getElementById('location-history-modal').classList.add('active');
            
            // Add close functionality
            document.querySelector('#location-history-modal .close-modal').addEventListener('click', () => {
                document.getElementById('location-history-modal').remove();
            });
            
        } else {
            showNotification('No location history available', 'info');
        }
    } catch (error) {
        console.error('Failed to get location history:', error);
        showNotification('Failed to load location history', 'error');
    }
}

function openLocationInMaps(lat, lng, address) {
    // Create a temporary device object for the map
    const tempDevice = {
        lastKnownLocation: {
            lat: lat,
            lng: lng,
            address: address,
            timestamp: new Date().toISOString()
        },
        display_name: address || 'Location'
    };
    
    const originalDevice = selectedDevice;
    selectedDevice = tempDevice;
    
    openMapModal(lat, lng, address || 'Historical Location', 'last_known');
    
    // Restore original device after a delay
    setTimeout(() => {
        selectedDevice = originalDevice;
    }, 500);
}

function playRecording(recordingId, type) {
    showNotification(`Playing ${type} recording: ${recordingId}`, 'info');
    // Here you would implement actual playback functionality
}

async function downloadRecording(recordingId, type) {
    try {
        showNotification('Starting download...', 'info');
        let response;
        
        if (type === 'audio') {
            response = await apiService.downloadAudioRecording(recordingId);
        } else if (type === 'video') {
            response = await apiService.downloadVideoRecording(recordingId);
        } else {
            showNotification('Unsupported recording type', 'error');
            return;
        }
        
        if (response.success) {
            // Create download link
            const url = window.URL.createObjectURL(response.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = response.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            showNotification('Download completed', 'success');
        } else {
            showNotification(`Download failed: ${response.error}`, 'error');
        }
    } catch (error) {
        showNotification(`Download error: ${error.message}`, 'error');
    }
}

async function startAudioRecording() {
    try {
        const response = await apiService.startAudioRecording(selectedDevice.device_id);
        if (response.success) {
            showNotification('Audio recording started...', 'info');
            // Store the recording ID for stopping later
            selectedDevice.activeAudioRecording = response.data.recordingId;
            updateRecordButtonState(true);
        } else {
            showNotification(`Failed to start recording: ${response.error}`, 'error');
        }
    } catch (error) {
        showNotification(`Error starting recording: ${error.message}`, 'error');
    }
}

async function stopAudioRecording() {
    try {
        const response = await apiService.stopAudioRecording(selectedDevice.device_id, selectedDevice.activeAudioRecording);
        if (response.success) {
            showNotification('Audio recording stopped and saved', 'success');
            selectedDevice.activeAudioRecording = null;
            updateRecordButtonState(false);
            // Refresh the recordings list
            populateSavedContent();
        } else {
            showNotification(`Failed to stop recording: ${response.error}`, 'error');
        }
    } catch (error) {
        showNotification(`Error stopping recording: ${error.message}`, 'error');
    }
}

function updateRecordButtonState(isRecording) {
    const recordBtn = document.getElementById('record-audio');
    const textSpan = recordBtn.querySelector('span:last-child');
    
    if (isRecording) {
        recordBtn.classList.add('active');
        textSpan.textContent = 'STOP RECORDING';
    } else {
        recordBtn.classList.remove('active');
        textSpan.textContent = 'RECORD AUDIO';
    }
}

async function startVideoRecording() {
    try {
        const response = await apiService.startVideoRecording(selectedDevice.device_id);
        if (response.success) {
            showNotification('Video recording started...', 'info');
            // Store the recording ID for stopping later
            selectedDevice.activeVideoRecording = response.data.recordingId;
            updateVideoRecordButtonState(true);
        } else {
            showNotification(`Failed to start video recording: ${response.error}`, 'error');
        }
    } catch (error) {
        showNotification(`Error starting video recording: ${error.message}`, 'error');
    }
}

async function stopVideoRecording() {
    try {
        const response = await apiService.stopVideoRecording(selectedDevice.device_id, selectedDevice.activeVideoRecording);
        if (response.success) {
            showNotification('Video recording stopped and saved', 'success');
            selectedDevice.activeVideoRecording = null;
            updateVideoRecordButtonState(false);
            // Refresh the recordings list
            populateSavedContent();
        } else {
            showNotification(`Failed to stop video recording: ${response.error}`, 'error');
        }
    } catch (error) {
        showNotification(`Error stopping video recording: ${error.message}`, 'error');
    }
}

function updateVideoRecordButtonState(isRecording) {
    const recordBtn = document.getElementById('record-video');
    const textSpan = recordBtn.querySelector('span:last-child');
    
    if (isRecording) {
        recordBtn.classList.add('active');
        textSpan.textContent = 'STOP RECORDING';
    } else {
        recordBtn.classList.remove('active');
        textSpan.textContent = 'RECORD VIDEO';
    }
}

async function deleteRecording(recordingId, type) {
    if (!confirm('Are you sure you want to delete this recording? This action cannot be undone.')) {
        return;
    }
    
    try {
        let response;
        
        if (type === 'audio') {
            response = await apiService.deleteAudioRecording(recordingId);
        } else if (type === 'video') {
            response = await apiService.deleteVideoRecording(recordingId);
        } else {
            showNotification('Unsupported recording type', 'error');
            return;
        }
        
        if (response.success) {
            showNotification('Recording deleted successfully', 'success');
            // Refresh the recordings list
            populateSavedContent();
        } else {
            showNotification(`Delete failed: ${response.error}`, 'error');
        }
    } catch (error) {
        showNotification(`Delete error: ${error.message}`, 'error');
    }
}

function initiateDeviceRemoval() {
    document.getElementById('confirm-modal-1').classList.add('active');
}

function setupConfirmationFlow() {
    // First confirmation
    document.querySelector('#confirm-modal-1 .continue-btn').addEventListener('click', () => {
        document.getElementById('confirm-modal-1').classList.remove('active');
        document.getElementById('confirm-modal-2').classList.add('active');
    });
    
    // Second confirmation
    document.querySelector('#confirm-modal-2 .continue-btn').addEventListener('click', () => {
        document.getElementById('confirm-modal-2').classList.remove('active');
        document.getElementById('confirm-modal-3').classList.add('active');
    });
    
    // Final confirmation input
    document.getElementById('confirm-input').addEventListener('input', (e) => {
        const finalBtn = document.getElementById('final-confirm-btn');
        finalBtn.disabled = e.target.value !== 'REMOVE';
    });
    
    // Final removal
    document.getElementById('final-confirm-btn').addEventListener('click', () => {
        removeDevice();
    });
}

async function removeDevice() {
    if (!selectedDevice) return;
    
    try {
        // Call API to remove device
        const response = await apiService.removeDevice(selectedDevice.device_id);
        
        if (response.success) {
            showNotification(`Device ${selectedDevice.display_name || selectedDevice.device_name} has been removed from tracking`, 'success');
            
            // Close modals and refresh device list
            closeAllModals();
            selectedDevice = null;
            
            // Reload devices from API
            await loadDevices();
        } else {
            throw new Error(response.error || 'Failed to remove device');
        }
        
    } catch (error) {
        console.error('Failed to remove device:', error);
        showNotification('Failed to remove device. Please try again.', 'error');
    }
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
    document.getElementById('confirm-input').value = '';
    document.getElementById('final-confirm-btn').disabled = true;
    document.getElementById('location-display').classList.add('hidden');
    document.getElementById('live-location').classList.remove('active');
    
    // Clean up map if closing map modal
    if (deviceMap) {
        deviceMap.remove();
        deviceMap = null;
    }
    
    // Reset schedule form if closing schedule modal
    if (document.getElementById('schedule-modal').classList.contains('active')) {
        document.getElementById('schedule-form').reset();
    }
    
    // Stop stream if closing stream modal
    if (document.getElementById('stream-modal').classList.contains('active') && currentStream) {
        stopStream();
    }
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
}

function filterDevices(searchTerm) {
    const searchLower = searchTerm.toLowerCase();
    const filtered = devices.filter(device => {
        const displayName = device.display_name || device.admin_assigned_name || device.device_name || '';
        const deviceId = device.device_id || '';
        const deviceModel = device.device_model || '';
        const platform = device.platform || '';
        
        return displayName.toLowerCase().includes(searchLower) ||
               deviceId.toLowerCase().includes(searchLower) ||
               deviceModel.toLowerCase().includes(searchLower) ||
               platform.toLowerCase().includes(searchLower);
    });
    
    const grid = document.getElementById('devices-grid');
    grid.innerHTML = '';
    
    if (filtered.length === 0) {
        grid.innerHTML = '<div class="empty-state">No devices match your search.</div>';
    } else {
        filtered.forEach(device => {
            grid.appendChild(createDeviceCard(device));
        });
    }
}

function updateStats() {
    const totalDevices = devices.length;
    const onlineDevices = devices.filter(d => d.status === 'online').length;
    const mappedDevices = devices.filter(d => d.is_mapped === true || !!d.admin_assigned_name).length;
    const unmappedDevices = totalDevices - mappedDevices;
    
    document.getElementById('total-devices').textContent = totalDevices;
    document.getElementById('active-tracking').textContent = onlineDevices;
    document.getElementById('alerts-today').textContent = unmappedDevices; // Show unmapped devices as alerts
    
    // Update mapping statistics if elements exist
    const mappedCountEl = document.getElementById('mapped-devices-count');
    const unmappedCountEl = document.getElementById('unmapped-devices-count');
    const mappingRateEl = document.getElementById('mapping-rate');
    
    if (mappedCountEl) mappedCountEl.textContent = mappedDevices;
    if (unmappedCountEl) unmappedCountEl.textContent = unmappedDevices;
    if (mappingRateEl) {
        const mappingRate = totalDevices > 0 ? ((mappedDevices / totalDevices) * 100).toFixed(1) : 0;
        mappingRateEl.textContent = `${mappingRate}%`;
    }
}

function initializeSearch() {
    const searchInput = document.querySelector('.search-input');
    const refreshBtn = document.getElementById('refresh-devices-btn');
    
    // Add search functionality
    searchInput.addEventListener('input', (e) => {
        applyDeviceSearch(e.target.value);
    });
    
    // Add refresh functionality
    refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<span class="refresh-icon spinning">🔄</span>REFRESHING...';
        
        await loadDevices();
        
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = '<span class="refresh-icon">🔄</span>REFRESH';
        
        // Clear search after refresh
        searchInput.value = '';
    });
}

function applyDeviceSearch(searchTerm = '') {
    let filteredDevices = [...devices];
    
    // Apply search filter
    if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        filteredDevices = filteredDevices.filter(device => {
            const displayName = (device.display_name || '').toLowerCase();
            const adminName = (device.admin_assigned_name || '').toLowerCase();
            const deviceName = (device.device_name || '').toLowerCase();
            const deviceId = (device.device_id || device.id || '').toLowerCase();
            const platform = (device.platform || '').toLowerCase();
            const model = (device.device_model || '').toLowerCase();
            const osVersion = (device.os_version || '').toLowerCase();
            
            return displayName.includes(term) ||
                   adminName.includes(term) || 
                   deviceName.includes(term) ||
                   deviceId.includes(term) || 
                   platform.includes(term) ||
                   model.includes(term) ||
                   osVersion.includes(term);
        });
    }
    
    renderFilteredDevices(filteredDevices);
}

function renderFilteredDevices(filteredDevices) {
    const grid = document.getElementById('devices-grid');
    grid.innerHTML = '';
    
    if (filteredDevices.length === 0) {
        grid.innerHTML = '<div class="empty-state">No devices match the current filter criteria.</div>';
        return;
    }
    
    filteredDevices.forEach(device => {
        const card = createDeviceCard(device);
        grid.appendChild(card);
    });
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

// Scheduling System Functions
function showScheduleModal() {
    // Set minimum date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('schedule-date').min = today;
    document.getElementById('schedule-date').value = today;
    
    // Set current time as default
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('schedule-time').value = `${hours}:${minutes}`;
    
    // Load scheduled recordings
    loadScheduledRecordings();
    
    // Show modal
    document.getElementById('schedule-modal').classList.add('active');
}

function setupSchedulingSystem() {
    const scheduleForm = document.getElementById('schedule-form');
    scheduleForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const recordingType = document.querySelector('input[name="recordingType"]:checked').value;
        const date = document.getElementById('schedule-date').value;
        const time = document.getElementById('schedule-time').value;
        const duration = document.getElementById('recording-duration').value;
        const note = document.getElementById('schedule-note').value;
        
        // Check permissions
        if (!hasPermission(recordingType)) {
            showNotification(`Access denied: ${recordingType} recording not permitted`, 'error');
            return;
        }
        
        // Create scheduled recording object
        const scheduledRecording = {
            id: `SCHED-${Date.now()}`,
            deviceId: selectedDevice.device_id,
            deviceName: selectedDevice.display_name || selectedDevice.device_name,
            type: recordingType,
            scheduledDateTime: new Date(`${date}T${time}`),
            duration: parseInt(duration),
            note: note,
            status: 'pending',
            createdAt: new Date()
        };
        
        // Add to scheduled recordings
        scheduledRecordings.push(scheduledRecording);
        
        // Save to sessionStorage (in a real app, this would be saved to a database)
        sessionStorage.setItem('scheduledRecordings', JSON.stringify(scheduledRecordings));
        
        // Show success notification
        showNotification(`${recordingType} recording scheduled for ${formatDateTime(scheduledRecording.scheduledDateTime)}`, 'success');
        
        // Reset form
        scheduleForm.reset();
        document.getElementById('schedule-date').value = today;
        
        // Reload scheduled recordings list
        loadScheduledRecordings();
    });
}

function loadScheduledRecordings() {
    // Load from sessionStorage
    const saved = sessionStorage.getItem('scheduledRecordings');
    if (saved) {
        scheduledRecordings = JSON.parse(saved);
    }
    
    // Filter recordings for the selected device
    const deviceSchedules = scheduledRecordings.filter(s => s.deviceId === selectedDevice.device_id);
    
    // Render scheduled recordings
    renderScheduledRecordings(deviceSchedules);
}

function renderScheduledRecordings(schedules) {
    const scheduledList = document.getElementById('scheduled-list');
    scheduledList.innerHTML = '';
    
    if (schedules.length === 0) {
        scheduledList.innerHTML = '<div class="no-schedules">No scheduled recordings for this device</div>';
        return;
    }
    
    // Sort by scheduled time
    schedules.sort((a, b) => new Date(a.scheduledDateTime) - new Date(b.scheduledDateTime));
    
    schedules.forEach(schedule => {
        const item = createScheduledItem(schedule);
        scheduledList.appendChild(item);
    });
}

function createScheduledItem(schedule) {
    const item = document.createElement('div');
    const status = getScheduleStatus(schedule);
    item.className = `scheduled-item ${status}`;
    
    item.innerHTML = `
        <div class="scheduled-header">
            <span class="scheduled-type">${schedule.type === 'audio' ? '🎤' : '📹'} ${schedule.type.toUpperCase()} Recording</span>
            <span class="scheduled-status ${status}">${status.toUpperCase()}</span>
        </div>
        <div class="scheduled-details">
            <p><strong>Scheduled:</strong> ${formatDateTime(new Date(schedule.scheduledDateTime))}</p>
            <p><strong>Duration:</strong> ${schedule.duration} minutes</p>
            ${schedule.note ? `<p><strong>Note:</strong> ${schedule.note}</p>` : ''}
        </div>
        ${status === 'pending' ? `
            <div class="scheduled-actions">
                <button onclick="cancelScheduledRecording('${schedule.id}')" class="cancel-schedule">CANCEL</button>
            </div>
        ` : ''}
    `;
    
    return item;
}

function getScheduleStatus(schedule) {
    const now = new Date();
    const scheduledTime = new Date(schedule.scheduledDateTime);
    const endTime = new Date(scheduledTime.getTime() + schedule.duration * 60000);
    
    if (schedule.status === 'cancelled') return 'cancelled';
    if (schedule.status === 'completed') return 'completed';
    if (now < scheduledTime) return 'pending';
    if (now >= scheduledTime && now <= endTime) return 'active';
    return 'completed';
}

function formatDateTime(date) {
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function cancelScheduledRecording(scheduleId) {
    const index = scheduledRecordings.findIndex(s => s.id === scheduleId);
    if (index !== -1) {
        scheduledRecordings[index].status = 'cancelled';
        sessionStorage.setItem('scheduledRecordings', JSON.stringify(scheduledRecordings));
        loadScheduledRecordings();
        showNotification('Scheduled recording cancelled', 'info');
    }
}

function checkScheduledRecordings() {
    const now = new Date();
    let updated = false;
    
    scheduledRecordings.forEach(schedule => {
        if (schedule.status === 'pending') {
            const scheduledTime = new Date(schedule.scheduledDateTime);
            const endTime = new Date(scheduledTime.getTime() + schedule.duration * 60000);
            
            // Check if recording should start
            if (now >= scheduledTime && now <= endTime) {
                schedule.status = 'active';
                updated = true;
                startScheduledRecording(schedule);
            }
            // Check if recording time has passed
            else if (now > endTime) {
                schedule.status = 'completed';
                updated = true;
            }
        } else if (schedule.status === 'active') {
            const scheduledTime = new Date(schedule.scheduledDateTime);
            const endTime = new Date(scheduledTime.getTime() + schedule.duration * 60000);
            
            // Check if recording should end
            if (now > endTime) {
                schedule.status = 'completed';
                updated = true;
                endScheduledRecording(schedule);
            }
        }
    });
    
    if (updated) {
        sessionStorage.setItem('scheduledRecordings', JSON.stringify(scheduledRecordings));
        // Reload if the schedule modal is open
        if (document.getElementById('schedule-modal').classList.contains('active')) {
            loadScheduledRecordings();
        }
    }
}

function startScheduledRecording(schedule) {
    const device = devices.find(d => d.device_id === schedule.deviceId);
    if (!device) return;
    
    showNotification(`Started scheduled ${schedule.type} recording on ${device.display_name || device.device_name}`, 'info');
    
    // In a real implementation, this would trigger actual recording
    // For now, we'll simulate it
    console.log(`Starting ${schedule.type} recording on device ${device.device_id} for ${schedule.duration} minutes`);
}

function endScheduledRecording(schedule) {
    const device = devices.find(d => d.device_id === schedule.deviceId);
    if (!device) return;
    
    showNotification(`Completed scheduled ${schedule.type} recording on ${device.display_name || device.device_name}`, 'success');
    
    // In a real implementation, this would stop the recording and save the file
    // For now, we'll simulate adding a new recording to the device
    const newRecording = {
        id: `${schedule.type}_${Date.now()}`,
        filename: `scheduled_${schedule.type}_${new Date().getTime()}.${schedule.type === 'audio' ? 'mp3' : 'mp4'}`,
        timestamp: new Date().toLocaleString(),
        duration: `${schedule.duration}:00`,
        size: `${(schedule.duration * 2.5).toFixed(1)} MB`,
        quality: schedule.type === 'audio' ? '128kbps' : '1080p'
    };
    
    if (schedule.type === 'audio') {
        device.audioRecordings.unshift(newRecording);
    } else {
        device.videoRecordings.unshift(newRecording);
    }
}

// Make cancelScheduledRecording available globally for onclick
window.cancelScheduledRecording = cancelScheduledRecording;

// Device Management Platform Functions (Management Only)

function openEditNameModal() {
    if (!selectedDevice) {
        showNotification('No device selected', 'error');
        return;
    }
    
    // Check if user is admin
    if (currentUser.role !== 'admin') {
        showNotification('Access denied: Admin privileges required', 'error');
        return;
    }
    
    // Determine if device is mapped
    const isMapped = selectedDevice.is_mapped === true || !!selectedDevice.admin_assigned_name;
    
    // Call the comprehensive edit modal function
    showEditNameModal(selectedDevice.device_id, selectedDevice.display_name || selectedDevice.device_name || '', isMapped);
}


// Make functions available globally
window.openEditNameModal = openEditNameModal;

// Live Streaming Functions
function startAudioStream() {
    if (currentStream) {
        showNotification('A stream is already active', 'warning');
        return;
    }
    
    // Show modal and setup audio
    document.getElementById('stream-title').textContent = 'LIVE AUDIO STREAM';
    document.getElementById('video-stream-container').classList.add('hidden');
    document.getElementById('audio-stream-container').classList.remove('hidden');
    document.querySelector('.stream-device').textContent = selectedDevice.display_name || selectedDevice.device_name;
    
    // Mark button as streaming
    document.getElementById('stream-audio').classList.add('streaming');
    
    // Show modal
    document.getElementById('stream-modal').classList.add('active');
    
    // Simulate audio stream (in real implementation, this would connect to device)
    simulateAudioStream();
    
    showNotification(`Started audio stream from ${selectedDevice.display_name || selectedDevice.device_name}`, 'info');
}

function startVideoStream() {
    if (currentStream) {
        showNotification('A stream is already active', 'warning');
        return;
    }
    
    // Show modal and setup video
    document.getElementById('stream-title').textContent = 'LIVE VIDEO STREAM';
    document.getElementById('audio-stream-container').classList.add('hidden');
    document.getElementById('video-stream-container').classList.remove('hidden');
    document.querySelector('.stream-device').textContent = selectedDevice.display_name || selectedDevice.device_name;
    
    // Mark button as streaming
    document.getElementById('stream-video').classList.add('streaming');
    
    // Show modal
    document.getElementById('stream-modal').classList.add('active');
    
    // Simulate video stream (in real implementation, this would connect to device)
    simulateVideoStream();
    
    showNotification(`Started video stream from ${selectedDevice.display_name || selectedDevice.device_name}`, 'info');
}

function simulateAudioStream() {
    currentStream = 'audio';
    
    // Initialize audio context and analyser
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    
    // Create oscillator for demo
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
    oscillator.connect(analyser);
    analyser.connect(audioContext.destination);
    oscillator.start();
    
    // Start visualizer
    drawAudioVisualizer();
    
    // Start timer
    startStreamTimer();
}

function simulateVideoStream() {
    currentStream = 'video';
    
    // In a real implementation, this would get the actual video stream
    // For demo, we'll use a test pattern or camera feed
    const video = document.getElementById('live-video-stream');
    
    // Try to get user's camera for demo
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(stream => {
            video.srcObject = stream;
        })
        .catch(err => {
            console.log('Camera access denied, using placeholder');
            // Use placeholder video
            video.style.background = 'linear-gradient(45deg, #00d4ff 25%, #0099cc 25%, #0099cc 50%, #00d4ff 50%, #00d4ff 75%, #0099cc 75%, #0099cc)';
            video.style.backgroundSize = '20px 20px';
        });
    
    // Start timer
    startStreamTimer();
}

function drawAudioVisualizer() {
    if (currentStream !== 'audio' || !analyser) return;
    
    const canvas = document.getElementById('audio-canvas');
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    function draw() {
        if (currentStream !== 'audio') return;
        
        requestAnimationFrame(draw);
        
        analyser.getByteFrequencyData(dataArray);
        
        ctx.fillStyle = 'rgba(10, 10, 10, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;
        
        for(let i = 0; i < bufferLength; i++) {
            barHeight = (dataArray[i] / 255) * canvas.height;
            
            const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
            gradient.addColorStop(0, '#00d4ff');
            gradient.addColorStop(1, '#0099cc');
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            
            x += barWidth + 1;
        }
    }
    
    draw();
}

function startStreamTimer() {
    let seconds = 0;
    const updateTimer = () => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        document.querySelectorAll('.stream-time').forEach(el => el.textContent = timeString);
        
        seconds++;
    };
    
    updateTimer();
    streamTimer = setInterval(updateTimer, 1000);
}

function setupStreamingControls() {
    // Toggle stream (pause/resume)
    document.getElementById('toggle-stream').addEventListener('click', () => {
        const btn = document.getElementById('toggle-stream');
        if (btn.classList.contains('active')) {
            btn.classList.remove('active');
            btn.innerHTML = '<span>⏸️ PAUSE</span>';
            showNotification('Stream resumed', 'info');
        } else {
            btn.classList.add('active');
            btn.innerHTML = '<span>▶️ RESUME</span>';
            showNotification('Stream paused', 'info');
        }
    });
    
    // Mute/unmute
    document.getElementById('mute-stream').addEventListener('click', () => {
        const btn = document.getElementById('mute-stream');
        if (btn.classList.contains('active')) {
            btn.classList.remove('active');
            btn.innerHTML = '<span>🔇 MUTE</span>';
            showNotification('Audio unmuted', 'info');
        } else {
            btn.classList.add('active');
            btn.innerHTML = '<span>🔊 UNMUTE</span>';
            showNotification('Audio muted', 'info');
        }
    });
    
    // Fullscreen
    document.getElementById('fullscreen-stream').addEventListener('click', () => {
        const container = document.getElementById('video-stream-container');
        if (container.classList.contains('fullscreen')) {
            container.classList.remove('fullscreen');
            document.getElementById('fullscreen-stream').innerHTML = '<span>⛶ FULLSCREEN</span>';
        } else {
            container.classList.add('fullscreen');
            document.getElementById('fullscreen-stream').innerHTML = '<span>⊡ EXIT FULLSCREEN</span>';
        }
    });
    
    // Stop stream
    document.getElementById('stop-stream').addEventListener('click', () => {
        stopStream();
    });
}

function stopStream() {
    if (!currentStream) return;
    
    // Clear timer
    if (streamTimer) {
        clearInterval(streamTimer);
        streamTimer = null;
    }
    
    // Stop audio context
    if (audioContext) {
        audioContext.close();
        audioContext = null;
        analyser = null;
    }
    
    // Stop video stream
    const video = document.getElementById('live-video-stream');
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    
    // Reset UI
    document.getElementById('stream-audio').classList.remove('streaming');
    document.getElementById('stream-video').classList.remove('streaming');
    document.getElementById('stream-modal').classList.remove('active');
    
    // Reset controls
    document.getElementById('toggle-stream').classList.remove('active');
    document.getElementById('toggle-stream').innerHTML = '<span>⏸️ PAUSE</span>';
    document.getElementById('mute-stream').classList.remove('active');
    document.getElementById('mute-stream').innerHTML = '<span>🔇 MUTE</span>';
    
    showNotification(`${currentStream} stream stopped`, 'info');
    currentStream = null;
}