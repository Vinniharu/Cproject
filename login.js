const { ipcRenderer } = require('electron');

// Window controls
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('minimize-btn').addEventListener('click', () => {
        ipcRenderer.send('window-minimize');
    });
    
    document.getElementById('maximize-btn').addEventListener('click', () => {
        ipcRenderer.send('window-maximize');
    });
    
    document.getElementById('close-btn').addEventListener('click', () => {
        ipcRenderer.send('window-close');
    });
    
    // Check API connection status on load
    checkApiConnection();
});

// Check if API is available
async function checkApiConnection() {
    try {
        const response = await fetch(`${apiService.baseUrl}/api/auth/status`, {
            method: 'GET',
            headers: {
                'ngrok-skip-browser-warning': 'true'
            },
            timeout: 5000
        });
        
        if (response.ok) {
            console.log('API connection: Online');
            updateConnectionStatus('ONLINE', '#00ff88');
        } else {
            console.log('API connection: Limited');
            updateConnectionStatus('LIMITED', '#ffaa00');
        }
    } catch (error) {
        console.log('API connection: Offline - Using local authentication');
        updateConnectionStatus('OFFLINE', '#ff4444');
    }
}

function updateConnectionStatus(status, color) {
    // This could be displayed in the UI if needed
    if (typeof CONFIG !== 'undefined' && CONFIG.DEV.ENABLE_CONSOLE_LOGS) {
        console.log(`Connection Status: ${status}`);
    }
}

// Emergency fallback users (only used when API is completely unavailable)
function getEmergencyUsers() {
    // Only basic admin access for emergency situations
    return {
        'admin': {
            password: 'admin123',
            role: 'admin',
            name: 'Emergency Admin',
            permissions: ['audio', 'video', 'location']
        }
    };
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('error-message');
    const loginButton = e.target.querySelector('.login-button');
    const statusElement = document.getElementById('status');
    
    errorMessage.classList.remove('show');
    loginButton.disabled = true;
    loginButton.innerHTML = '<span>AUTHENTICATING...</span><div class="button-glow"></div>';
    statusElement.textContent = 'VERIFYING';
    statusElement.style.color = '#ffaa00';
    
    try {
        // Use API service for authentication
        const response = await apiService.login(username, password);
        
        if (response.success && response.data && response.data.user) {
            // Success - user authenticated
            loginButton.innerHTML = '<span>ACCESS GRANTED</span><div class="button-glow"></div>';
            loginButton.style.background = 'linear-gradient(45deg, #00ff88, #00cc66)';
            statusElement.textContent = 'AUTHORIZED';
            statusElement.style.color = '#00ff88';
            
            // Validate required user fields
            const user = response.data.user;
            if (!user.id || !user.username || !user.role) {
                throw new Error('Invalid user data received from server');
            }
            
            // Store user data from API response
            const userData = {
                id: user.id,
                username: user.username,
                name: user.name || user.username,
                role: user.role,
                permissions: user.permissions || [],
                status: user.status || 'active'
            };
            
            sessionStorage.setItem('currentUser', JSON.stringify(userData));
            
            // Log successful login
            console.log('Login successful for user:', userData.username, 'Role:', userData.role);
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            window.location.href = 'dashboard.html';
            
        } else {
            // Authentication failed
            throw new Error(response.error || 'Authentication failed - Invalid response format');
        }
        
    } catch (error) {
        console.error('Login error:', error);
        
        // If API is not available, fall back to local authentication
        if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
            console.warn('API unavailable, using local authentication fallback');
            await handleLocalAuthentication(username, password, loginButton, statusElement, errorMessage);
        } else {
            // Show API error
            errorMessage.textContent = `ACCESS DENIED - ${error.message}`;
            errorMessage.classList.add('show');
            resetLoginForm(loginButton, statusElement);
        }
    }
});

// Emergency fallback authentication function (only when API is completely unavailable)
async function handleLocalAuthentication(username, password, loginButton, statusElement, errorMessage) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const EMERGENCY_USERS = getEmergencyUsers();
    const user = EMERGENCY_USERS[username];
    
    if (user && user.password === password) {
        loginButton.innerHTML = '<span>EMERGENCY ACCESS GRANTED</span><div class="button-glow"></div>';
        loginButton.style.background = 'linear-gradient(45deg, #ffaa00, #ff8800)';
        statusElement.textContent = 'EMERGENCY MODE';
        statusElement.style.color = '#ffaa00';
        
        // Generate emergency user ID
        const userData = {
            id: 'emergency-admin',
            username: username,
            role: user.role,
            name: user.name,
            permissions: user.permissions,
            status: 'emergency'
        };
        
        localStorage.setItem('currentUser', JSON.stringify(userData));
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        window.location.href = 'dashboard.html';
        
    } else {
        errorMessage.textContent = 'ACCESS DENIED - API unavailable and invalid emergency credentials';
        errorMessage.classList.add('show');
        resetLoginForm(loginButton, statusElement);
    }
}

// Reset login form to initial state
function resetLoginForm(loginButton, statusElement) {
    loginButton.innerHTML = '<span>INITIALIZE CONNECTION</span><div class="button-glow"></div>';
    loginButton.style.background = ''; // Reset to CSS default
    loginButton.disabled = false;
    statusElement.textContent = 'SECURE';
    statusElement.style.color = '#00d4ff';
    
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('username').focus();
}

document.getElementById('username').addEventListener('input', () => {
    document.getElementById('error-message').classList.remove('show');
});

document.getElementById('password').addEventListener('input', () => {
    document.getElementById('error-message').classList.remove('show');
});

const inputs = document.querySelectorAll('input');
inputs.forEach(input => {
    input.addEventListener('focus', () => {
        const icon = input.parentElement.querySelector('.input-icon svg path');
        if (icon) {
            icon.style.fill = '#ffffff';
        }
    });
    
    input.addEventListener('blur', () => {
        const icon = input.parentElement.querySelector('.input-icon svg path');
        if (icon) {
            icon.style.fill = '#00d4ff';
        }
    });
});