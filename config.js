// Configuration file for C2 Station
const CONFIG = {
    // API Configuration
    API: {
        BASE_URL: 'https://www.teacch.co/c2',
        TIMEOUT: 30000, // 30 seconds
        RETRY_ATTEMPTS: 3,
        RETRY_DELAY: 1000 // 1 second
    },
    
    // Authentication Configuration
    AUTH: {
        TOKEN_REFRESH_THRESHOLD: 300000, // 5 minutes before expiry
        AUTO_REFRESH_ENABLED: true,
        SESSION_TIMEOUT: 3600000, // 1 hour
        REMEMBER_USER: true
    },
    
    // Application Settings
    APP: {
        AUTO_SAVE_INTERVAL: 30000, // 30 seconds
        NOTIFICATION_DURATION: 3000, // 3 seconds
        MAX_DEVICES: 100,
        DEFAULT_RECORDING_DURATION: 5, // minutes
        STREAM_QUALITY: 'HD', // HD, SD, LOW
        AUDIO_QUALITY: '128kbps'
    },
    
    // Development Settings
    DEV: {
        ENABLE_CONSOLE_LOGS: true,
        MOCK_DATA_ENABLED: false,
        OFFLINE_MODE_FALLBACK: true,
        DEBUG_API_CALLS: false
    }
};

// Function to update API base URL
function updateApiBaseUrl(newUrl) {
    CONFIG.API.BASE_URL = newUrl;
    if (typeof apiService !== 'undefined') {
        apiService.setBaseUrl(newUrl);
    }
    console.log(`API Base URL updated to: ${newUrl}`);
}

// Function to get current configuration
function getConfig() {
    return CONFIG;
}

// Function to test API connection
async function testApiConnection(baseUrl = null) {
    const testUrl = baseUrl || CONFIG.API.BASE_URL;
    
    try {
        const response = await fetch(`${testUrl}/api/auth/status`, {
            method: 'GET',
            headers: {
                'ngrok-skip-browser-warning': 'true',
                'Content-Type': 'application/json'
            },
            timeout: 5000
        });
        
        const result = {
            url: testUrl,
            status: response.status,
            ok: response.ok,
            timestamp: new Date().toISOString()
        };
        
        if (response.ok) {
            console.log('✅ API Connection Test Passed:', testUrl);
            return { success: true, ...result };
        } else {
            console.warn('⚠️ API Connection Test Failed:', response.status, response.statusText);
            return { success: false, error: `HTTP ${response.status}`, ...result };
        }
        
    } catch (error) {
        console.error('❌ API Connection Test Error:', error.message);
        return { 
            success: false, 
            error: error.message, 
            url: testUrl, 
            timestamp: new Date().toISOString() 
        };
    }
}

// Export configuration for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONFIG, updateApiBaseUrl, getConfig };
}