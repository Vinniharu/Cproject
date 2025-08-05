# C2 - Station

A comprehensive Command & Control Station for device monitoring, management, and surveillance operations. Built with Electron for cross-platform desktop deployment.

## 🚀 Features

### Core Device Management
- **Real-time Device Monitoring** - Track multiple devices with live status updates
- **Device Discovery** - Automatic detection and registration of connected devices  
- **Status Tracking** - Monitor online/offline status, battery levels, and last seen timestamps
- **Location Services** - Real-time GPS tracking with Google Maps integration

### Recording & Surveillance
- **Audio Recording** - Remote audio capture with configurable quality settings
- **Video Recording** - HD video recording capabilities with duration controls
- **Media Management** - Browse, play, download, and delete recorded content
- **Scheduled Recording** - Advanced scheduling system for automated recording sessions

### User Management & Security
- **Multi-tier Authentication** - Admin and operator role-based access control
- **Permission System** - Granular permissions for audio, video, and location access
- **Secure Login** - Encrypted authentication with session management
- **Admin Panel** - Comprehensive user management and system administration

### Advanced Scheduling System
- **Time-based Recording** - Schedule audio/video recordings for specific times and dates
- **Duration Control** - Set custom recording durations (1-60 minutes)
- **Device-specific Scheduling** - Target recordings to specific devices
- **Status Monitoring** - Track pending, active, and completed scheduled recordings
- **Automatic Execution** - Background service executes recordings at scheduled times
- **Schedule Management** - View, modify, and cancel scheduled recordings

## 🔧 Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn package manager

### Setup
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd c2_station
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

### Building for Production
```bash
# Build for current platform
npm run build

# Build for specific platforms
npm run build-win    # Windows
npm run build-mac    # macOS
npm run build-linux  # Linux
```

## 📱 User Interface

### Dashboard Views
- **Devices View** - Grid layout of all monitored devices with search functionality
- **Analytics View** - System statistics and performance metrics
- **Alerts View** - Real-time system notifications and warnings
- **Admin View** - Administrative controls and user management (admin only)

### Device Control Modal
- **Device Information** - ID, status, location, battery level
- **Control Panel** - Record audio, record video, track location, schedule recordings
- **Live Location** - Real-time GPS coordinates with Google Maps integration
- **Media Library** - Browse and manage all recorded content
- **Schedule Manager** - Create and manage recording schedules

## 🔐 Authentication & Permissions

### User Roles
- **Admin** - Full system access, user management, device removal
- **Operator** - Device monitoring and recording (based on assigned permissions)

### Permission System
- **Audio Permission** - Allow/deny audio recording capabilities
- **Video Permission** - Allow/deny video recording capabilities  
- **Location Permission** - Allow/deny location tracking access

## 📋 API Endpoints & Functions

### Device Management
```javascript
// Get all devices
devices = getDevices()

// Select specific device
showDeviceDetails(deviceId)

// Remove device (admin only)
removeDevice(deviceId)
```

### Recording Operations
```javascript
// Immediate recording
recordAudio(deviceId)
recordVideo(deviceId)

// Location tracking
toggleLiveLocation(deviceId)
openInGoogleMaps(deviceId, coordinates)
```

### Scheduling System
```javascript
// Create scheduled recording
scheduleRecording({
    deviceId: string,
    type: 'audio' | 'video',
    scheduledDateTime: Date,
    duration: number, // minutes
    note: string
})

// Manage scheduled recordings
loadScheduledRecordings(deviceId)
cancelScheduledRecording(scheduleId)
checkScheduledRecordings() // Background service
```

### User Management
```javascript
// Authentication
login(username, password)
logout()

// Permission checking
hasPermission(permissionType)

// Admin functions
createUser(userData)
updateUserPermissions(userId, permissions)
deleteUser(userId)
```

## 🗂️ File Structure

```
c2_station/
├── assets/                 # Application icons and resources
│   └── eyeofc2.png         # Main application icon
├── main.js                 # Electron main process
├── dashboard.html          # Main dashboard interface
├── dashboard.js            # Dashboard functionality & scheduling
├── dashboard-styles.css    # Dashboard styling
├── login.html             # Login interface
├── login.js               # Authentication logic
├── admin-dashboard.html   # Admin panel interface
├── admin-dashboard.js     # Admin functionality
├── styles.css             # Global styles
└── package.json           # Project configuration
```

## 🎨 Theming

### Color Scheme
- **Primary**: `#00D4FF` (Cyan Blue) - Main accent color
- **Success**: `#00FF88` (Matrix Green) - Success states and online status
- **Danger**: `#FF4444` (Alert Red) - Error states and warnings
- **Background**: `#0A0A0A` (Deep Black) - Main background
- **Surface**: `#1A1A1A` (Dark Gray) - Card backgrounds

### Typography
- **Font Family**: 'Courier New', monospace - Technical/cyberpunk aesthetic
- **Responsive Design**: Mobile-friendly interface with touch support

## 🔄 Real-time Features

### Status Updates
- Device status monitoring (online/offline detection)
- Battery level tracking with low battery alerts
- Last seen timestamp updates
- Location coordinate streaming

### Background Services
- **Schedule Monitor** - Checks every minute for pending recordings
- **Status Poller** - Updates device status in real-time
- **Location Service** - Continuous GPS coordinate updates
- **Session Manager** - Maintains authentication state

## 🛡️ Security Features

### Data Protection
- Local storage encryption for scheduled recordings
- Secure session management with automatic timeout
- Permission-based access control for all operations
- Administrative controls for system security

### Network Security
- Encrypted communication protocols (implementation ready)
- Device authentication and verification
- Audit logging for all user actions
- Secure credential storage

## 📊 Analytics & Monitoring

### System Metrics
- Total devices tracked
- Active monitoring sessions
- Daily alert counts
- System uptime monitoring

### Usage Analytics
- Recording session statistics
- User activity tracking
- Device utilization reports
- Performance metrics

## 🔧 Configuration

### Environment Variables
```env
NODE_ENV=production|development
LOG_LEVEL=info|debug|error
SESSION_TIMEOUT=3600000
RECORDING_QUALITY=high|medium|low
```

### Application Settings
- Default recording duration
- Automatic scheduling intervals
- UI theme customization
- Notification preferences

## 📈 Future Enhancements

### Planned Features
- **Multi-language Support** - Internationalization for global deployment
- **Cloud Sync** - Remote backup and synchronization
- **Advanced Analytics** - Detailed reporting and insights
- **Mobile App** - Companion mobile application
- **Plugin System** - Extensible functionality framework

### Technical Roadmap
- **Database Integration** - PostgreSQL/MySQL support
- **API Server** - RESTful API for external integrations
- **Microservices** - Scalable architecture implementation
- **Docker Support** - Containerized deployment options

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Stephen Fagbelu**  
- Email: [contact information]
- GitHub: [profile link]

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📞 Support

For support, email [support-email] or open an issue in the repository.

---

**Version**: 1.0.0  
**Last Updated**: $(date)  
**Built with**: Electron, HTML5, CSS3, JavaScript