/**
 * MCP Premiere Pro Bridge (UXP Compatible)
 *
 * This script handles communication between the MCP server and Adobe Premiere Pro
 * through the UXP plugin system.
 */

// UXP APIs
const { storage, host } = require('uxp');
const { localFileSystem } = storage;
const { app } = require('premiere');

class MCPPremiereBridge {
    constructor() {
        this.isConnected = false;
        this.mcpServerPort = 3000;
        this.tempDirectory = '/tmp/premiere-mcp-bridge';
        this.commandQueue = [];
        this.isProcessing = false;
        this.pollingInterval = null;

        // UXP-specific
        this.tempFolderToken = null;
    }

    async init() {
        try {
            this.log('Initializing MCP Premiere Pro Bridge (UXP)...', 'info');
            await this.loadConfig();
            this.updateUI();
            this.log('Bridge initialized successfully', 'info');
        } catch (error) {
            this.log(`Initialization error: ${error.message}`, 'error');
        }
    }

    async setupFileWatcher() {
        try {
            // In UXP, we need to request folder access
            if (!this.tempFolderToken) {
                this.log('Requesting access to temp directory...', 'info');
                this.tempFolderToken = await localFileSystem.getFolder();
                this.tempDirectory = this.tempFolderToken.nativePath;

                // Update UI with selected path
                const tempInput = document.getElementById('tempDirectory');
                if (tempInput) {
                    tempInput.value = this.tempDirectory;
                }
            }

            this.log(`Watching temp directory: ${this.tempDirectory}`, 'info');
        } catch (error) {
            this.log(`Error setting up file watcher: ${error.message}`, 'error');
        }
    }

    async watchDirectory() {
        if (!this.tempFolderToken) {
            this.log('Temp folder not set. Click "Select Temp Folder" first.', 'warning');
            return;
        }

        try {
            const entries = await this.tempFolderToken.getEntries();

            for (const entry of entries) {
                if (entry.isFile && entry.name.startsWith('command-') && entry.name.endsWith('.json')) {
                    await this.processCommandFile(entry);
                }
            }
        } catch (error) {
            this.log(`Error watching directory: ${error.message}`, 'error');
        }
    }

    async processCommandFile(fileEntry) {
        try {
            // Read command file
            const fileContent = await fileEntry.read();
            const command = JSON.parse(fileContent);

            this.log(`Processing command: ${command.id}`, 'info');
            this.addToQueue(command);

            // Execute the command
            const result = await this.executeCommand(command);

            // Write response file
            const responseFileName = fileEntry.name.replace('command-', 'response-');
            const responseFile = await this.tempFolderToken.createFile(responseFileName, { overwrite: true });
            await responseFile.write(JSON.stringify(result, null, 2));

            // Delete command file
            await fileEntry.delete();

            this.log(`Command completed: ${command.id}`, 'info');
            this.updateCommandStatus(command.id, 'completed');

        } catch (error) {
            this.log(`Error processing command: ${error.message}`, 'error');

            // Write error response
            try {
                const responseFileName = fileEntry.name.replace('command-', 'response-');
                const responseFile = await this.tempFolderToken.createFile(responseFileName, { overwrite: true });
                await responseFile.write(JSON.stringify({
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, null, 2));
            } catch (writeError) {
                this.log(`Error writing error response: ${writeError.message}`, 'error');
            }
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
                // Validate script before execution
                if (!this.validateScript(script)) {
                    reject(new Error('Script validation failed: potentially unsafe script'));
                    return;
                }

                // UXP's method to execute ExtendScript
                if (typeof app !== 'undefined') {
                    // For UXP, we use app.executeExtendScript or similar
                    // Note: API availability depends on Premiere Pro version

                    // Try different methods based on what's available
                    if (app.executeExtendScript) {
                        app.executeExtendScript(script)
                            .then(result => {
                                try {
                                    const parsed = JSON.parse(result);
                                    resolve(parsed);
                                } catch (e) {
                                    resolve(result);
                                }
                            })
                            .catch(error => reject(error));
                    } else if (app.evalScript) {
                        // Alternative method
                        app.evalScript(script)
                            .then(result => {
                                try {
                                    const parsed = JSON.parse(result);
                                    resolve(parsed);
                                } catch (e) {
                                    resolve(result);
                                }
                            })
                            .catch(error => reject(error));
                    } else {
                        reject(new Error('ExtendScript execution not available in this Premiere Pro version'));
                    }
                } else {
                    reject(new Error('Premiere Pro app object not available'));
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    validateScript(script) {
        if (!script || typeof script !== 'string') {
            return false;
        }

        // Block obviously dangerous patterns
        const dangerousPatterns = [
            /eval\s*\(/i,
            /Function\s*\(/i,
            /require\s*\(/i,
            /import\s+/i,
            /__dirname/i,
            /__filename/i,
            /process\./i,
            /child_process/i,
            /fs\.(unlink|rm|rmdir|writeFile)/i,
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(script)) {
                this.log(`Script blocked: contains dangerous pattern ${pattern}`, 'warning');
                return false;
            }
        }

        // Script length limit (prevent DoS)
        if (script.length > 500000) { // 500KB limit
            this.log('Script blocked: exceeds size limit', 'warning');
            return false;
        }

        return true;
    }

    startCommandPolling() {
        // Poll for new commands every 500ms
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

        this.pollingInterval = setInterval(async () => {
            if (!this.isProcessing && this.tempFolderToken) {
                await this.checkForCommands();
            }
        }, 500);

        this.log('Command polling started', 'info');
    }

    stopCommandPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            this.log('Command polling stopped', 'info');
        }
    }

    async checkForCommands() {
        if (this.tempFolderToken) {
            await this.watchDirectory();
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

    async loadConfig() {
        try {
            // UXP localStorage for simple config
            const savedTempPath = localStorage.getItem('mcp_temp_directory');
            const savedServerPort = localStorage.getItem('mcp_server_port');

            if (savedTempPath) {
                this.tempDirectory = savedTempPath;
                const tempInput = document.getElementById('tempDirectory');
                if (tempInput) tempInput.value = savedTempPath;
            }

            if (savedServerPort) {
                this.mcpServerPort = parseInt(savedServerPort);
                const portInput = document.getElementById('serverPort');
                if (portInput) portInput.value = savedServerPort;
            }

            this.log('Configuration loaded', 'info');
        } catch (error) {
            this.log(`Error loading config: ${error.message}`, 'warning');
        }
    }

    saveConfig() {
        try {
            const serverPort = document.getElementById('serverPort')?.value || '3000';
            const tempDirectory = document.getElementById('tempDirectory')?.value || this.tempDirectory;

            localStorage.setItem('mcp_server_port', serverPort);
            localStorage.setItem('mcp_temp_directory', tempDirectory);

            this.mcpServerPort = parseInt(serverPort);
            this.tempDirectory = tempDirectory;

            this.log('Configuration saved', 'info');
        } catch (error) {
            this.log(`Error saving config: ${error.message}`, 'error');
        }
    }

    async selectTempFolder() {
        try {
            this.tempFolderToken = await localFileSystem.getFolder();
            this.tempDirectory = this.tempFolderToken.nativePath;

            const tempInput = document.getElementById('tempDirectory');
            if (tempInput) {
                tempInput.value = this.tempDirectory;
            }

            this.saveConfig();
            this.log(`Temp folder selected: ${this.tempDirectory}`, 'info');
        } catch (error) {
            this.log(`Error selecting folder: ${error.message}`, 'error');
        }
    }

    async startBridge() {
        this.log('Starting MCP Bridge...', 'info');

        if (!this.tempFolderToken) {
            this.log('Please select temp folder first', 'warning');
            await this.selectTempFolder();
            if (!this.tempFolderToken) {
                this.log('Cannot start without temp folder', 'error');
                return;
            }
        }

        this.isConnected = true;
        this.updateUI();

        // Start file watching
        this.startCommandPolling();

        // Test Premiere Pro connection
        await this.testPremiereConnection();
    }

    stopBridge() {
        this.log('Stopping MCP Bridge...', 'info');
        this.isConnected = false;
        this.stopCommandPolling();
        this.updateUI();
    }

    async testConnection() {
        this.log('Testing connections...', 'info');
        await this.testPremiereConnection();
    }

    async testPremiereConnection() {
        try {
            // Test basic Premiere Pro access
            const script = `
                (function() {
                    try {
                        return JSON.stringify({
                            appVersion: app.version,
                            projectName: app.project ? app.project.name : 'No project open',
                            timestamp: new Date().toISOString()
                        });
                    } catch(e) {
                        return JSON.stringify({ error: String(e) });
                    }
                })();
            `;

            const result = await this.executeExtendScript(script);
            this.log(`Premiere Pro connection successful: ${JSON.stringify(result)}`, 'info');
            this.updateServerStatus(true);
        } catch (error) {
            this.log(`Premiere Pro connection failed: ${error.message}`, 'error');
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
                serverText.textContent = 'Premiere Pro: Connected';
            } else {
                serverStatus.className = 'status-dot disconnected';
                serverText.textContent = 'Premiere Pro: Not Connected';
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

// Global bridge instance
let bridge = null;

// Global functions called by the HTML
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

function selectTempFolder() {
    if (bridge) {
        bridge.selectTempFolder();
    }
}

// Initialize the bridge when the page loads
document.addEventListener('DOMContentLoaded', async () => {
    bridge = new MCPPremiereBridge();
    await bridge.init();
});
