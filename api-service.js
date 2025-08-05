// Device Management API for C2 Station
class DeviceManagementAPI {
    constructor(token = null, baseUrl = null) {
        // Use provided token or get from sessionStorage
        this.token = token || sessionStorage.getItem('authToken') || null;
        // Use provided baseUrl or fallback to config/default
        this.baseUrl = baseUrl || (typeof CONFIG !== 'undefined' ? CONFIG.API.BASE_URL : 'http://localhost:8000');
        this.timeout = (typeof CONFIG !== 'undefined') ? CONFIG.API.TIMEOUT : 30000;
        this.refreshToken = sessionStorage.getItem('refreshToken') || null;
        this.headers = {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
        };
        // Track request attempts for debugging
        this.requestAttempts = new Map();
    }

    // Set new base URL
    setBaseUrl(newUrl) {
        this.baseUrl = newUrl;
    }

    // Set authentication token
    setToken(token, refreshToken = null) {
        this.token = token;
        this.headers['Authorization'] = `Bearer ${token}`;
        sessionStorage.setItem('authToken', token);
        
        if (refreshToken) {
            this.refreshToken = refreshToken;
            sessionStorage.setItem('refreshToken', refreshToken);
        }
    }

    // Clear authentication tokens
    clearTokens() {
        this.token = null;
        this.refreshToken = null;
        this.headers['Authorization'] = '';
        sessionStorage.removeItem('authToken');
        sessionStorage.removeItem('refreshToken');
    }

    // Refresh token from sessionStorage (in case it was updated)
    refreshTokenFromStorage() {
        this.token = sessionStorage.getItem('authToken') || null;
        this.refreshToken = sessionStorage.getItem('refreshToken') || null;
        if (this.token) {
            this.headers['Authorization'] = `Bearer ${this.token}`;
        }
    }

    // Get default headers for API requests
    getHeaders(includeAuth = true) {
        // Always refresh token from sessionStorage before making request
        this.refreshTokenFromStorage();
        
        const headers = {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true' // Skip ngrok browser warning
        };

        if (includeAuth && this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        console.log('🔧 Generated headers:', headers);
        return headers;
    }

    // Generic API request method
    async makeRequest(endpoint, options = {}) {
        const requestId = Math.random().toString(36).substr(2, 9);
        const url = `${this.baseUrl}${endpoint}`;
        
        console.log(`🚀 [${requestId}] Starting ${options.method || 'GET'} request to: ${endpoint}`);
        
        // Create fresh headers for each request to avoid mutation issues
        const headers = this.getHeaders(options.includeAuth !== false);
        
        const config = {
            method: options.method || 'GET',
            headers: headers,
            // Don't spread options to avoid overwriting our carefully crafted headers
        };

        // Handle body separately to ensure proper JSON serialization
        if (options.body) {
            if (typeof options.body === 'object') {
                config.body = JSON.stringify(options.body);
                console.log(`📦 [${requestId}] Serialized body:`, config.body);
            } else {
                config.body = options.body;
                console.log(`📦 [${requestId}] Raw body:`, config.body);
            }
        }

        // Debug logging for authentication issues
        console.log(`🌐 [${requestId}] Making ${config.method} request to: ${url}`);
        console.log(`🔐 [${requestId}] Auth token available: ${!!this.token}`);
        if (this.token) {
            console.log(`🔑 [${requestId}] Token starts with: ${this.token.substring(0, 10)}...`);
        }
        console.log(`📋 [${requestId}] Final request headers:`, config.headers);
        console.log(`📦 [${requestId}] Final request body:`, config.body);

        try {
            console.log(`🚀 [${requestId}] Sending ${config.method} request to: ${url}`);
            const response = await fetch(url, config);
            
            console.log(`📡 [${requestId}] Response status: ${response.status} (${response.statusText})`);
            console.log(`📡 [${requestId}] Response headers:`, [...response.headers.entries()]);
            
            // Handle authentication errors
            if (response.status === 401) {
                console.warn(`⚠️ [${requestId}] 401 Unauthorized - attempting token refresh`);
                // Try to refresh token if available
                if (this.refreshToken && endpoint !== '/api/auth/refresh') {
                    const refreshed = await this.refreshAuthToken();
                    if (refreshed) {
                        console.log(`✅ [${requestId}] Token refreshed, retrying request`);
                        // Retry the original request with new token
                        config.headers['Authorization'] = `Bearer ${this.token}`;
                        const retryResponse = await fetch(url, config);
                        console.log(`📡 [${requestId}] Retry response status: ${retryResponse.status}`);
                        return retryResponse;
                    }
                }
                
                // If refresh fails or no refresh token, clear auth and redirect
                console.error(`❌ [${requestId}] Token refresh failed, clearing auth`);
                this.clearTokens();
                throw new Error('Authentication expired. Please log in again.');
            }

            // Handle bad request errors with more detail
            if (response.status === 400) {
                console.error(`❌ [${requestId}] 400 Bad Request details:`);
                const errorText = await response.text();
                console.error(`📄 [${requestId}] Error response body:`, errorText);
                try {
                    const errorJson = JSON.parse(errorText);
                    console.error(`📋 [${requestId}] Parsed error:`, errorJson);
                } catch (e) {
                    console.error(`📄 [${requestId}] Raw error text:`, errorText);
                }
                throw new Error(`Bad Request: ${errorText}`);
            }

            // Handle blob responses (for file downloads)
            if (options.responseType === 'blob') {
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(errorText || `HTTP ${response.status}: ${response.statusText}`);
                }
                
                const blob = await response.blob();
                const filename = this.getFilenameFromResponse(response);
                
                return {
                    success: true,
                    data: blob,
                    filename: filename,
                    status: response.status
                };
            }

            // Parse JSON response
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || `HTTP ${response.status}: ${response.statusText}`);
            }

            return {
                success: true,
                data: data,
                status: response.status,
                // Also pass through any top-level properties from the API response
                ...data
            };

        } catch (error) {
            console.error('API Request Error:', error);
            return {
                success: false,
                error: error.message,
                status: error.status || 500
            };
        }
    }

    // Authentication Endpoints
    async login(username, password) {
        const response = await this.makeRequest('/api/auth/login', {
            method: 'POST',
            includeAuth: false,
            body: {
                username,
                password
            }
        });

        if (response.success && response.data.token) {
            // Store the token and refresh token (if provided)
            this.setToken(response.data.token, response.data.refreshToken);
            
            // Log successful authentication
            if (typeof CONFIG !== 'undefined' && CONFIG.DEV.ENABLE_CONSOLE_LOGS) {
                console.log('User authenticated successfully:', response.data.user.username);
            }
        }

        return response;
    }

    async logout() {
        const response = await this.makeRequest('/api/auth/logout', {
            method: 'POST'
        });

        // Clear tokens regardless of API response
        this.clearTokens();
        
        return response;
    }

    async refreshAuthToken() {
        console.log('🔄 Attempting token refresh...');
        
        if (!this.refreshToken) {
            console.error('❌ No refresh token available');
            return false;
        }

        try {
            console.log('🔄 Calling refresh endpoint with refresh token');
            const response = await this.makeRequest('/api/auth/refresh', {
                method: 'POST',
                includeAuth: false,
                body: {
                    refreshToken: this.refreshToken
                }
            });

            console.log('🔄 Refresh response:', response);

            if (response.success && response.data.token) {
                console.log('✅ Token refresh successful, updating tokens');
                this.setToken(response.data.token, response.data.refreshToken);
                return true;
            } else {
                console.error('❌ Token refresh failed - invalid response:', response);
            }
        } catch (error) {
            console.error('❌ Token refresh exception:', error);
        }

        console.error('❌ Token refresh ultimately failed');
        return false;
    }

    // User Management Endpoints
    async getAllUsers() {
        return await this.makeRequest('/api/users');
    }

    async getUserById(userId) {
        return await this.makeRequest(`/api/users/${userId}`);
    }

    async createUser(userData) {
        return await this.makeRequest('/api/users', {
            method: 'POST',
            body: userData
        });
    }

    async updateUser(userId, userData) {
        return await this.makeRequest(`/api/users/${userId}`, {
            method: 'PUT',
            body: userData
        });
    }

    async deleteUser(userId) {
        return await this.makeRequest(`/api/users/${userId}`, {
            method: 'DELETE'
        });
    }

    async updateUserStatus(userId, status) {
        return await this.makeRequest(`/api/users/${userId}/status`, {
            method: 'PUT',
            body: { status }
        });
    }

    async updateUserPermissions(userId, permissions) {
        return await this.makeRequest(`/api/users/${userId}/permissions`, {
            method: 'PUT',
            body: { permissions }
        });
    }

    // Get current user profile
    async getCurrentUserProfile() {
        return await this.makeRequest('/api/user/profile');
    }

    async updateCurrentUserProfile(userData) {
        return await this.makeRequest('/api/user/profile', {
            method: 'PUT',
            body: userData
        });
    }

    // 1. Get All Devices
    async getAllDevices(filters = {}) {
        console.log('🔧 getAllDevices called:', filters);
        
        const params = new URLSearchParams();
        
        if (filters.mappedOnly) params.append('mapped_only', 'true');
        if (filters.unmappedOnly) params.append('unmapped_only', 'true');
        if (filters.platform) params.append('platform', filters.platform);
        if (filters.status) params.append('status', filters.status);
        
        const queryString = params.toString();
        const endpoint = `/api/devices${queryString ? '?' + queryString : ''}`;
        
        try {
            const response = await this.makeRequest(endpoint);
            console.log('✅ getAllDevices response:', response);
            return response;
        } catch (error) {
            console.error('❌ Error fetching devices:', error);
            return {
                success: false,
                error: error.message || 'Failed to fetch devices',
                devices: []
            };
        }
    }

    // Legacy method for backward compatibility
    async getDevices(filters = {}) {
        return await this.getAllDevices(filters);
    }

    // 2. Get Unmapped Devices Only (Admin)
    async getUnmappedDevices() {
        console.log('🔧 getUnmappedDevices called');
        
        try {
            const response = await this.makeRequest('/api/devices/unmapped');
            console.log('✅ getUnmappedDevices response:', response);
            return response;
        } catch (error) {
            console.error('❌ Error fetching unmapped devices:', error);
            return {
                success: false,
                error: error.message || 'Failed to fetch unmapped devices',
                unmapped_devices: []
            };
        }
    }

    // 3. Get Specific Device Details
    async getDeviceDetails(deviceId) {
        console.log('🔧 getDeviceDetails called:', { deviceId });
        
        try {
            const response = await this.makeRequest(`/api/devices/${deviceId}`);
            console.log('✅ getDeviceDetails response:', response);
            return response;
        } catch (error) {
            console.error('❌ Error fetching device details:', error);
            return {
                success: false,
                error: error.message || 'Failed to fetch device details'
            };
        }
    }

    // Legacy method for backward compatibility
    async getDevice(deviceId) {
        return await this.getDeviceDetails(deviceId);
    }

    // 4. Assign Name to Device (Admin)
    async assignDeviceName(deviceId, name) {
        const requestKey = `assign-${deviceId}`;
        const attemptCount = (this.requestAttempts.get(requestKey) || 0) + 1;
        this.requestAttempts.set(requestKey, attemptCount);
        
        console.log(`🔧 [ATTEMPT ${attemptCount}] assignDeviceName called:`, { deviceId, name });
        console.log('🔗 Making API call to:', `/api/devices/${deviceId}/assign-name`);
        console.log('📦 Request body:', { admin_assigned_name: name });
        
        // Validate inputs
        if (!deviceId) {
            console.error('❌ Missing deviceId');
            return { success: false, error: 'Device ID is required' };
        }
        if (!name || !name.trim()) {
            console.error('❌ Missing or empty name');
            return { success: false, error: 'Device name is required' };
        }
        
        try {
            const response = await this.makeRequest(`/api/devices/${deviceId}/assign-name`, {
                method: 'PUT',
                body: { admin_assigned_name: name.trim() }
            });
            
            console.log(`✅ [ATTEMPT ${attemptCount}] assignDeviceName response:`, response);
            
            if (response.success) {
                // Reset attempt counter on success
                this.requestAttempts.delete(requestKey);
            }
            
            return response;
        } catch (error) {
            console.error(`❌ [ATTEMPT ${attemptCount}] Error assigning device name:`, error);
            return {
                success: false,
                error: error.message || 'Failed to assign device name'
            };
        }
    }

    // 5. Update Device Name (Admin)
    async updateDeviceName(deviceId, name) {
        const requestKey = `update-${deviceId}`;
        const attemptCount = (this.requestAttempts.get(requestKey) || 0) + 1;
        this.requestAttempts.set(requestKey, attemptCount);
        
        console.log(`🔧 [ATTEMPT ${attemptCount}] updateDeviceName called:`, { deviceId, name });
        console.log('🔗 Making API call to:', `/api/devices/${deviceId}/update-name`);
        console.log('📦 Request body:', { admin_assigned_name: name });
        
        // Validate inputs
        if (!deviceId) {
            console.error('❌ Missing deviceId for update');
            return { success: false, error: 'Device ID is required' };
        }
        if (!name || !name.trim()) {
            console.error('❌ Missing or empty name for update');
            return { success: false, error: 'Device name is required' };
        }
        
        try {
            const response = await this.makeRequest(`/api/devices/${deviceId}/update-name`, {
                method: 'PUT',
                body: { admin_assigned_name: name.trim() }
            });
            
            console.log(`✅ [ATTEMPT ${attemptCount}] updateDeviceName response:`, response);
            
            if (response.success) {
                // Reset attempt counter on success
                this.requestAttempts.delete(requestKey);
            }
            
            return response;
        } catch (error) {
            console.error(`❌ [ATTEMPT ${attemptCount}] Error updating device name:`, error);
            return {
                success: false,
                error: error.message || 'Failed to update device name'
            };
        }
    }

    // 6. Remove Device Name Mapping (Admin)
    async unmapDevice(deviceId) {
        const requestKey = `unmap-${deviceId}`;
        const attemptCount = (this.requestAttempts.get(requestKey) || 0) + 1;
        this.requestAttempts.set(requestKey, attemptCount);
        
        console.log(`🔧 [ATTEMPT ${attemptCount}] unmapDevice called:`, { deviceId });
        console.log('🔗 Making API call to:', `/api/devices/${deviceId}/unmap`);
        
        // Validate inputs
        if (!deviceId) {
            console.error('❌ Missing deviceId for unmap');
            return { success: false, error: 'Device ID is required' };
        }
        
        try {
            const response = await this.makeRequest(`/api/devices/${deviceId}/unmap`, {
                method: 'DELETE'
            });
            
            console.log(`✅ [ATTEMPT ${attemptCount}] unmapDevice response:`, response);
            
            if (response.success) {
                // Reset attempt counter on success
                this.requestAttempts.delete(requestKey);
            }
            
            return response;
        } catch (error) {
            console.error(`❌ [ATTEMPT ${attemptCount}] Error unmapping device:`, error);
            return {
                success: false,
                error: error.message || 'Failed to unmap device'
            };
        }
    }

    // 7. Remove Device Completely (Admin)
    async removeDevice(deviceId) {
        console.log('🔧 removeDevice called:', { deviceId });
        
        try {
            const response = await this.makeRequest(`/api/devices/${deviceId}/remove`, {
                method: 'POST'
            });
            
            console.log('✅ removeDevice response:', response);
            return response;
        } catch (error) {
            console.error('❌ Error removing device:', error);
            return {
                success: false,
                error: error.message || 'Failed to remove device'
            };
        }
    }

    // 8. Get Device Live Location
    async getDeviceLiveLocation(deviceId) {
        console.log('🔧 getDeviceLiveLocation called:', { deviceId });
        
        try {
            const response = await this.makeRequest(`/api/devices/${deviceId}/location/live`);
            
            console.log('✅ getDeviceLiveLocation response:', response);
            return response;
        } catch (error) {
            console.error('❌ Error fetching device location:', error);
            return {
                success: false,
                error: error.message || 'Failed to get device location'
            };
        }
    }

    // Legacy method for backward compatibility
    async getLiveLocation(deviceId) {
        return await this.getDeviceLiveLocation(deviceId);
    }

    // Legacy alias methods for backward compatibility
    async updateDeviceAssignedName(deviceId, adminAssignedName) {
        return await this.updateDeviceName(deviceId, adminAssignedName);
    }

    /*
     * DEVICE MANAGEMENT API IMPLEMENTATION SUMMARY
     * 
     * All device management endpoints follow the same pattern:
     * 1. Use device_id (not id) as the path parameter
     * 2. Use makeRequest() wrapper for proper auth/error handling
     * 3. Include attempt tracking for debugging
     * 4. Validate inputs before making requests
     * 5. Trim string inputs and handle edge cases
     * 6. Provide consistent error response format
     * 
     * Endpoints implemented:
     * - PUT /api/devices/{device_id}/assign-name - Assign name to unmapped device
     * - PUT /api/devices/{device_id}/update-name - Update existing device name  
     * - DELETE /api/devices/{device_id}/unmap - Remove name mapping
     * - POST /api/devices/{device_id}/remove - Remove device completely
     * - GET /api/devices/{device_id}/location/live - Get device location
     */

    // Helper method to get dashboard statistics
    generateDeviceStats(devices) {
        return {
            total: devices.length,
            mapped: devices.filter(d => d.is_mapped).length,
            unmapped: devices.filter(d => !d.is_mapped).length,
            online: devices.filter(d => d.status === 'online').length,
            offline: devices.filter(d => d.status === 'offline').length,
            byPlatform: {
                android: devices.filter(d => d.platform === 'android').length,
                ios: devices.filter(d => d.platform === 'ios').length
            }
        };
    }

    // Enhanced Device Management Utility Methods
    validateDeviceName(name) {
        if (!name || name.trim().length === 0) {
            return { valid: false, error: 'Name cannot be empty' };
        }
        
        if (name.length > 100) {
            return { valid: false, error: 'Name must be 100 characters or less' };
        }
        
        // Check for special characters that might cause issues
        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(name)) {
            return { valid: false, error: 'Name contains invalid characters' };
        }
        
        return { valid: true };
    }

    async bulkAssignDeviceNames(assignments) {
        const results = [];
        
        for (const assignment of assignments) {
            try {
                const result = await this.assignDeviceName(
                    assignment.deviceId, 
                    assignment.name
                );
                results.push({ ...assignment, success: result.success });
            } catch (error) {
                results.push({ 
                    ...assignment, 
                    success: false, 
                    error: error.message 
                });
            }
        }
        
        return results;
    }

    // Device operations
    // Audio Recording Endpoints
    async getDeviceRecordings(deviceId) {
        return await this.makeRequest(`/api/devices/${deviceId}/audio`);
    }

    async getDeviceStatus(deviceId) {
        return await this.makeRequest(`/api/devices/${deviceId}/status`);
    }

    async startAudioRecording(deviceId) {
        return await this.makeRequest(`/api/devices/${deviceId}/audio/record`, {
            method: 'POST'
        });
    }

    async stopAudioRecording(deviceId, recordingId) {
        return await this.makeRequest(`/api/devices/${deviceId}/audio/${recordingId}/stop`, {
            method: 'POST'
        });
    }

    async downloadAudioRecording(recordingId) {
        return await this.makeRequest(`/api/recordings/audio/${recordingId}/download`, {
            method: 'GET',
            responseType: 'blob'
        });
    }

    async deleteAudioRecording(recordingId) {
        return await this.makeRequest(`/api/recordings/audio/${recordingId}`, {
            method: 'DELETE'
        });
    }

    // Video Recording Endpoints
    async getDeviceVideoRecordings(deviceId) {
        return await this.makeRequest(`/api/devices/${deviceId}/video`);
    }

    async startVideoRecording(deviceId) {
        return await this.makeRequest(`/api/devices/${deviceId}/video/record`, {
            method: 'POST'
        });
    }

    async stopVideoRecording(deviceId, recordingId) {
        return await this.makeRequest(`/api/devices/${deviceId}/video/${recordingId}/stop`, {
            method: 'POST'
        });
    }

    async downloadVideoRecording(recordingId) {
        return await this.makeRequest(`/api/recordings/video/${recordingId}/download`, {
            method: 'GET',
            responseType: 'blob'
        });
    }

    async deleteVideoRecording(recordingId) {
        return await this.makeRequest(`/api/recordings/video/${recordingId}`, {
            method: 'DELETE'
        });
    }

    // Location Tracking Endpoints
    async getLastKnownLocation(deviceId) {
        return await this.makeRequest(`/api/devices/${deviceId}/location/last-known`);
    }

    async startLocationTracking(deviceId) {
        return await this.makeRequest(`/api/devices/${deviceId}/location/track`, {
            method: 'POST'
        });
    }

    async stopLocationTracking(deviceId) {
        return await this.makeRequest(`/api/devices/${deviceId}/location/stop`, {
            method: 'POST'
        });
    }

    async updateDeviceLocation(deviceId, locationData) {
        return await this.makeRequest(`/api/devices/${deviceId}/location/update`, {
            method: 'POST',
            body: locationData,
            includeAuth: false // Mobile app endpoint - no auth required
        });
    }

    // Method to handle incoming location updates and trigger status updates
    handleLocationUpdate(deviceId, locationData) {
        // This would typically be called by a WebSocket or polling mechanism
        // For now, we'll simulate it through the dashboard
        if (typeof updateDeviceStatusOnline === 'function') {
            updateDeviceStatusOnline(deviceId);
        }
        
        console.log(`Location update received for device ${deviceId}:`, locationData);
        return true;
    }

    async getLocationHistory(deviceId, limit = 50) {
        return await this.makeRequest(`/api/devices/${deviceId}/location/history?limit=${limit}`);
    }

    async getLiveLocation(deviceId) {
        return await this.makeRequest(`/api/devices/${deviceId}/location/live`);
    }

    // System Settings Endpoints (Admin Only)
    async getSystemSettings() {
        return await this.makeRequest('/api/settings');
    }

    async updateSystemSettings(settings) {
        return await this.makeRequest('/api/settings', {
            method: 'PUT',
            body: settings
        });
    }

    // Analytics Endpoints
    async getSystemStats() {
        return await this.makeRequest('/api/analytics/stats');
    }

    // Enhanced Analytics Methods
    async getSystemAnalytics() {
        const statsResponse = await this.getSystemStats();
        
        if (statsResponse.success) {
            const stats = statsResponse.data.stats;
            
            // Calculate additional metrics
            const analytics = {
                ...stats,
                // Device metrics
                offlineDevices: stats.totalDevices - stats.activeDevices,
                onlinePercentage: stats.totalDevices > 0 ? 
                    parseFloat(((stats.activeDevices / stats.totalDevices) * 100).toFixed(1)) : 0,
                
                // User permission metrics
                audioPercentage: stats.totalUsers > 0 ? 
                    parseFloat(((stats.audioUsers / stats.totalUsers) * 100).toFixed(1)) : 0,
                videoPercentage: stats.totalUsers > 0 ? 
                    parseFloat(((stats.videoUsers / stats.totalUsers) * 100).toFixed(1)) : 0,
                locationPercentage: stats.totalUsers > 0 ? 
                    parseFloat(((stats.locationUsers / stats.totalUsers) * 100).toFixed(1)) : 0,
                
                // Security metrics
                fullAccessPercentage: stats.totalUsers > 0 ? 
                    parseFloat(((stats.fullAccessUsers / stats.totalUsers) * 100).toFixed(1)) : 0,
                
                // System health assessment
                systemHealth: this.assessSystemHealth(stats)
            };
            
            return {
                success: true,
                data: { analytics }
            };
        }
        
        return statsResponse;
    }

    assessSystemHealth(stats) {
        const issues = [];
        const warnings = [];
        
        // Calculate online percentage
        const onlinePercentage = stats.totalDevices > 0 ? 
            (stats.activeDevices / stats.totalDevices) * 100 : 0;
        
        // Device health checks
        if (stats.totalDevices === 0) {
            issues.push('No devices registered');
        } else if (onlinePercentage < 50) {
            issues.push('Low device online rate (< 50%)');
        } else if (onlinePercentage < 70) {
            warnings.push('Moderate device online rate (< 70%)');
        }
        
        // User configuration checks
        if (stats.totalUsers === 0) {
            issues.push('No users configured');
        }
        
        // Security checks
        if (stats.fullAccessUsers === stats.totalUsers && stats.totalUsers > 1) {
            warnings.push('High number of users with full access - potential security risk');
        }
        
        // Determine overall status
        let status = 'healthy';
        if (issues.length > 0) {
            status = 'critical';
        } else if (warnings.length > 0) {
            status = 'warning';
        }
        
        return {
            status,
            issues,
            warnings,
            score: this.calculateHealthScore(stats, onlinePercentage)
        };
    }

    calculateHealthScore(stats, onlinePercentage) {
        let score = 100;
        
        // Device availability impact (40% of score)
        if (stats.totalDevices === 0) {
            score -= 40;
        } else {
            score -= (100 - onlinePercentage) * 0.4;
        }
        
        // User configuration impact (20% of score)
        if (stats.totalUsers === 0) {
            score -= 20;
        }
        
        // Security impact (20% of score)
        if (stats.totalUsers > 1 && stats.fullAccessUsers === stats.totalUsers) {
            score -= 15; // Security risk
        }
        
        // System utilization impact (20% of score)
        const utilizationScore = stats.totalDevices > 0 ? 
            Math.min(stats.totalDevices / 10 * 20, 20) : 0; // Max 10 devices for full score
        score = Math.min(score, score - (20 - utilizationScore));
        
        return Math.max(0, Math.round(score));
    }

    generateSystemReport(analytics) {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                status: analytics.systemHealth.status,
                score: analytics.systemHealth.score,
                totalDevices: analytics.totalDevices,
                activeDevices: analytics.activeDevices,
                totalUsers: analytics.totalUsers
            },
            deviceMetrics: {
                total: analytics.totalDevices,
                online: analytics.activeDevices,
                offline: analytics.offlineDevices,
                onlineRate: `${analytics.onlinePercentage}%`
            },
            userMetrics: {
                total: analytics.totalUsers,
                withAudioAccess: `${analytics.audioUsers} (${analytics.audioPercentage}%)`,
                withVideoAccess: `${analytics.videoUsers} (${analytics.videoPercentage}%)`,
                withLocationAccess: `${analytics.locationUsers} (${analytics.locationPercentage}%)`,
                withFullAccess: `${analytics.fullAccessUsers} (${analytics.fullAccessPercentage}%)`
            },
            healthAssessment: analytics.systemHealth
        };
        
        return report;
    }

    // Streaming Endpoints (for future implementation)
    async startStream(deviceId, type) {
        return await this.makeRequest('/api/streams/start', {
            method: 'POST',
            body: {
                deviceId,
                type
            }
        });
    }

    async stopStream(streamId) {
        return await this.makeRequest(`/api/streams/${streamId}/stop`, {
            method: 'POST'
        });
    }

    // Scheduling Endpoints (for future implementation)
    async createSchedule(scheduleData) {
        return await this.makeRequest('/api/schedules', {
            method: 'POST',
            body: scheduleData
        });
    }

    async getSchedules(deviceId) {
        return await this.makeRequest(`/api/schedules?deviceId=${deviceId}`);
    }

    async updateSchedule(scheduleId, scheduleData) {
        return await this.makeRequest(`/api/schedules/${scheduleId}`, {
            method: 'PUT',
            body: scheduleData
        });
    }

    async deleteSchedule(scheduleId) {
        return await this.makeRequest(`/api/schedules/${scheduleId}`, {
            method: 'DELETE'
        });
    }

    // Location Endpoints (for future implementation)
    async getDeviceLocation(deviceId) {
        return await this.makeRequest(`/api/devices/${deviceId}/location`);
    }

    async startLocationTracking(deviceId) {
        return await this.makeRequest(`/api/devices/${deviceId}/location/live`, {
            method: 'GET'
        });
    }

    async stopLocationTracking(deviceId) {
        return await this.makeRequest(`/api/devices/${deviceId}/location/stop`, {
            method: 'POST'
        });
    }

    // Utility Methods
    getFilenameFromResponse(response) {
        const contentDisposition = response.headers.get('Content-Disposition');
        if (contentDisposition) {
            const matches = contentDisposition.match(/filename="([^"]+)"/);
            if (matches && matches[1]) {
                return matches[1];
            }
        }
        
        // Try to determine file type from content-type
        const contentType = response.headers.get('Content-Type');
        if (contentType && contentType.includes('video')) {
            return 'recording.mp4';
        } else {
            return 'recording.mp3';
        }
    }

    isAuthenticated() {
        // Refresh token from sessionStorage before checking
        this.refreshTokenFromStorage();
        return !!this.token;
    }

    getToken() {
        return this.token;
    }

    getCurrentUser() {
        const userStr = sessionStorage.getItem('currentUser');
        return userStr ? JSON.parse(userStr) : null;
    }

    getUserId() {
        const user = this.getCurrentUser();
        return user ? user.id : null;
    }

    hasPermission(permission) {
        const user = this.getCurrentUser();
        return user && user.permissions && user.permissions.includes(permission);
    }

    // Error handling helper
    handleApiError(error, showNotification = true) {
        console.error('API Error:', error);
        
        if (showNotification && typeof showNotification === 'function') {
            showNotification(error, 'error');
        }

        // Handle specific error types
        if (error.includes('Authentication expired')) {
            // Redirect to login
            window.location.href = 'login.html';
        }
    }
}

// Create global instance
const apiService = new DeviceManagementAPI();

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeviceManagementAPI;
}