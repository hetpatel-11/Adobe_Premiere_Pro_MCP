/**
 * MCP Premiere Pro Bridge (CEP)
 * Uses CSInterface.evalScript to run ExtendScript in Premiere Pro.
 * Works in release Premiere Pro — no Beta or UXP Developer Tool required.
 */

(function() {
    var fs = require('fs');
    var path = require('path');
    var os = require('os');
    var EXTENDSCRIPT_COMPAT_HELPERS = [
        'function __mcpEscapeString(value) {',
        '    return String(value)',
        '        .replace(/\\\\/g, "\\\\\\\\")',
        "        .replace(/\"/g, '\\\\\"')",
        '        .replace(/\\r/g, "\\\\r")',
        '        .replace(/\\n/g, "\\\\n")',
        '        .replace(/\\t/g, "\\\\t");',
        '}',
        'function __mcpStringify(value) {',
        '    if (value === null) return "null";',
        '    var valueType = typeof value;',
        '    if (valueType === "string") return "\\"" + __mcpEscapeString(value) + "\\"";',
        '    if (valueType === "number") return isFinite(value) ? String(value) : "null";',
        '    if (valueType === "boolean") return value ? "true" : "false";',
        '    if (value instanceof Array) {',
        '        var arrayParts = [];',
        '        for (var i = 0; i < value.length; i++) {',
        '            arrayParts.push(__mcpStringify(value[i]));',
        '        }',
        '        return "[" + arrayParts.join(",") + "]";',
        '    }',
        '    if (valueType === "object") {',
        '        var objectParts = [];',
        '        for (var key in value) {',
        '            if (value.hasOwnProperty && !value.hasOwnProperty(key)) continue;',
        '            if (typeof value[key] === "undefined" || typeof value[key] === "function") continue;',
        '            objectParts.push(__mcpStringify(String(key)) + ":" + __mcpStringify(value[key]));',
        '        }',
        '        return "{" + objectParts.join(",") + "}";',
        '    }',
        '    return "null";',
        '}',
        'if (typeof JSON === "undefined") { JSON = {}; }',
        'if (typeof JSON.stringify !== "function") { JSON.stringify = __mcpStringify; }'
    ].join('\n');

    function getDefaultTempPath() {
        var base = (os.platform() === 'win32') ? (process.env.TEMP || 'C:\\Temp') : '/tmp';
        return path.join(base, 'premiere-mcp-bridge');
    }

    function ensureDirectory(dirPath) {
        if (!dirPath) return null;
        var resolvedPath = path.resolve(dirPath);
        if (!fs.existsSync(resolvedPath)) {
            fs.mkdirSync(resolvedPath, { recursive: true });
        }
        if (!fs.statSync(resolvedPath).isDirectory()) {
            throw new Error('Temp path is not a directory: ' + resolvedPath);
        }
        return resolvedPath;
    }

    function sanitizeTempDirectoryInput(value) {
        if (!value || typeof value !== 'string') return '';
        var trimmed = value.trim();

        function normalizePathLiteral(pathValue) {
            return pathValue.trim().replace(/\\\\/g, '\\');
        }

        try {
            if (trimmed.charAt(0) === '{') {
                var parsed = JSON.parse(trimmed);
                if (parsed && typeof parsed.PREMIERE_TEMP_DIR === 'string') {
                    return normalizePathLiteral(parsed.PREMIERE_TEMP_DIR);
                }
                if (parsed && typeof parsed.tempDirectory === 'string') {
                    return normalizePathLiteral(parsed.tempDirectory);
                }
            }
        } catch (e) {}

        var envMatch = trimmed.match(/["']?PREMIERE_TEMP_DIR["']?\s*:\s*["']([^"']+)["']/);
        if (envMatch && envMatch[1]) {
            return normalizePathLiteral(envMatch[1]);
        }

        return normalizePathLiteral(trimmed.replace(/^["']|["']$/g, ''));
    }

    function MCPPremiereBridge() {
        this.isConnected = false;
        this.tempDirectory = '';
        this.commandQueue = [];
        this.isProcessing = false;
        this.csInterface = new CSInterface();
        this.init();
    }

    MCPPremiereBridge.prototype.normalizeHostEnvironment = function(hostEnv) {
        if (!hostEnv) return null;
        if (typeof hostEnv === 'string') {
            return JSON.parse(hostEnv);
        }
        return hostEnv;
    };

    MCPPremiereBridge.prototype.init = function() {
        this.log('Initializing MCP Bridge (CEP)...', 'info');

        // Check host environment
        try {
            var env = this.normalizeHostEnvironment(this.csInterface.getHostEnvironment());
            if (env) {
                this.log('Premiere Pro version: ' + env.appVersion + ' (build ' + env.appId + ')', 'info');
            }
        } catch (e) {
            this.log('Warning: Could not get host environment: ' + e.message, 'warning');
        }

        this.loadConfig();
        this.updateUI();
        this.startCommandPolling();
    };

    MCPPremiereBridge.prototype.getTempDirectory = function() {
        var targetPath = this.tempDirectory || getDefaultTempPath();
        try {
            this.tempDirectory = ensureDirectory(targetPath);
            return this.tempDirectory;
        } catch (e) {
            this.log('Error creating temp directory: ' + e.message, 'error');
            return null;
        }
    };

    MCPPremiereBridge.prototype.getDiagnosticReportPath = function() {
        var tempDir = this.getTempDirectory();
        if (!tempDir) return null;
        return path.join(tempDir, 'premiere-mcp-diagnostics-latest.json');
    };

    MCPPremiereBridge.prototype.writeDiagnosticReport = function(report) {
        try {
            var reportPath = this.getDiagnosticReportPath();
            if (!reportPath) return null;
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
            return reportPath;
        } catch (e) {
            this.log('Failed to write diagnostics report: ' + e.message, 'error');
            return null;
        }
    };

    MCPPremiereBridge.prototype.watchDirectory = function(dirPath) {
        try {
            var watchedPath = ensureDirectory(dirPath);
            var files = fs.readdirSync(watchedPath);
            for (var i = 0; i < files.length; i++) {
                var file = files[i];
                if (file.indexOf('command-') === 0 && file.indexOf('.json') === file.length - 5) {
                    this.processCommandFile(path.join(watchedPath, file));
                    return;
                }
            }
        } catch (e) {
            this.log('Error watching directory: ' + e.message, 'error');
        }
    };

    MCPPremiereBridge.prototype.processCommandFile = function(filePath) {
        var self = this;
        try {
            var fileContent = fs.readFileSync(filePath, 'utf8');
            var command = JSON.parse(fileContent);
            this.log('Processing command: ' + command.id, 'info');
            this.addToQueue(command);
            this.isProcessing = true;
            this.executeCommand(command, function(result) {
                try {
                    var responseFile = filePath.replace('command-', 'response-');
                    fs.writeFileSync(responseFile, JSON.stringify(result, null, 2));
                    fs.unlinkSync(filePath);
                    self.log('Command completed: ' + command.id, 'info');
                    self.updateCommandStatus(command.id, 'completed');
                } catch (e) {
                    var errFile = filePath.replace('command-', 'response-');
                    fs.writeFileSync(errFile, JSON.stringify({ error: e.message, timestamp: new Date().toISOString() }, null, 2));
                }
                self.isProcessing = false;
            });
        } catch (e) {
            this.log('Error processing command file: ' + e.message, 'error');
            try {
                var responseFile = filePath.replace('command-', 'response-');
                fs.writeFileSync(responseFile, JSON.stringify({ error: e.message, timestamp: new Date().toISOString() }, null, 2));
                fs.unlinkSync(filePath);
            } catch (e2) {}
            this.isProcessing = false;
        }
    };

    MCPPremiereBridge.prototype.executeCommand = function(command, done) {
        var self = this;
        this.updateCommandStatus(command.id, 'executing');
        if (!this.validateScript(command.script)) {
            done({ success: false, error: 'Script validation failed' });
            return;
        }
        this.executeExtendScript(command.script, function(err, result) {
            if (err) {
                done({ success: false, error: err.message });
                return;
            }
            done({ success: true, result: result, timestamp: new Date().toISOString() });
        });
    };

    MCPPremiereBridge.prototype.executeExtendScript = function(script, callback) {
        var self = this;
        try {
            if (!this.csInterface) {
                callback(new Error('CSInterface not initialized'));
                return;
            }

            // Get host environment info for debugging
            var hostEnv = this.normalizeHostEnvironment(this.csInterface.getHostEnvironment());
            if (!hostEnv) {
                callback(new Error('Could not get host environment. Is Premiere Pro running?'));
                return;
            }

            var fullScript = EXTENDSCRIPT_COMPAT_HELPERS + '\n' + script;
            var settled = false;
            var timeoutMs = 45000;
            var timeoutId = setTimeout(function() {
                if (settled) return;
                settled = true;
                callback(new Error(
                    'ExtendScript execution timed out after ' + timeoutMs + 'ms. ' +
                    'Premiere Pro or the CEP scripting host did not return a result.'
                ));
            }, timeoutMs);

            this.csInterface.evalScript(fullScript, function(result) {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                self.log('EvalScript result: ' + result, 'info');

                if (result === 'EvalScript error.' || result === 'EvalScript error') {
                    callback(new Error(
                        'ExtendScript execution failed via CEP evalScript(). ' +
                        'This is usually a host-side scripting failure or CEP compatibility issue, not a JSON parsing problem.'
                    ));
                    return;
                }

                if (typeof result === 'string' && result.indexOf('Error') === 0) {
                    callback(new Error(result));
                    return;
                }

                try {
                    var parsed = JSON.parse(result);
                    callback(null, parsed);
                } catch (e) {
                    callback(null, result);
                }
            });
        } catch (e) {
            callback(e);
        }
    };

    MCPPremiereBridge.prototype.validateScript = function(script) {
        if (!script || typeof script !== 'string') return false;
        var dangerous = [
            /eval\s*\(/i,
            /\bnew\s+Function\s*\(/i,
            /\brequire\s*\(/i,
            /\b__dirname\b/i,
            /\b__filename\b/i,
            /\bprocess\./i,
            /\bchild_process\b/i
        ];
        for (var i = 0; i < dangerous.length; i++) {
            if (dangerous[i].test(script)) return false;
        }
        return script.length <= 500000;
    };

    MCPPremiereBridge.prototype.startCommandPolling = function() {
        var self = this;
        setInterval(function() {
            if (!self.isProcessing && self.isConnected) {
                var tempPath = self.getTempDirectory();
                if (tempPath) self.watchDirectory(tempPath);
            }
        }, 250);
    };

    MCPPremiereBridge.prototype.addToQueue = function(command) {
        this.commandQueue.push({ id: command.id, status: 'pending', script: (command.script || '').substring(0, 50) + '...' });
        this.updateCommandQueueUI();
    };

    MCPPremiereBridge.prototype.updateCommandStatus = function(commandId, status) {
        for (var i = 0; i < this.commandQueue.length; i++) {
            if (this.commandQueue[i].id === commandId) {
                this.commandQueue[i].status = status;
                break;
            }
        }
        this.updateCommandQueueUI();
    };

    MCPPremiereBridge.prototype.updateCommandQueueUI = function() {
        var el = document.getElementById('commandQueue');
        if (!el) return;
        if (this.commandQueue.length === 0) {
            el.innerHTML = '<div class="command-item"><span class="command-label">No commands in queue</span></div>';
            return;
        }
        var html = this.commandQueue.slice(-5).map(function(cmd) {
            return '<div class="command-item"><span class="command-label">' + cmd.script + '</span><span class="command-status ' + cmd.status + '">' + cmd.status + '</span></div>';
        }).join('');
        el.innerHTML = html;
    };

    MCPPremiereBridge.prototype.loadConfig = function() {
        try {
            var candidatePaths = [getDefaultTempPath()];
            if (process.env.PREMIERE_TEMP_DIR) {
                candidatePaths.push(sanitizeTempDirectoryInput(process.env.PREMIERE_TEMP_DIR));
            }

            for (var i = 0; i < candidatePaths.length; i++) {
                var candidatePath = sanitizeTempDirectoryInput(candidatePaths[i]);
                if (!candidatePath || !fs.existsSync(candidatePath)) continue;
                var configPath = path.join(candidatePath, 'config.json');
                if (fs.existsSync(configPath)) {
                    var config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    if (config.tempDirectory) {
                        this.tempDirectory = sanitizeTempDirectoryInput(config.tempDirectory);
                        break;
                    }
                }
            }

            var tempEl = document.getElementById('tempDirectory');
            if (tempEl) {
                var fieldValue = sanitizeTempDirectoryInput(tempEl.value);
                if (!this.tempDirectory && fieldValue) this.tempDirectory = fieldValue;
                if (this.tempDirectory) {
                    tempEl.value = this.tempDirectory;
                } else if (fieldValue) {
                    tempEl.value = fieldValue;
                }
            }
        } catch (e) {}
    };

    MCPPremiereBridge.prototype.saveConfig = function() {
        try {
            var tempEl = document.getElementById('tempDirectory');
            var tempDir = tempEl ? sanitizeTempDirectoryInput(tempEl.value) : '';
            if (tempDir) this.tempDirectory = tempDir;
            var ensuredTempDir = this.getTempDirectory();
            if (!ensuredTempDir) {
                throw new Error('Could not create or access temp directory');
            }
            if (tempEl) tempEl.value = this.tempDirectory;
            var configPath = path.join(ensuredTempDir, 'config.json');
            fs.writeFileSync(configPath, JSON.stringify({ tempDirectory: this.tempDirectory }, null, 2));
            this.log('Configuration saved', 'info');
        } catch (e) {
            this.log('Error saving config: ' + e.message, 'error');
        }
    };

    MCPPremiereBridge.prototype.startBridge = function() {
        this.log('Starting MCP Bridge...', 'info');
        this.isProcessing = false;
        this.isConnected = true;
        this.updateUI();
        var tempPath = this.getTempDirectory();
        if (!tempPath) {
            this.isConnected = false;
            this.updateUI();
            this.updateServerStatus(false);
            return;
        }
        this.log('Watching: ' + tempPath + ' (must match your MCP client PREMIERE_TEMP_DIR)', 'info');
        this.updateServerStatus(true);
        this.log('Bridge ready. Connect from Codex, Claude, or another MCP client using this same temp directory.', 'info');
    };

    MCPPremiereBridge.prototype.stopBridge = function() {
        this.log('Stopping MCP Bridge...', 'info');
        this.isConnected = false;
        this.isProcessing = false;
        this.updateUI();
        this.updateServerStatus(false);
    };

    MCPPremiereBridge.prototype.runDiagnostics = function() {
        var self = this;
        var hostEnvironment = null;
        var report = {
            generatedAt: new Date().toISOString(),
            panel: 'MCP Bridge (CEP)',
            tempDirectory: this.getTempDirectory(),
            hostEnvironment: null,
            checks: []
        };

        function addCheck(name, success, details) {
            report.checks.push({
                name: name,
                success: success,
                details: details
            });
        }

        function finalize() {
            var reportPath = self.writeDiagnosticReport(report);
            if (reportPath) {
                self.log('Diagnostics report saved to ' + reportPath, 'info');
            }
            self.log('Diagnostics summary: ' + JSON.stringify(report), 'info');
        }

        this.log('Running CEP diagnostics...', 'info');

        try {
            hostEnvironment = this.normalizeHostEnvironment(this.csInterface.getHostEnvironment());
            report.hostEnvironment = hostEnvironment;
            addCheck('host_environment', !!hostEnvironment, hostEnvironment || 'No host environment returned');
        } catch (e) {
            addCheck('host_environment', false, e.message);
            finalize();
            return;
        }

        var checks = [
            {
                name: 'eval_string',
                script: '(function(){ return "cep-ok"; })();'
            },
            {
                name: 'app_version_raw',
                script: '(function(){ try { return app.version; } catch (e) { return "ERROR: " + String(e); } })();'
            },
            {
                name: 'eval_json_roundtrip',
                script: '(function(){ return JSON.stringify({ ok: true, transport: "cep" }); })();'
            },
            {
                name: 'app_version',
                script: '(function(){ try { return JSON.stringify({ appVersion: app.version, appName: app.name }); } catch (e) { return JSON.stringify({ error: String(e) }); } })();'
            },
            {
                name: 'project_access',
                script: '(function(){ try { return JSON.stringify({ projectName: (app.project && app.project.name) ? app.project.name : "No project open" }); } catch (e) { return JSON.stringify({ error: String(e) }); } })();'
            }
        ];

        function runCheck(index) {
            if (index >= checks.length) {
                finalize();
                return;
            }

            var check = checks[index];
            self.executeExtendScript(check.script, function(err, result) {
                if (err) {
                    addCheck(check.name, false, err.message);
                } else {
                    addCheck(check.name, true, result);
                }
                runCheck(index + 1);
            });
        }

        runCheck(0);
    };

    MCPPremiereBridge.prototype.testPremiereConnection = function() {
        var self = this;
        var script = '(function() {\
            try {\
                var d = new Date();\
                var timestamp = d.getFullYear() + "-" + \
                    String(d.getMonth() + 1).replace(/^(\\d)$/, "0$1") + "-" + \
                    String(d.getDate()).replace(/^(\\d)$/, "0$1") + "T" + \
                    String(d.getHours()).replace(/^(\\d)$/, "0$1") + ":" + \
                    String(d.getMinutes()).replace(/^(\\d)$/, "0$1") + ":" + \
                    String(d.getSeconds()).replace(/^(\\d)$/, "0$1");\
                var info = {\
                    appVersion: app.version,\
                    projectName: "No project open",\
                    timestamp: timestamp\
                };\
                try {\
                    if (app.project && app.project.name) {\
                        info.projectName = app.project.name;\
                    }\
                } catch(e) {}\
                return JSON.stringify(info);\
            } catch(e) {\
                return JSON.stringify({ error: String(e) });\
            }\
        })();';
        this.executeExtendScript(script, function(err, result) {
            if (err) {
                self.log('Premiere Pro connection failed: ' + err.message, 'error');
                self.updateServerStatus(false);
            } else {
                self.log('Premiere Pro connection OK: ' + JSON.stringify(result), 'info');
                self.updateServerStatus(true);
            }
        });
    };

    MCPPremiereBridge.prototype.updateUI = function() {
        var connectionStatus = document.getElementById('connectionStatus');
        var connectionText = document.getElementById('connectionText');
        if (connectionStatus && connectionText) {
            if (this.isConnected) {
                connectionStatus.className = 'status-dot connected';
                connectionText.textContent = 'Connected';
            } else {
                connectionStatus.className = 'status-dot disconnected';
                connectionText.textContent = 'Disconnected';
            }
        }
        var startBtn = document.getElementById('startButton');
        var stopBtn = document.getElementById('stopButton');
        if (startBtn) startBtn.disabled = this.isConnected;
        if (stopBtn) stopBtn.disabled = !this.isConnected;
        var tempEl = document.getElementById('tempDirectory');
        if (tempEl && !tempEl.value && this.getTempDirectory()) tempEl.value = this.getTempDirectory();
    };

    MCPPremiereBridge.prototype.updateServerStatus = function(isRunning) {
        var serverStatus = document.getElementById('serverStatus');
        var serverText = document.getElementById('serverText');
        if (serverStatus && serverText) {
            if (isRunning) {
                serverStatus.className = 'status-dot connected';
                serverText.textContent = 'Premiere Pro: Ready';
            } else {
                serverStatus.className = 'status-dot disconnected';
                serverText.textContent = 'Premiere Pro: Start Bridge to enable';
            }
        }
    };

    MCPPremiereBridge.prototype.log = function(message, level) {
        level = level || 'info';
        var logContainer = document.getElementById('logContainer');
        if (logContainer) {
            var el = document.createElement('div');
            el.className = 'log-entry ' + level;
            el.textContent = '[' + new Date().toISOString() + '] ' + message;
            logContainer.appendChild(el);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
        console.log(message);
    };

    MCPPremiereBridge.prototype.clearLog = function() {
        var logContainer = document.getElementById('logContainer');
        if (logContainer) logContainer.innerHTML = '<div class="log-entry info">Log cleared</div>';
    };

    window.MCPPremiereBridge = MCPPremiereBridge;
    window.bridge = null;
    window.startBridge = function() { if (window.bridge) window.bridge.startBridge(); };
    window.stopBridge = function() { if (window.bridge) window.bridge.stopBridge(); };
    window.runDiagnostics = function() { if (window.bridge) window.bridge.runDiagnostics(); };
    window.saveConfig = function() { if (window.bridge) window.bridge.saveConfig(); };
    window.clearLog = function() { if (window.bridge) window.bridge.clearLog(); };
    document.addEventListener('DOMContentLoaded', function() {
        window.bridge = new MCPPremiereBridge();
    });
})();
