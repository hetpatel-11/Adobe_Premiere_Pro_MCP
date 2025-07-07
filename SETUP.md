# MCP Adobe Premiere Pro Setup Guide

This guide will walk you through the complete setup process for the MCP Adobe Premiere Pro integration.

## 📋 Prerequisites

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **Operating System** | Windows 10, macOS 10.15, Ubuntu 18.04 | Windows 11, macOS 12+, Ubuntu 20.04+ |
| **Node.js** | 18.0.0 | 20.0.0+ |
| **RAM** | 8 GB | 16 GB+ |
| **Storage** | 2 GB free space | 10 GB+ |
| **Adobe Premiere Pro** | 2022 (v22.0) | 2024 (v24.0)+ |

### Required Software

1. **Adobe Premiere Pro** 2022 or later
2. **Node.js** 18.0.0 or later
3. **Git** (for cloning the repository)
4. **Code Editor** (VS Code recommended)

## 🚀 Installation

### Step 1: Clone the Repository

```bash
# Clone the main repository
git clone https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP

# Navigate to project directory
cd mcp-adobe-premiere-pro

# Check if Node.js is installed
node --version
npm --version
```

### Step 2: Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Verify installation
npm ls
```

If you encounter permission errors on macOS/Linux:
```bash
sudo chown -R $(whoami) ~/.npm
```

### Step 3: Build the Project

```bash
# Build TypeScript code
npm run build

# Verify build
ls -la dist/
```

### Step 4: Install UXP Plugin

#### Option A: Manual Installation

**macOS:**
```bash
# Create Adobe UXP directory if it doesn't exist
mkdir -p ~/Library/Application\ Support/Adobe/UXP/Plugins/

# Copy plugin files
cp -r uxp-plugin ~/Library/Application\ Support/Adobe/UXP/Plugins/mcp-premiere-bridge

# Set proper permissions
chmod -R 755 ~/Library/Application\ Support/Adobe/UXP/Plugins/mcp-premiere-bridge
```

**Windows:**
```bash
# Create directory
mkdir "%APPDATA%\Adobe\UXP\Plugins"

# Copy plugin (use File Explorer or PowerShell)
xcopy uxp-plugin "%APPDATA%\Adobe\UXP\Plugins\mcp-premiere-bridge" /E /I
```

**Linux:**
```bash
# Adobe UXP path may vary on Linux
mkdir -p ~/.config/Adobe/UXP/Plugins/
cp -r uxp-plugin ~/.config/Adobe/UXP/Plugins/mcp-premiere-bridge
```

#### Option B: Development Mode (Recommended for testing)

1. **Open Adobe UXP Developer Tool**
   - Download from [Adobe Developer Console](https://developer.adobe.com/console/)
   - Install and launch the UXP Developer Tool

2. **Add Plugin**
   - Click "Add Plugin"
   - Navigate to your `uxp-plugin` directory
   - Select the `manifest.json` file

3. **Load Plugin**
   - Click "Load" next to your plugin
   - Launch Adobe Premiere Pro

### Step 5: Configure Adobe Premiere Pro

1. **Enable UXP Plugins**
   ```
   Premiere Pro > Preferences > General > 
   ☑ Enable Unsigned CEP Extensions
   ```

2. **Access the Plugin**
   ```
   Window > Extensions > MCP Premiere Pro Bridge
   ```

3. **Verify Installation**
   - The MCP Bridge panel should appear
   - Status should show "Ready to connect"

## ⚙️ Configuration

### Server Configuration

Create a `.env` file in the project root:

```env
# Server Settings
MCP_PORT=3000
MCP_HOST=localhost
LOG_LEVEL=info

# Premiere Pro Integration
PREMIERE_TEMP_DIR=./temp/premiere-bridge
PREMIERE_TIMEOUT=30000
PREMIERE_MAX_RETRIES=3

# Security Settings
ENABLE_CORS=true
ALLOWED_ORIGINS=localhost,127.0.0.1

# Feature Flags
ENABLE_AUTO_BACKUP=true
ENABLE_PROXY_WORKFLOW=true
ENABLE_AUDIO_ANALYSIS=false

# Performance Settings
MAX_CONCURRENT_OPERATIONS=5
COMMAND_QUEUE_SIZE=100
```

### UXP Plugin Configuration

1. **Open the MCP Bridge Panel** in Premiere Pro
2. **Click the Settings Icon**
3. **Configure Connection**:
   - **Server Port**: `3000` (match your `.env` file)
   - **Temp Directory**: Choose a location with write permissions
   - **Auto-start**: Enable for convenience

### Audio/Video Codecs

Ensure you have the necessary codecs installed:

```bash
# macOS - Install via Homebrew
brew install ffmpeg

# Windows - Download from https://ffmpeg.org/
# Add to PATH

# Linux
sudo apt update
sudo apt install ffmpeg
```

## 🔧 Advanced Setup

### Production Environment

For production use, consider these additional steps:

#### 1. Process Manager

Install PM2 for production process management:

```bash
npm install -g pm2

# Create ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'mcp-premiere-server',
    script: 'dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      MCP_PORT: 3000
    }
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### 2. Reverse Proxy (Optional)

For network access, set up nginx:

```nginx
# /etc/nginx/sites-available/mcp-premiere
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### 3. SSL Certificate

```bash
# Using certbot
sudo certbot --nginx -d your-domain.com
```

### Development Environment

For development work:

#### 1. Hot Reload

```bash
# Install development dependencies
npm install -D nodemon concurrently

# Add to package.json scripts:
{
  "scripts": {
    "dev": "concurrently \"npm run build:watch\" \"npm run start:dev\"",
    "build:watch": "tsc --watch",
    "start:dev": "nodemon dist/index.js"
  }
}

# Run development server
npm run dev
```

#### 2. Debug Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug MCP Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/dist/index.js",
      "env": {
        "NODE_ENV": "development",
        "LOG_LEVEL": "debug"
      },
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

#### 3. Testing Setup

```bash
# Install testing dependencies
npm install -D jest @types/jest ts-jest

# Create jest.config.js
cat > jest.config.js << EOF
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
};
EOF

# Run tests
npm test
```

## 🔍 Verification

### Test Installation

1. **Start the Server**:
   ```bash
   npm start
   ```

2. **Check Server Status**:
   ```bash
   curl http://localhost:3000/health
   # Should return: {"status": "ok", "timestamp": "..."}
   ```

3. **Test Premiere Pro Connection**:
   - Open Premiere Pro
   - Open MCP Bridge panel
   - Click "Start Bridge"
   - Status should show "Connected"

4. **Test Basic Functionality**:
   ```bash
   # Using a MCP client (e.g., Claude Desktop)
   # Connect to localhost:3000
   # Try: "List available tools"
   ```

### Health Check Script

Create a health check script:

```bash
#!/bin/bash
# health_check.sh

echo "Checking MCP Adobe Premiere Pro Setup..."

# Check Node.js
if command -v node &> /dev/null; then
    echo "✅ Node.js: $(node --version)"
else
    echo "❌ Node.js not found"
    exit 1
fi

# Check npm dependencies
if [ -d "node_modules" ]; then
    echo "✅ Dependencies installed"
else
    echo "❌ Dependencies not installed"
    exit 1
fi

# Check build
if [ -d "dist" ]; then
    echo "✅ Project built"
else
    echo "❌ Project not built"
    exit 1
fi

# Check UXP plugin
if [ -d "$HOME/Library/Application Support/Adobe/UXP/Plugins/mcp-premiere-bridge" ]; then
    echo "✅ UXP Plugin installed (macOS)"
elif [ -d "$APPDATA/Adobe/UXP/Plugins/mcp-premiere-bridge" ]; then
    echo "✅ UXP Plugin installed (Windows)"
else
    echo "⚠️  UXP Plugin location not found"
fi

# Check server
if curl -s http://localhost:3000/health > /dev/null; then
    echo "✅ Server running"
else
    echo "⚠️  Server not responding"
fi

echo "Setup verification complete!"
```

## 🐛 Troubleshooting

### Common Issues

#### Issue: "Module not found" errors
**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### Issue: UXP Plugin not appearing
**Solution:**
1. Check plugin path:
   ```bash
   # macOS
   ls -la ~/Library/Application\ Support/Adobe/UXP/Plugins/
   
   # Windows
   dir "%APPDATA%\Adobe\UXP\Plugins"
   ```

2. Restart Premiere Pro completely
3. Check Adobe Creative Cloud is up to date

#### Issue: Permission denied on temp directory
**Solution:**
```bash
# Create temp directory with proper permissions
mkdir -p ./temp/premiere-bridge
chmod 755 ./temp/premiere-bridge

# Or use system temp
export PREMIERE_TEMP_DIR=/tmp/premiere-bridge
```

#### Issue: Server connection timeout
**Solution:**
1. Check firewall settings
2. Verify port 3000 is available:
   ```bash
   # Check if port is in use
   lsof -i :3000  # macOS/Linux
   netstat -an | findstr :3000  # Windows
   ```
3. Try different port in `.env` file

#### Issue: ExtendScript execution errors
**Solution:**
1. Enable debugging in Premiere Pro:
   ```
   Preferences > General > Enable Debugging
   ```
2. Check ExtendScript Toolkit output
3. Verify Premiere Pro version compatibility

### Log Analysis

Enable detailed logging:

```bash
# Set environment variable
export LOG_LEVEL=debug

# Or add to .env file
echo "LOG_LEVEL=debug" >> .env

# View logs in real-time
tail -f logs/mcp-premiere.log
```

### Performance Optimization

For better performance:

```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# Or add to package.json start script
{
  "scripts": {
    "start": "node --max-old-space-size=4096 dist/index.js"
  }
}
```

## 📞 Getting Help

If you encounter issues:

1. **Check the logs** in the MCP Bridge panel
2. **Review the troubleshooting section** above
3. **Search existing issues** on GitHub
4. **Create a new issue** with:
   - Operating system and version
   - Node.js version
   - Premiere Pro version
   - Complete error messages
   - Steps to reproduce

## 🎉 Next Steps

Once setup is complete:

1. **Read the [Usage Guide](README.md#usage)**
2. **Try the [Examples](EXAMPLES.md)**
3. **Explore the [API Reference](README.md#api-reference)**
4. **Join the community** on Discord

Congratulations! You now have a fully functional MCP Adobe Premiere Pro integration. Happy editing! 🎬 
