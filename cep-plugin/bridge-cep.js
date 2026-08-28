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
        '// Built from character codes rather than backslash literals: this text is',
        '// assembled in JavaScript before it reaches the host, so an escape written',
        '// for the ExtendScript string would be consumed once on the way.',
        'function __mcpEscapeString(value) {',
        '    var text = String(value);',
        '    var backslash = String.fromCharCode(92);',
        '    var out = "";',
        '    for (var i = 0; i < text.length; i++) {',
        '        var code = text.charCodeAt(i);',
        '        if (code === 34) { out += backslash + String.fromCharCode(34); }',
        '        else if (code === 92) { out += backslash + backslash; }',
        '        else if (code === 8) { out += backslash + "b"; }',
        '        else if (code === 9) { out += backslash + "t"; }',
        '        else if (code === 10) { out += backslash + "n"; }',
        '        else if (code === 12) { out += backslash + "f"; }',
        '        else if (code === 13) { out += backslash + "r"; }',
        '        else if (code < 32 || code === 0x2028 || code === 0x2029) {',
        '            var hex = code.toString(16);',
        '            while (hex.length < 4) { hex = "0" + hex; }',
        '            out += backslash + "u" + hex;',
        '        }',
        '        else { out += text.charAt(i); }',
        '    }',
        '    return out;',
        '}',
        '// Saved before anything can shadow it: reading hasOwnProperty off the value',
        '// being serialised lets that value decide which of its keys are emitted.',
        'var __mcpOwnProperty = Object.prototype.hasOwnProperty;',
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
        '            var isOwn = true;',
        '            try { isOwn = __mcpOwnProperty.call(value, key); } catch (ownError) { isOwn = true; }',
        '            if (!isOwn) continue;',
        '            var member;',
        '            try { member = value[key]; } catch (readError) { continue; }',
        '            if (typeof member === "undefined" || typeof member === "function") continue;',
        '            objectParts.push(__mcpStringify(String(key)) + ":" + __mcpStringify(member));',
        '        }',
        '        return "{" + objectParts.join(",") + "}";',
        '    }',
        '    return "null";',
        '}',
        'if (typeof JSON === "undefined") { JSON = {}; }',
        '// Installed unconditionally, matching the server prelude. This engine has',
        '// no JSON of its own, so the previous escaper was always the live one and',
        '// it passed control characters through raw. See src/bridge/index.ts.',
        'JSON.stringify = __mcpStringify;',
        'function __mcpParse(text) {',
        '  var source = String(text);',
        '  var at = 0;',
        '',
        '  function fail(what) {',
        '    throw new Error("JSON.parse: " + what + " at position " + at);',
        '  }',
        '  function skipWhitespace() {',
        '    while (at < source.length) {',
        '      var code = source.charCodeAt(at);',
        '      if (code === 32 || code === 9 || code === 10 || code === 13) { at++; } else { break; }',
        '    }',
        '  }',
        '  function expect(code) {',
        '    if (source.charCodeAt(at) !== code) fail("expected character " + code);',
        '    at++;',
        '  }',
        '  function parseString() {',
        '    expect(34);',
        '    var out = "";',
        '    while (at < source.length) {',
        '      var code = source.charCodeAt(at);',
        '      if (code === 34) { at++; return out; }',
        '      if (code === 92) {',
        '        at++;',
        '        var esc = source.charCodeAt(at);',
        '        at++;',
        '        if (esc === 34) { out += String.fromCharCode(34); }',
        '        else if (esc === 92) { out += String.fromCharCode(92); }',
        '        else if (esc === 47) { out += "/"; }',
        '        else if (esc === 98) { out += String.fromCharCode(8); }',
        '        else if (esc === 102) { out += String.fromCharCode(12); }',
        '        else if (esc === 110) { out += String.fromCharCode(10); }',
        '        else if (esc === 114) { out += String.fromCharCode(13); }',
        '        else if (esc === 116) { out += String.fromCharCode(9); }',
        '        else if (esc === 117) {',
        '          var hex = source.substr(at, 4);',
        '          if (hex.length !== 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) fail("bad unicode escape");',
        '          out += String.fromCharCode(parseInt(hex, 16));',
        '          at += 4;',
        '        }',
        '        else fail("bad escape");',
        '        continue;',
        '      }',
        '      // Unescaped control characters are not legal inside a JSON string.',
        '      if (code < 32) fail("unescaped control character");',
        '      out += source.charAt(at);',
        '      at++;',
        '    }',
        '    fail("unterminated string");',
        '  }',
        '  function parseNumber() {',
        '    var start = at;',
        '    if (source.charCodeAt(at) === 45) at++;',
        '    while (at < source.length && source.charCodeAt(at) >= 48 && source.charCodeAt(at) <= 57) at++;',
        '    if (source.charCodeAt(at) === 46) {',
        '      at++;',
        '      while (at < source.length && source.charCodeAt(at) >= 48 && source.charCodeAt(at) <= 57) at++;',
        '    }',
        '    var exponent = source.charCodeAt(at);',
        '    if (exponent === 101 || exponent === 69) {',
        '      at++;',
        '      var sign = source.charCodeAt(at);',
        '      if (sign === 43 || sign === 45) at++;',
        '      while (at < source.length && source.charCodeAt(at) >= 48 && source.charCodeAt(at) <= 57) at++;',
        '    }',
        '    var literal = source.substring(start, at);',
        '    if (!/^-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][-+]?[0-9]+)?$/.test(literal)) fail("bad number");',
        '    return Number(literal);',
        '  }',
        '  function parseWord() {',
        '    if (source.substr(at, 4) === "true") { at += 4; return true; }',
        '    if (source.substr(at, 5) === "false") { at += 5; return false; }',
        '    if (source.substr(at, 4) === "null") { at += 4; return null; }',
        '    fail("unexpected token");',
        '  }',
        '  function parseValue() {',
        '    skipWhitespace();',
        '    var code = source.charCodeAt(at);',
        '    if (code === 34) return parseString();',
        '    if (code === 123) {',
        '      at++;',
        '      var object = {};',
        '      skipWhitespace();',
        '      if (source.charCodeAt(at) === 125) { at++; return object; }',
        '      for (;;) {',
        '        skipWhitespace();',
        '        var key = parseString();',
        '        skipWhitespace();',
        '        expect(58);',
        '        var member = parseValue();',
        '        if (key === "__proto__") {',
        '          // Plain assignment here replaces the object"s prototype instead of',
        '          // adding a key: the value is then unreachable as an own property and',
        '          // the object inherits from whatever the payload contained. Define it',
        '          // where the engine allows, and otherwise drop it -- losing one key is',
        '          // recoverable, silently reparenting the object is not.',
        '          if (typeof Object.defineProperty === "function") {',
        '            try {',
        '              Object.defineProperty(object, key, {',
        '                value: member, enumerable: true, writable: true, configurable: true',
        '              });',
        '            } catch (defineError) { /* left out rather than assigned */ }',
        '          }',
        '        } else {',
        '          object[key] = member;',
        '        }',
        '        skipWhitespace();',
        '        if (source.charCodeAt(at) === 44) { at++; continue; }',
        '        expect(125);',
        '        return object;',
        '      }',
        '    }',
        '    if (code === 91) {',
        '      at++;',
        '      var array = [];',
        '      skipWhitespace();',
        '      if (source.charCodeAt(at) === 93) { at++; return array; }',
        '      for (;;) {',
        '        array.push(parseValue());',
        '        skipWhitespace();',
        '        if (source.charCodeAt(at) === 44) { at++; continue; }',
        '        expect(93);',
        '        return array;',
        '      }',
        '    }',
        '    if (code === 45 || (code >= 48 && code <= 57)) return parseNumber();',
        '    return parseWord();',
        '  }',
        '',
        '  var result = parseValue();',
        '  skipWhitespace();',
        '  if (at < source.length) fail("unexpected trailing content");',
        '  return result;',
        '}',
        'JSON.parse = __mcpParse;'
    ].join('\n');

    function getDefaultTempPath() {
        if (process.env.PREMIERE_TEMP_DIR) {
            return sanitizeTempDirectoryInput(process.env.PREMIERE_TEMP_DIR);
        }
        var base = (os.platform() === 'win32') ? (process.env.TEMP || process.env.TMP || 'C:\\Temp') : '/tmp';
        return path.join(base, 'premiere-mcp-bridge');
    }

    function getPanelConfigPath() {
        var configDir = path.join(os.homedir(), '.premiere-mcp-bridge');
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        return path.join(configDir, 'config.json');
    }

    function readExistingPanelConfig() {
        try {
            var configPath = getPanelConfigPath();
            if (!fs.existsSync(configPath)) return {};
            var parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (parsed && typeof parsed === 'object') return parsed;
        } catch (e) {}
        return {};
    }

    function readInstalledPackageVersion() {
        var dirs = [];
        try {
            if (typeof SystemPath !== 'undefined') {
                var cs = new CSInterface();
                if (cs.getSystemPath) dirs.push(cs.getSystemPath(SystemPath.EXTENSION));
            }
        } catch (eCs) {}
        if (typeof __dirname !== 'undefined') dirs.push(__dirname);
        for (var i = 0; i < dirs.length; i++) {
            try {
                var versionPath = path.join(dirs[i], 'mcp-version.json');
                if (fs.existsSync(versionPath)) {
                    var parsed = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
                    if (parsed && parsed.version) return String(parsed.version);
                }
            } catch (eRead) {}
        }
        return '1.2.3';
    }

    MCPPremiereBridge.prototype.comparePackageVersions = function(a, b) {
        var left = String(a).split('.');
        var right = String(b).split('.');
        for (var i = 0; i < 3; i++) {
            var l = parseInt(left[i], 10) || 0;
            var r = parseInt(right[i], 10) || 0;
            if (l > r) return 1;
            if (l < r) return -1;
        }
        return 0;
    };

    MCPPremiereBridge.prototype.shouldOfferUpdate = function(current, latest, snoozedUntil, now) {
        if (!latest || this.comparePackageVersions(latest, current) <= 0) return false;
        if (snoozedUntil && now < snoozedUntil) return false;
        return true;
    };

    MCPPremiereBridge.prototype.setUpdateBannerVisible = function(visible, latest, current) {
        var banner = document.getElementById('updateBanner');
        if (!banner) return;
        if (visible) banner.removeAttribute('hidden');
        else banner.setAttribute('hidden', '');
        var versionEl = document.getElementById('updateBannerVersion');
        if (versionEl && latest && current) versionEl.textContent = latest + ' available';
        var copyEl = document.getElementById('updateBannerCopy');
        if (copyEl && latest && current) {
            copyEl.textContent = latest + ' is recommended. You have ' + current + '. Update now, or later.';
        }
    };

    MCPPremiereBridge.prototype.setUpdateBannerStatus = function(message) {
        var statusEl = document.getElementById('updateBannerStatus');
        if (statusEl) statusEl.textContent = message || '';
    };

    MCPPremiereBridge.prototype.setUpdateButtonsDisabled = function(disabled) {
        var nowBtn = document.getElementById('updateNowButton');
        var laterBtn = document.getElementById('updateLaterButton');
        if (nowBtn) nowBtn.disabled = !!disabled;
        if (laterBtn) laterBtn.disabled = !!disabled;
    };

    MCPPremiereBridge.prototype.checkForPackageUpdate = function() {
        var self = this;
        var current = readInstalledPackageVersion();
        var config = readExistingPanelConfig();
        if (config.updateCheck === false) return;
        var snoozedUntil = typeof config.updateSnoozedUntil === 'number' ? config.updateSnoozedUntil : 0;
        if (snoozedUntil > Date.now()) return;
        var https;
        try { https = require('https'); } catch (eHttps) { return; }
        if (!https || typeof https.get !== 'function') return;
        var request = https.get({
            hostname: 'registry.npmjs.org',
            path: '/adobe-premiere-pro-mcp/latest',
            headers: { Accept: 'application/json', 'User-Agent': 'adobe-premiere-pro-mcp-cep/' + current }
        }, function(response) {
            var body = '';
            response.on('data', function(chunk) { body += chunk; });
            response.on('end', function() {
                try {
                    var parsed = JSON.parse(body);
                    var latest = parsed && parsed.version ? String(parsed.version) : '';
                    if (self.shouldOfferUpdate(current, latest, snoozedUntil, Date.now())) {
                        self.pendingUpdateVersion = latest;
                        self.setUpdateBannerVisible(true, latest, current);
                        self.log('Update recommended: ' + latest + ' is available (you have ' + current + ')', 'warning');
                    }
                } catch (eParse) {}
            });
        });
        request.on('error', function() {});
        request.setTimeout(2500, function() { request.abort(); });
    };

    MCPPremiereBridge.prototype.updateLater = function() {
        try {
            var panelConfig = readExistingPanelConfig();
            panelConfig.updateSnoozedUntil = Date.now() + (7 * 24 * 60 * 60 * 1000);
            fs.writeFileSync(getPanelConfigPath(), JSON.stringify(panelConfig, null, 2));
            this.setUpdateBannerVisible(false);
            this.log('Update reminder snoozed for 7 days', 'info');
        } catch (e) {
            this.log('Could not snooze the update reminder: ' + e.message, 'error');
        }
    };

    MCPPremiereBridge.prototype.updateNow = function() {
        var self = this;
        var childProcess;
        try { childProcess = require('child_process'); } catch (eCp) {
            this.setUpdateBannerStatus('Could not start npm from this panel. Run: npm install -g adobe-premiere-pro-mcp@latest && premiere-pro-mcp --install-cep');
            return;
        }
        this.setUpdateButtonsDisabled(true);
        this.setUpdateBannerStatus('Installing adobe-premiere-pro-mcp@latest…');
        var env = {};
        for (var key in process.env) {
            if (Object.prototype.hasOwnProperty.call(process.env, key)) env[key] = process.env[key];
        }
        var extra = os.platform() === 'win32'
            ? ''
            : ['/usr/local/bin', '/opt/homebrew/bin'].join(path.delimiter || ':');
        if (extra) env.PATH = extra + (path.delimiter || ':') + (env.PATH || '');
        var npmCmd = os.platform() === 'win32' ? 'npm.cmd' : 'npm';
        var npm = childProcess.spawn(npmCmd, ['install', '-g', 'adobe-premiere-pro-mcp@latest'], { env: env });
        var npmErr = '';
        npm.stderr.on('data', function(chunk) { npmErr += chunk; });
        npm.on('error', function(err) {
            self.setUpdateButtonsDisabled(false);
            self.setUpdateBannerStatus('Could not run npm. Run: npm install -g adobe-premiere-pro-mcp@latest && premiere-pro-mcp --install-cep');
            self.log('Update now failed: ' + err.message, 'error');
        });
        npm.on('close', function(code) {
            if (code !== 0) {
                self.setUpdateButtonsDisabled(false);
                self.setUpdateBannerStatus('npm install failed. Run: npm install -g adobe-premiere-pro-mcp@latest && premiere-pro-mcp --install-cep');
                self.log('Update now failed: ' + (npmErr || ('exit ' + code)), 'error');
                return;
            }
            var installer = os.platform() === 'win32' ? 'premiere-pro-mcp.cmd' : 'premiere-pro-mcp';
            var cep = childProcess.spawn(installer, ['--install-cep'], { env: env });
            cep.on('close', function(cepCode) {
                self.setUpdateButtonsDisabled(false);
                if (cepCode === 0) {
                    self.setUpdateBannerStatus('Updated. Reload this panel, then restart your MCP client.');
                    self.log('Updated MCP Bridge. Reload the panel and restart the MCP client.', 'info');
                } else {
                    self.setUpdateBannerStatus('Package installed. Reload this panel, restart the MCP client, and run premiere-pro-mcp --install-cep if the panel is still old.');
                }
            });
            cep.on('error', function() {
                self.setUpdateButtonsDisabled(false);
                self.setUpdateBannerStatus('Package installed. Run premiere-pro-mcp --install-cep, reload this panel, then restart your MCP client.');
            });
        });
    };

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
            trimmed = normalizePathLiteral(envMatch[1]);
        } else {
            trimmed = normalizePathLiteral(trimmed.replace(/^["']|["']$/g, ''));
        }

        if (os.platform() === 'win32' && /^\/tmp(?:\/|$)/.test(trimmed)) {
            return '';
        }

        return trimmed;
    }

    function MCPPremiereBridge() {
        this.isConnected = false;
        this.tempDirectory = '';
        this.commandQueue = [];
        this.isProcessing = false;
        this.evalScriptBusy = false;
        this.evalScriptQueue = [];
        this.telemetryEnabled = true;
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
        this.checkForPackageUpdate();
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

    // The server polls for this exact filename, so writing it directly publishes the
    // name before the content is complete and the server can read a truncated response.
    // rename() within one directory is atomic, so the file appears only once whole.
    MCPPremiereBridge.prototype.writeResponseAtomic = function(responseFile, payload) {
        var staging = responseFile + '.part';
        fs.writeFileSync(staging, JSON.stringify(payload, null, 2));
        fs.renameSync(staging, responseFile);
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
                var responseFile = filePath.replace('command-', 'response-');
                var responsePublished = false;
                try {
                    self.writeResponseAtomic(responseFile, result);
                    responsePublished = true;

                    // Guarded on its own. The server removes the command file on its
                    // timeout path, so this unlink can legitimately fail — and if it were
                    // allowed to reach the catch below it would overwrite the result that
                    // was just published, turning a completed command into an error.
                    try { fs.unlinkSync(filePath); } catch (eUnlink) {}

                    self.log('Command completed: ' + command.id, 'info');
                    self.updateCommandStatus(command.id, 'completed');
                } catch (e) {
                    if (!responsePublished) {
                        try {
                            self.writeResponseAtomic(responseFile, { error: e.message, timestamp: new Date().toISOString() });
                        } catch (eWrite) {}
                    }
                }
                // isProcessing stays true until the native evalScript callback
                // (see executeExtendScript). Clearing it here on a JS timeout lets
                // the poller start a second evalScript while the first is still
                // in flight, which permanently wedges CEP on hosts where the
                // callback is asynchronous.
            });
        } catch (e) {
            this.log('Error processing command file: ' + e.message, 'error');
            try {
                var responseFile = filePath.replace('command-', 'response-');
                this.writeResponseAtomic(responseFile, { error: e.message, timestamp: new Date().toISOString() });
                try { fs.unlinkSync(filePath); } catch (eUnlink) {}
            } catch (e2) {}
            this.isProcessing = false;
        }
    };

    MCPPremiereBridge.prototype.executeCommand = function(command, done) {
        this.updateCommandStatus(command.id, 'executing');
        if (!this.validateScript(command.script)) {
            done({ success: false, error: 'Script validation failed' });
            this.isProcessing = false;
            return;
        }
        this.executeExtendScript(command.script, function(err, result) {
            if (err) {
                done({ success: false, error: err.message });
                return;
            }
            done({ success: true, result: result, timestamp: new Date().toISOString() });
        }, command.timeoutMs);
    };

    MCPPremiereBridge.prototype.ensureEvalScriptQueue = function() {
        if (!this.evalScriptQueue) this.evalScriptQueue = [];
        if (typeof this.evalScriptBusy !== 'boolean') this.evalScriptBusy = false;
    };

    MCPPremiereBridge.prototype.releaseEvalScript = function() {
        this.evalScriptBusy = false;
        this.isProcessing = false;
        this.pumpEvalScript();
    };

    MCPPremiereBridge.prototype.pumpEvalScript = function() {
        this.ensureEvalScriptQueue();
        if (this.evalScriptBusy) return;
        if (this.evalScriptQueue.length === 0) return;
        this.evalScriptBusy = true;
        var job = this.evalScriptQueue.shift();
        this.runEvalScriptJob(job);
    };

    MCPPremiereBridge.prototype.executeExtendScript = function(script, callback, requestedTimeoutMs) {
        this.ensureEvalScriptQueue();
        this.evalScriptQueue.push({
            script: script,
            callback: callback,
            requestedTimeoutMs: requestedTimeoutMs
        });
        this.pumpEvalScript();
    };

    MCPPremiereBridge.prototype.runEvalScriptJob = function(job) {
        var self = this;
        var callback = job.callback;
        var requestedTimeoutMs = job.requestedTimeoutMs;
        try {
            if (!this.csInterface) {
                callback(new Error('CSInterface not initialized'));
                this.releaseEvalScript();
                return;
            }

            // Get host environment info for debugging
            var hostEnv = this.normalizeHostEnvironment(this.csInterface.getHostEnvironment());
            if (!hostEnv) {
                callback(new Error('Could not get host environment. Is Premiere Pro running?'));
                this.releaseEvalScript();
                return;
            }

            var script = job.script;
            var fullScript = EXTENDSCRIPT_COMPAT_HELPERS + '\n' + script;
            var waiterSettled = false;
            var nativeSettled = false;
            // Honor a per-command timeout from the server (batch operations request up to 300s).
            // Fall back to 45s when the server does not specify one, and never go below it.
            var timeoutMs = 45000;
            if (typeof requestedTimeoutMs === 'number' && requestedTimeoutMs > timeoutMs) {
                timeoutMs = requestedTimeoutMs;
            }

            function notifyWaiter(err, result) {
                if (waiterSettled) return;
                waiterSettled = true;
                callback(err, result);
            }

            function releaseAfterNative() {
                if (nativeSettled) return;
                nativeSettled = true;
                self.releaseEvalScript();
            }

            var timeoutId = setTimeout(function() {
                notifyWaiter(new Error(
                    'ExtendScript execution timed out after ' + timeoutMs + 'ms. ' +
                    'Premiere Pro or the CEP scripting host did not return a result.'
                ));
                // Do not release the native slot here. A second evalScript while the
                // first callback is still outstanding is what wedges CEP until Premiere
                // restarts (GitHub issue 86).
            }, timeoutMs);

            this.csInterface.evalScript(fullScript, function(result) {
                clearTimeout(timeoutId);
                // Defer result handling and lock release off the evalScript stack so
                // mixed-context Node I/O cannot block PlugPlug's handshake.
                setTimeout(function() {
                    if (!waiterSettled) {
                        self.log('EvalScript result: ' + result, 'info');

                        if (result === 'EvalScript error.' || result === 'EvalScript error') {
                            notifyWaiter(new Error(
                                'ExtendScript execution failed via CEP evalScript(). ' +
                                'This is usually a host-side scripting failure or CEP compatibility issue, not a JSON parsing problem.'
                            ));
                        } else if (typeof result === 'string' && result.indexOf('Error') === 0) {
                            notifyWaiter(new Error(result));
                        } else {
                            try {
                                notifyWaiter(null, JSON.parse(result));
                            } catch (e) {
                                notifyWaiter(null, result);
                            }
                        }
                    }
                    releaseAfterNative();
                }, 0);
            });
        } catch (e) {
            callback(e);
            this.releaseEvalScript();
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

    MCPPremiereBridge.prototype.writeHeartbeat = function() {
        try {
            var tempPath = this.getTempDirectory();
            if (!tempPath) return;
            fs.writeFileSync(path.join(tempPath, 'bridge-heartbeat.json'), JSON.stringify({
                t: Date.now(),
                started: !!this.isConnected
            }));
        } catch (e) {}
    };

    MCPPremiereBridge.prototype.startCommandPolling = function() {
        var self = this;
        setInterval(function() {
            self.writeHeartbeat();
            if (!self.isProcessing && !self.evalScriptBusy && self.isConnected) {
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
            var panelConfigPath = getPanelConfigPath();
            if (fs.existsSync(panelConfigPath)) {
                var panelConfig = JSON.parse(fs.readFileSync(panelConfigPath, 'utf8'));
                if (panelConfig.tempDirectory) {
                    this.tempDirectory = sanitizeTempDirectoryInput(panelConfig.tempDirectory);
                }
                if (typeof panelConfig.telemetry === 'boolean') {
                    this.telemetryEnabled = panelConfig.telemetry;
                }
            }

            var candidatePaths = this.tempDirectory ? [this.tempDirectory, getDefaultTempPath()] : [getDefaultTempPath()];
            if (process.env.PREMIERE_TEMP_DIR) {
                candidatePaths.push(sanitizeTempDirectoryInput(process.env.PREMIERE_TEMP_DIR));
            }

            for (var i = 0; !this.tempDirectory && i < candidatePaths.length; i++) {
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
                } else {
                    tempEl.value = getDefaultTempPath();
                }
            }

            var telemetryEl = document.getElementById('telemetryEnabled');
            if (telemetryEl) telemetryEl.checked = this.telemetryEnabled !== false;
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
            fs.writeFileSync(path.join(ensuredTempDir, 'config.json'), JSON.stringify({ tempDirectory: this.tempDirectory }, null, 2));
            var panelConfig = readExistingPanelConfig();
            panelConfig.tempDirectory = this.tempDirectory;
            panelConfig.telemetry = this.readTelemetryEnabled();
            fs.writeFileSync(getPanelConfigPath(), JSON.stringify(panelConfig, null, 2));
            this.log('Configuration saved', 'info');
        } catch (e) {
            this.log('Error saving config: ' + e.message, 'error');
        }
    };

    MCPPremiereBridge.prototype.readTelemetryEnabled = function() {
        var telemetryEl = document.getElementById('telemetryEnabled');
        if (telemetryEl) this.telemetryEnabled = !!telemetryEl.checked;
        return this.telemetryEnabled !== false;
    };

    MCPPremiereBridge.prototype.saveTelemetryPreference = function() {
        try {
            var panelConfig = readExistingPanelConfig();
            panelConfig.telemetry = this.readTelemetryEnabled();
            fs.writeFileSync(getPanelConfigPath(), JSON.stringify(panelConfig, null, 2));
            this.log(this.telemetryEnabled ? 'Anonymous usage data enabled' : 'Anonymous usage data disabled', 'info');
        } catch (e) {
            this.log('Error saving telemetry preference: ' + e.message, 'error');
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
    window.saveTelemetryPreference = function() { if (window.bridge) window.bridge.saveTelemetryPreference(); };
    window.clearLog = function() { if (window.bridge) window.bridge.clearLog(); };
    window.updateNow = function() { if (window.bridge) window.bridge.updateNow(); };
    window.updateLater = function() { if (window.bridge) window.bridge.updateLater(); };
    document.addEventListener('DOMContentLoaded', function() {
        window.bridge = new MCPPremiereBridge();
    });
})();
