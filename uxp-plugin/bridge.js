/**
 * MCP Premiere Pro Bridge
 * 
 * This script handles communication between the MCP server and Adobe Premiere Pro
 * through the UXP plugin system.
 */

const { app } = require('premiere');
const fs = require('fs');
const path = require('path');

class MCPPremiereBridge {
    constructor() {
        this.isConnected = false;
        this.mcpServerPort = 3000;
        this.tempDirectory = '';
        this.commandQueue = [];
        this.isProcessing = false;
        
        // Initialize the bridge
        this.init();
    }
    
    init() {
        this.log('Initializing MCP Premiere Pro Bridge...', 'info');
        this.setupFileWatcher();
        this.loadConfig();
        this.updateUI();
        
        // Start polling for commands
        this.startCommandPolling();
    }
    
    setupFileWatcher() {
        // Set up file watching for command files
        const tempPath = this.getTempDirectory();
        if (tempPath) {
            this.log(`Watching temp directory: ${tempPath}`, 'info');
            this.watchDirectory(tempPath);
        }
    }
    
    getTempDirectory() {
        if (this.tempDirectory) {
            return this.tempDirectory;
        }
        
        // Default temp directory
        const defaultPath = path.join(process.cwd(), 'temp', 'premiere-bridge');
        try {
            if (!fs.existsSync(defaultPath)) {
                fs.mkdirSync(defaultPath, { recursive: true });
            }
            this.tempDirectory = defaultPath;
            return defaultPath;
        } catch (error) {
            this.log(`Error creating temp directory: ${error.message}`, 'error');
            return null;
        }
    }
    
    watchDirectory(dirPath) {
        try {
            const files = fs.readdirSync(dirPath);
            files.forEach(file => {
                if (file.startsWith('command-') && file.endsWith('.json')) {
                    this.processCommandFile(path.join(dirPath, file));
                }
            });
        } catch (error) {
            this.log(`Error watching directory: ${error.message}`, 'error');
        }
    }
    
    async processCommandFile(filePath) {
        try {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const command = JSON.parse(fileContent);
            
            this.log(`Processing command: ${command.id}`, 'info');
            this.addToQueue(command);
            
            // Process the command
            const result = await this.executeCommand(command);
            
            // Write response file
            const responseFile = filePath.replace('command-', 'response-');
            fs.writeFileSync(responseFile, JSON.stringify(result, null, 2));
            
            // Clean up command file
            fs.unlinkSync(filePath);
            
            this.log(`Command completed: ${command.id}`, 'info');
            this.updateCommandStatus(command.id, 'completed');
            
        } catch (error) {
            this.log(`Error processing command file: ${error.message}`, 'error');
            
            // Write error response
            const responseFile = filePath.replace('command-', 'response-');
            fs.writeFileSync(responseFile, JSON.stringify({
                error: error.message,
                timestamp: new Date().toISOString()
            }, null, 2));
        }
    }
    
    async executeCommand(command) {
        this.updateCommandStatus(command.id, 'executing');
        
        try {
            // Execute the ExtendScript code
            const result = await this.executeExtendScript(command.script);
            return {
                success: true,
                result: result,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            this.log(`ExtendScript execution error: ${error.message}`, 'error');
            throw error;
        }
    }
    
    async executeExtendScript(script) {
        return new Promise((resolve, reject) => {
            try {
                // Use UXP's ability to execute ExtendScript
                if (typeof app !== 'undefined' && app.executeExtendScript) {
                    app.executeExtendScript(script, (result) => {
                        if (result.error) {
                            reject(new Error(result.error));
                        } else {
                            // Parse the result if it's JSON
                            try {
                                const parsed = JSON.parse(result.result);
                                resolve(parsed);
                            } catch (e) {
                                resolve(result.result);
                            }
                        }
                    });
                } else {
                    // Fallback: try to execute directly
                    const result = eval(script);
                    resolve(result);
                }
            } catch (error) {
                reject(error);
            }
        });
    }
    
    startCommandPolling() {
        // Poll for new commands every 500ms
        setInterval(() => {
            if (!this.isProcessing) {
                this.checkForCommands();
            }
        }, 500);
    }
    
    checkForCommands() {
        const tempPath = this.getTempDirectory();
        if (tempPath) {
            this.watchDirectory(tempPath);
        }
    }
    
    addToQueue(command) {
        this.commandQueue.push({
            id: command.id,
            status: 'pending',
            timestamp: new Date().toISOString(),
            script: command.script.substring(0, 50) + '...'
        });
        this.updateCommandQueueUI();
    }
    
    updateCommandStatus(commandId, status) {
        const command = this.commandQueue.find(cmd => cmd.id === commandId);
        if (command) {
            command.status = status;
            this.updateCommandQueueUI();
        }
    }
    
    updateCommandQueueUI() {
        const queueElement = document.getElementById('commandQueue');
        if (queueElement && this.commandQueue.length > 0) {
            queueElement.innerHTML = this.commandQueue
                .slice(-5) // Show last 5 commands
                .map(cmd => `
                    <div class="command-item">
                        <span>${cmd.script}</span>
                        <span class="command-status ${cmd.status}">${cmd.status}</span>
                    </div>
                `).join('');
        }
    }
    
    loadConfig() {
        try {
            const configPath = path.join(this.getTempDirectory(), 'config.json');
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                this.mcpServerPort = config.serverPort || 3000;
                this.tempDirectory = config.tempDirectory || this.tempDirectory;
                
                // Update UI
                document.getElementById('serverPort').value = this.mcpServerPort;
                document.getElementById('tempDirectory').value = this.tempDirectory;
                
                this.log('Configuration loaded', 'info');
            }
        } catch (error) {
            this.log(`Error loading config: ${error.message}`, 'warning');
        }
    }
    
    saveConfig() {
        try {
            const config = {
                serverPort: document.getElementById('serverPort').value || 3000,
                tempDirectory: document.getElementById('tempDirectory').value || this.tempDirectory
            };
            
            const configPath = path.join(this.getTempDirectory(), 'config.json');
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            
            this.mcpServerPort = config.serverPort;
            this.tempDirectory = config.tempDirectory;
            
            this.log('Configuration saved', 'info');
        } catch (error) {
            this.log(`Error saving config: ${error.message}`, 'error');
        }
    }
    
    startBridge() {
        this.log('Starting MCP Bridge...', 'info');
        this.isConnected = true;
        this.updateUI();
        
        // Start file watching
        this.setupFileWatcher();
        
        // Test Premiere Pro connection
        this.testPremiereConnection();
    }
    
    stopBridge() {
        this.log('Stopping MCP Bridge...', 'info');
        this.isConnected = false;
        this.updateUI();
    }
    
    testConnection() {
        this.log('Testing connections...', 'info');
        this.testPremiereConnection();
    }
    
    testPremiereConnection() {
        try {
            // Test basic Premiere Pro access
            const script = `
                JSON.stringify({
                    appVersion: app.version,
                    projectName: app.project ? app.project.name : 'No project open',
                    timestamp: new Date().toISOString()
                });
            `;
            
            this.executeExtendScript(script)
                .then(result => {
                    this.log(`Premiere Pro connection successful: ${JSON.stringify(result)}`, 'info');
                    this.updateServerStatus(true);
                })
                .catch(error => {
                    this.log(`Premiere Pro connection failed: ${error.message}`, 'error');
                    this.updateServerStatus(false);
                });
        } catch (error) {
            this.log(`Error testing Premiere Pro connection: ${error.message}`, 'error');
            this.updateServerStatus(false);
        }
    }
    
    updateUI() {
        // Update connection status
        const connectionStatus = document.getElementById('connectionStatus');
        const connectionText = document.getElementById('connectionText');
        
        if (connectionStatus && connectionText) {
            if (this.isConnected) {
                connectionStatus.className = 'status-dot connected';
                connectionText.textContent = 'Connected';
            } else {
                connectionStatus.className = 'status-dot disconnected';
                connectionText.textContent = 'Disconnected';
            }
        }
        
        // Update buttons
        const startButton = document.getElementById('startButton');
        const stopButton = document.getElementById('stopButton');
        
        if (startButton) startButton.disabled = this.isConnected;
        if (stopButton) stopButton.disabled = !this.isConnected;
    }
    
    updateServerStatus(isRunning) {
        const serverStatus = document.getElementById('serverStatus');
        const serverText = document.getElementById('serverText');
        
        if (serverStatus && serverText) {
            if (isRunning) {
                serverStatus.className = 'status-dot connected';
                serverText.textContent = 'MCP Server: Running';
            } else {
                serverStatus.className = 'status-dot disconnected';
                serverText.textContent = 'MCP Server: Not Running';
            }
        }
    }
    
    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message}`;
        
        // Add to UI log
        const logContainer = document.getElementById('logContainer');
        if (logContainer) {
            const logElement = document.createElement('div');
            logElement.className = `log-entry ${level}`;
            logElement.textContent = logEntry;
            
            logContainer.appendChild(logElement);
            logContainer.scrollTop = logContainer.scrollHeight;
            
            // Keep only last 100 entries
            while (logContainer.children.length > 100) {
                logContainer.removeChild(logContainer.firstChild);
            }
        }
        
        // Console log
        console.log(logEntry);
    }
    
    clearLog() {
        const logContainer = document.getElementById('logContainer');
        if (logContainer) {
            logContainer.innerHTML = '<div class="log-entry info">Log cleared</div>';
        }
    }
}

// Global functions called by the HTML
let bridge = null;

function startBridge() {
    if (bridge) {
        bridge.startBridge();
    }
}

function stopBridge() {
    if (bridge) {
        bridge.stopBridge();
    }
}

function testConnection() {
    if (bridge) {
        bridge.testConnection();
    }
}

function saveConfig() {
    if (bridge) {
        bridge.saveConfig();
    }
}

function clearLog() {
    if (bridge) {
        bridge.clearLog();
    }
}

// UXP/CEP compatibility helpers
function isUXP() {
  return typeof require === 'undefined' && typeof window.uxp !== 'undefined';
}

function logUXPWarning() {
  const msg = '⚠️ UXP support is experimental. Some features may not work due to limited Premiere Pro UXP APIs.';
  if (typeof document !== 'undefined') {
    const el = document.createElement('div');
    el.style.color = 'orange';
    el.style.fontWeight = 'bold';
    el.style.margin = '8px 0';
    el.textContent = msg;
    document.body.prepend(el);
  }
  console.warn(msg);
}

if (isUXP()) {
  logUXPWarning();
  // Example: Use UXP APIs for file/network if needed
  // window.uxp.fs, window.uxp.network, etc.
  // (You may need to rewrite file/network access for full UXP support)
}

// Initialize the bridge when the page loads
document.addEventListener('DOMContentLoaded', () => {
    bridge = new MCPPremiereBridge();
});

// Export for UXP
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MCPPremiereBridge;
} 