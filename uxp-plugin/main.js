const { entrypoints } = require("uxp");

entrypoints.setup({
  panels: {
    "mcp-uxp-bridge-panel": {
      create() {
        const root = document.createElement("div");
        root.innerHTML = `
          <style>
            body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 12px; background: #2d2d2d; color: #fff; }
            h2 { color: #00a8ff; font-size: 16px; margin: 0 0 12px; }
            .status { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
            .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
            .on { background: #0f0; }
            .off { background: #f00; }
            button { background: #00a8ff; color: #fff; border: none; padding: 10px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; margin: 4px 4px 4px 0; }
            button:hover { background: #0088cc; }
            button:disabled { background: #666; cursor: default; }
            #log { background: #1a1a1a; border-radius: 4px; padding: 8px; margin-top: 10px; max-height: 200px; overflow-y: auto; font-family: monospace; font-size: 11px; }
            .ok { color: #0f0; }
            .warn { color: #ff0; }
            .err { color: #f00; }
          </style>
          <h2>MCP Premiere Pro Bridge</h2>
          <div class="status">
            <span class="dot off" id="dot"></span>
            <span id="statusText">Disconnected</span>
          </div>
          <div>
            <button id="btnStart">Start Bridge</button>
            <button id="btnStop" disabled>Stop Bridge</button>
            <button id="btnTest">Test</button>
          </div>
          <div id="log"><div class="ok">Ready</div></div>
        `;
        document.body.appendChild(root);

        let polling = null;
        let folderToken = null;

        function log(msg, cls) {
          cls = cls || "ok";
          const el = document.getElementById("log");
          const d = document.createElement("div");
          d.className = cls;
          d.textContent = "[" + new Date().toLocaleTimeString() + "] " + msg;
          el.appendChild(d);
          el.scrollTop = el.scrollHeight;
        }

        function setStatus(on) {
          document.getElementById("dot").className = on ? "dot on" : "dot off";
          document.getElementById("statusText").textContent = on ? "Connected" : "Disconnected";
        }

        async function selectFolder() {
          const uxp = require("uxp");
          folderToken = await uxp.storage.localFileSystem.getFolder();
          log("Temp folder: " + folderToken.nativePath);
        }

        async function runScript(script) {
          const ppro = require("premierepro");
          const App = ppro.Application;
          log("Application type: " + typeof App, "warn");
          if (App) {
            const proto = Object.getOwnPropertyNames(App.prototype || {}).join(", ");
            const statics = Object.getOwnPropertyNames(App).join(", ");
            log("App static: " + statics, "warn");
            log("App proto: " + proto, "warn");
          }
          const Proj = ppro.Project;
          if (Proj) {
            const statics = Object.getOwnPropertyNames(Proj).join(", ");
            const proto = Object.getOwnPropertyNames(Proj.prototype || {}).join(", ");
            log("Project static: " + statics, "warn");
            log("Project proto: " + proto, "warn");
          }
          throw new Error("Diagnostic done");
        }

        async function processCommands() {
          if (!folderToken) return;
          try {
            const entries = await folderToken.getEntries();
            for (const entry of entries) {
              if (entry.isFile && entry.name.startsWith("command-") && entry.name.endsWith(".json")) {
                try {
                  const content = await entry.read();
                  const cmd = JSON.parse(content);
                  log("Exec: " + cmd.id);
                  const result = await runScript(cmd.script);
                  let parsed;
                  try { parsed = JSON.parse(result); } catch(e) { parsed = result; }
                  const rn = entry.name.replace("command-", "response-");
                  const rf = await folderToken.createFile(rn, { overwrite: true });
                  await rf.write(JSON.stringify({ success: true, result: parsed, timestamp: new Date().toISOString() }));
                  await entry.delete();
                  log("Done: " + cmd.id);
                } catch (err) {
                  log("Cmd error: " + err.message, "err");
                  try {
                    const rn = entry.name.replace("command-", "response-");
                    const rf = await folderToken.createFile(rn, { overwrite: true });
                    await rf.write(JSON.stringify({ error: err.message }));
                  } catch(e2) {}
                }
              }
            }
          } catch (err) {
            log("Poll error: " + err.message, "err");
          }
        }

        document.getElementById("btnStart").addEventListener("click", async function() {
          if (!folderToken) {
            log("Select temp folder...", "warn");
            await selectFolder();
            if (!folderToken) { log("No folder selected", "err"); return; }
          }
          setStatus(true);
          document.getElementById("btnStart").disabled = true;
          document.getElementById("btnStop").disabled = false;
          polling = setInterval(processCommands, 500);
          log("Bridge started");
        });

        document.getElementById("btnStop").addEventListener("click", function() {
          if (polling) { clearInterval(polling); polling = null; }
          setStatus(false);
          document.getElementById("btnStart").disabled = false;
          document.getElementById("btnStop").disabled = true;
          log("Bridge stopped");
        });

        document.getElementById("btnTest").addEventListener("click", async function() {
          try {
            const result = await runScript('(function(){ return JSON.stringify({ok:true, project: app.project.name}); })()');
            log("Test OK: " + result);
          } catch (err) {
            log("Test fail: " + err.message, "err");
          }
        });
      },
      show() {},
      hide() {}
    }
  }
});
