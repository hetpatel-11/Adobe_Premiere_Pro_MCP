const { entrypoints } = require("uxp");
const ppro = require("premierepro");

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
            .on { background: #0f0; } .off { background: #f00; }
            button { background: #00a8ff; color: #fff; border: none; padding: 10px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; margin: 4px 4px 4px 0; }
            button:hover { background: #0088cc; }
            button:disabled { background: #666; cursor: default; }
            #log { background: #1a1a1a; border-radius: 4px; padding: 8px; margin-top: 10px; max-height: 250px; overflow-y: auto; font-family: monospace; font-size: 11px; }
            .ok { color: #0f0; } .warn { color: #ff0; } .err { color: #f00; }
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
          <div id="log"><div class="ok">Ready (UXP Native API)</div></div>
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
          while (el.children.length > 50) el.removeChild(el.firstChild);
        }

        function setStatus(on) {
          document.getElementById("dot").className = on ? "dot on" : "dot off";
          document.getElementById("statusText").textContent = on ? "Connected" : "Disconnected";
        }

        // ── Command Handlers (UXP Native API) ──
        async function handleCommand(cmd) {
          const action = cmd.action || "execute_script";
          const params = cmd.params || {};

          switch (action) {
            case "get_project_info": return await getProjectInfo();
            case "list_sequences": return await listSequences();
            case "list_sequence_tracks": return await listSequenceTracks(params);
            case "get_active_sequence": return await getActiveSequence();
            case "import_media": return await importMedia(params);
            case "get_sequence_settings": return await getSequenceSettings(params);
            case "test_connection": return await testConnection();
            default:
              return { success: false, error: "Unknown action: " + action };
          }
        }

        async function testConnection() {
          const project = await ppro.Project.getActiveProject();
          return { success: true, project: project.name, path: project.path };
        }

        async function getProjectInfo() {
          const project = await ppro.Project.getActiveProject();
          const seq = await project.getActiveSequence();
          const seqs = await project.getSequences();
          const rootItem = await project.getRootItem();
          return {
            success: true,
            name: project.name,
            path: project.path,
            guid: project.guid,
            activeSequence: seq ? { name: seq.name, guid: seq.guid } : null,
            sequenceCount: seqs ? seqs.length : 0,
            hasActiveSequence: !!seq
          };
        }

        async function listSequences() {
          const project = await ppro.Project.getActiveProject();
          const seqs = await project.getSequences();
          const result = [];
          if (seqs) {
            for (let i = 0; i < seqs.length; i++) {
              const s = seqs[i];
              const endTime = await s.getEndTime();
              result.push({
                id: s.guid,
                name: s.name,
                videoTrackCount: await s.getVideoTrackCount(),
                audioTrackCount: await s.getAudioTrackCount()
              });
            }
          }
          return { success: true, sequences: result, count: result.length };
        }

        async function getActiveSequence() {
          const project = await ppro.Project.getActiveProject();
          const seq = await project.getActiveSequence();
          if (!seq) return { success: false, error: "No active sequence" };
          return {
            success: true,
            id: seq.guid,
            name: seq.name,
            videoTrackCount: await seq.getVideoTrackCount(),
            audioTrackCount: await seq.getAudioTrackCount()
          };
        }

        async function listSequenceTracks(params) {
          const project = await ppro.Project.getActiveProject();
          let seq;
          if (params.sequenceId) {
            const seqs = await project.getSequences();
            for (const s of seqs) { if (s.guid === params.sequenceId) { seq = s; break; } }
          }
          if (!seq) seq = await project.getActiveSequence();
          if (!seq) return { success: false, error: "Sequence not found" };

          const videoTracks = [];
          const vtCount = await seq.getVideoTrackCount();
          for (let i = 0; i < vtCount; i++) {
            const track = await seq.getVideoTrack(i);
            videoTracks.push({ index: i, name: "V" + (i + 1) });
          }

          const audioTracks = [];
          const atCount = await seq.getAudioTrackCount();
          for (let i = 0; i < atCount; i++) {
            const track = await seq.getAudioTrack(i);
            audioTracks.push({ index: i, name: "A" + (i + 1) });
          }

          return {
            success: true,
            sequenceName: seq.name,
            sequenceId: seq.guid,
            videoTracks: videoTracks,
            audioTracks: audioTracks,
            totalVideoTracks: vtCount,
            totalAudioTracks: atCount
          };
        }

        async function importMedia(params) {
          const project = await ppro.Project.getActiveProject();
          const filePath = params.filePath;
          if (!filePath) return { success: false, error: "filePath required" };
          try {
            const result = await project.importFiles([filePath]);
            return { success: true, imported: true, filePath: filePath };
          } catch (err) {
            return { success: false, error: err.message, filePath: filePath };
          }
        }

        async function getSequenceSettings(params) {
          const project = await ppro.Project.getActiveProject();
          let seq;
          if (params.sequenceId) {
            const seqs = await project.getSequences();
            for (const s of seqs) { if (s.guid === params.sequenceId) { seq = s; break; } }
          }
          if (!seq) seq = await project.getActiveSequence();
          if (!seq) return { success: false, error: "Sequence not found" };
          const settings = await seq.getSettings();
          const frameSize = await seq.getFrameSize();
          return {
            success: true,
            name: seq.name,
            id: seq.guid,
            frameSize: frameSize,
            settings: settings
          };
        }

        // ── File Bridge Polling ──
        async function processCommands() {
          if (!folderToken) return;
          try {
            const entries = await folderToken.getEntries();
            for (const entry of entries) {
              if (entry.isFile && entry.name.startsWith("command-") && entry.name.endsWith(".json")) {
                try {
                  const content = await entry.read();
                  const cmd = JSON.parse(content);
                  log("Cmd: " + (cmd.action || "script") + " [" + cmd.id + "]");

                  let result;
                  if (cmd.action) {
                    result = await handleCommand(cmd);
                  } else {
                    result = { success: false, error: "ExtendScript not supported. Use action-based commands." };
                  }

                  const rn = entry.name.replace("command-", "response-");
                  const rf = await folderToken.createFile(rn, { overwrite: true });
                  await rf.write(JSON.stringify({ success: true, result: result, timestamp: new Date().toISOString() }));
                  await entry.delete();
                  log("Done: " + cmd.id);
                } catch (err) {
                  log("Error: " + err.message, "err");
                  try {
                    const rn = entry.name.replace("command-", "response-");
                    const rf = await folderToken.createFile(rn, { overwrite: true });
                    await rf.write(JSON.stringify({ error: err.message }));
                  } catch(e2) {}
                }
              }
            }
          } catch (err) {
            log("Poll: " + err.message, "err");
          }
        }

        // ── UI Event Handlers ──
        document.getElementById("btnStart").addEventListener("click", async function() {
          if (!folderToken) {
            log("Select temp folder...", "warn");
            const uxp = require("uxp");
            try {
              folderToken = await uxp.storage.localFileSystem.getFolder();
              log("Folder: " + folderToken.nativePath);
            } catch(e) { log("No folder", "err"); return; }
          }
          setStatus(true);
          document.getElementById("btnStart").disabled = true;
          document.getElementById("btnStop").disabled = false;
          polling = setInterval(processCommands, 500);
          log("Bridge started (UXP Native)");
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
            const result = await testConnection();
            log("OK: " + JSON.stringify(result));
          } catch (err) {
            log("Fail: " + err.message, "err");
          }
        });
      },
      show() {},
      hide() {}
    }
  }
});
