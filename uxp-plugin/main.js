const { entrypoints } = require("uxp");
const ppro = require("premierepro");

entrypoints.setup({
  panels: {
    "mcp-uxp-bridge-panel": {
      create() {
        const root = document.createElement("div");
        root.innerHTML = `
          <style>
            body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #1e1e1e; color: #e0e0e0; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
            .header { padding: 8px 10px 0; }
            .header h2 { color: #0af; font-size: 14px; margin: 0 0 6px; }
            .status-bar { display: flex; align-items: center; gap: 6px; font-size: 11px; margin-bottom: 6px; }
            .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
            .on { background: #0f0; box-shadow: 0 0 4px #0f0; } .off { background: #f44; }
            #seqInfo { font-size: 10px; color: #888; margin-left: auto; }
            .ctrl-row { display: flex; gap: 4px; margin-bottom: 6px; }
            .tab-bar { display: flex; border-bottom: 2px solid #333; padding: 0 10px; }
            .tab-btn { flex: 1; background: none; border: none; color: #888; padding: 7px 0; font-size: 11px; cursor: pointer; text-align: center; border-bottom: 2px solid transparent; margin-bottom: -2px; }
            .tab-btn:hover { color: #ccc; }
            .tab-btn.active { color: #0af; border-bottom-color: #0af; font-weight: bold; }
            .tab-content { padding: 8px 10px; overflow-y: auto; flex: 1; }
            .tab-page { display: none; }
            .tab-page.active { display: block; }
            button { background: #2a2a2a; color: #ddd; border: 1px solid #444; padding: 6px 10px; border-radius: 5px; cursor: pointer; font-size: 11px; }
            button:hover { background: #383838; border-color: #0af; }
            button:disabled { opacity: 0.35; }
            button.primary { background: #0a7ea4; color: #fff; border-color: #0af; font-weight: bold; }
            button.danger { border-color: #f44; color: #f88; }
            .btn-row { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
            .section { margin-bottom: 10px; }
            .section-title { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px; border-bottom: 1px solid #2a2a2a; padding-bottom: 3px; }
            .edit-options { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
            .edit-opt { background: #252525; border: 1px solid #444; border-radius: 14px; padding: 4px 10px; font-size: 10px; cursor: pointer; user-select: none; }
            .edit-opt:hover { border-color: #0af; }
            .edit-opt.active { background: #0a3d5c; border-color: #0af; color: #0af; }
            #chatBox { background: #111; border-radius: 6px; padding: 10px; overflow-y: auto; font-size: 12px; min-height: 150px; max-height: 400px; }
            .chat-msg { padding: 7px 10px; margin-bottom: 5px; border-radius: 10px; max-width: 85%; word-wrap: break-word; line-height: 1.4; }
            .chat-msg.user { background: #1a3a1a; color: #8f8; margin-left: auto; text-align: right; }
            .chat-msg.ai { background: #1a2a3a; color: #8cf; }
            .attach-area { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 0; }
            .attach-chip { display: inline-flex; align-items: center; gap: 4px; background: #1a2a1a; border: 1px solid #4a4; border-radius: 12px; padding: 3px 10px; font-size: 10px; color: #8f8; }
            .attach-chip .remove { cursor: pointer; color: #f88; font-weight: bold; }
            .chat-input-row { display: flex; gap: 5px; padding: 6px 0; }
            .chat-input-row sp-textfield { flex: 1; }
            #log { background: #111; border-radius: 6px; padding: 8px; font-family: Consolas, monospace; font-size: 10px; overflow-y: auto; min-height: 150px; }
            .ok { color: #0f0; } .warn { color: #ff0; } .err { color: #f44; } .info { color: #0af; }

            /* 나레이션 탭 */
            .voice-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px; }
            .voice-card { background: #252525; border: 2px solid #333; border-radius: 10px; padding: 8px 4px; text-align: center; cursor: pointer; transition: all 0.15s; }
            .voice-card:hover { border-color: #0af; background: #1a2a3a; }
            .voice-card.selected { border-color: #0af; background: #0a3d5c; box-shadow: 0 0 8px rgba(0,170,255,0.3); }
            .voice-avatar { width: 44px; height: 44px; border-radius: 50%; margin: 0 auto 5px; display: flex; align-items: center; justify-content: center; font-size: 26px; background: #1a1a2e; }
            .voice-name { font-size: 10px; color: #ccc; line-height: 1.2; }
            .voice-card.selected .voice-name { color: #0af; font-weight: bold; }
            .voice-tag { font-size: 8px; color: #888; margin-top: 2px; }
            .voice-card.selected .voice-tag { color: #6cf; }
            .narr-section { margin-bottom: 10px; }
            .narr-section-title { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; border-bottom: 1px solid #2a2a2a; padding-bottom: 3px; }
            .narr-textarea { width: 100%; min-height: 60px; background: #111; border: 1px solid #444; border-radius: 8px; color: #e0e0e0; font-size: 12px; padding: 8px; resize: vertical; font-family: 'Segoe UI', sans-serif; box-sizing: border-box; }
            .narr-textarea:focus { border-color: #0af; outline: none; }
            .narr-controls { display: flex; gap: 6px; align-items: center; margin-bottom: 8px; }
            .narr-controls label { font-size: 10px; color: #aaa; }
            .narr-controls sp-slider { flex: 1; }
            .speed-val { font-size: 11px; color: #0af; font-weight: bold; min-width: 32px; text-align: center; }
            .narr-btn-row { display: flex; gap: 6px; }
            .narr-preview { background: #1a1a2e; border: 1px solid #333; border-radius: 8px; padding: 8px; margin-top: 8px; font-size: 11px; color: #aaa; }
            .narr-preview .preview-name { color: #0af; font-weight: bold; }
            .narr-preview .preview-voice { color: #888; font-size: 10px; }
          </style>

          <div style="display:flex; flex-direction:column; height:100vh; overflow:hidden;">
            <!-- ── 상단 고정 헤더 ── -->
            <div class="header">
              <h2>🎬 MCP 편집 도우미</h2>
              <div class="status-bar">
                <span class="dot off" id="dot"></span>
                <span id="statusText">연결 안됨</span>
                <span id="seqInfo">시퀀스: -</span>
              </div>
              <div class="ctrl-row">
                <button id="btnStart" class="primary">▶️ 시작</button>
                <button id="btnStop" disabled>⏹️ 정지</button>
                <button id="btnTest">🔄 테스트</button>
                <button id="btnSave">💾 저장</button>
              </div>
            </div>

            <!-- ── 탭 바 ── -->
            <div class="tab-bar">
              <div class="tab-btn active" data-tab="edit">🎬 편집</div>
              <div class="tab-btn" data-tab="narr">🎙️ 나레이션</div>
              <div class="tab-btn" data-tab="chat">💬 채팅</div>
              <div class="tab-btn" data-tab="log">📋 로그</div>
            </div>

            <!-- ── 탭 컨텐츠 ── -->
            <div class="tab-content">

              <!-- 탭1: 편집 도구 -->
              <div id="tab-edit" class="tab-page active">
                <div class="section">
                  <div class="section-title">📌 편집 조건</div>
                  <div class="edit-options">
                    <span class="edit-opt active" data-opt="autocut">✂️ 자동 컷편</span>
                    <span class="edit-opt active" data-opt="subtitle">📝 자막</span>
                    <span class="edit-opt active" data-opt="sfx">🔊 효과음</span>
                    <span class="edit-opt active" data-opt="bgm">🎵 BGM</span>
                    <span class="edit-opt active" data-opt="photo">🖼️ 사진배치</span>
                    <span class="edit-opt active" data-opt="sticker">😀 스티커</span>
                    <span class="edit-opt active" data-opt="color">🎨 색보정</span>
                  </div>
                </div>
                <div class="section">
                  <div class="section-title">🤖 AI 도구</div>
                  <div class="btn-row">
                    <button id="btnAnalyze">🔍 패턴 분석</button>
                    <button id="btnAutoApply" class="primary">🚀 자동 적용</button>
                  </div>
                </div>
                <div class="section">
                  <div class="section-title">⚡ 빠른 실행</div>
                  <div class="btn-row">
                    <button id="btnInfo">📊 정보</button>
                    <button id="btnTransitions">✨ 트랜지션</button>
                    <button id="btnCleanup" class="danger">🗑️ 정리</button>
                  </div>
                </div>
                <div class="section">
                  <div class="section-title">📦 일괄 처리</div>
                  <div class="btn-row">
                    <button id="btnBatchScale">📐 스케일</button>
                    <button id="btnBatchOpacity">🔲 투명도</button>
                    <button id="btnMuteAll">🔇 음소거</button>
                  </div>
                </div>
              </div>

              <!-- 탭2: 나레이션 -->
              <div id="tab-narr" class="tab-page">
                <div class="narr-section">
                  <div class="narr-section-title">🎭 캐릭터 선택</div>
                  <div class="voice-grid" id="voiceGrid">
                    <div class="voice-card selected" data-voice="ko-KR-InJoonNeural" data-rate="1.0">
                      <div class="voice-avatar">🎤</div>
                      <div class="voice-name">기본 남자</div>
                      <div class="voice-tag">차분한 남성</div>
                    </div>
                    <div class="voice-card" data-voice="ko-KR-SunHiNeural" data-rate="1.0">
                      <div class="voice-avatar">👩</div>
                      <div class="voice-name">기본 여자</div>
                      <div class="voice-tag">밝은 여성</div>
                    </div>
                    <div class="voice-card" data-voice="ko-KR-HyunsuMultilingualNeural" data-rate="1.0">
                      <div class="voice-avatar">🧑‍💼</div>
                      <div class="voice-name">현수</div>
                      <div class="voice-tag">자연스러운 남성</div>
                    </div>
                    <div class="voice-card" data-voice="ko-KR-InJoonNeural" data-rate="1.3">
                      <div class="voice-avatar">🏃</div>
                      <div class="voice-name">스포츠 엠씨</div>
                      <div class="voice-tag">빠른 남성</div>
                    </div>
                    <div class="voice-card" data-voice="ko-KR-SunHiNeural" data-rate="0.85">
                      <div class="voice-avatar">📖</div>
                      <div class="voice-name">동화 나레이터</div>
                      <div class="voice-tag">느린 여성</div>
                    </div>
                    <div class="voice-card" data-voice="ko-KR-InJoonNeural" data-rate="0.8">
                      <div class="voice-avatar">🎩</div>
                      <div class="voice-name">신사</div>
                      <div class="voice-tag">느긋한 남성</div>
                    </div>
                    <div class="voice-card" data-voice="ko-KR-SunHiNeural" data-rate="1.2">
                      <div class="voice-avatar">💃</div>
                      <div class="voice-name">쇼핑 호스트</div>
                      <div class="voice-tag">활기찬 여성</div>
                    </div>
                    <div class="voice-card" data-voice="ko-KR-HyunsuMultilingualNeural" data-rate="0.9">
                      <div class="voice-avatar">📺</div>
                      <div class="voice-name">뉴스 앵커</div>
                      <div class="voice-tag">또박또박</div>
                    </div>
                    <div class="voice-card" data-voice="en-US-AndrewNeural" data-rate="1.0">
                      <div class="voice-avatar">🇺🇸</div>
                      <div class="voice-name">Andrew</div>
                      <div class="voice-tag">English Male</div>
                    </div>
                    <div class="voice-card" data-voice="en-US-AvaNeural" data-rate="1.0">
                      <div class="voice-avatar">🇬🇧</div>
                      <div class="voice-name">Ava</div>
                      <div class="voice-tag">English Female</div>
                    </div>
                    <div class="voice-card" data-voice="ja-JP-KeitaNeural" data-rate="1.0">
                      <div class="voice-avatar">🇯🇵</div>
                      <div class="voice-name">케이타</div>
                      <div class="voice-tag">日本語 男性</div>
                    </div>
                    <div class="voice-card" data-voice="ja-JP-NanamiNeural" data-rate="1.0">
                      <div class="voice-avatar">🌸</div>
                      <div class="voice-name">나나미</div>
                      <div class="voice-tag">日本語 女性</div>
                    </div>
                  </div>
                </div>

                <div class="narr-section">
                  <div class="narr-section-title">📝 나레이션 텍스트</div>
                  <sp-textfield id="narrText" placeholder="나레이션 텍스트 입력" multiline="true" style="width:100%; min-height:60px;"></sp-textfield>
                </div>

                <div class="narr-section">
                  <div class="narr-section-title">⚙️ 설정</div>
                  <div class="narr-controls">
                    <label>속도:</label>
                    <sp-slider id="narrSpeed" min="5" max="20" value="10" step="1" style="flex:1;"></sp-slider>
                    <span class="speed-val" id="narrSpeedVal">1.0x</span>
                  </div>
                </div>

                <div class="narr-btn-row">
                  <button id="btnNarrPreview">🔊 미리듣기</button>
                  <button id="btnNarrGenerate" class="primary" style="flex:1;">🎙️ 생성 + 프리미어 임포트</button>
                </div>

                <div class="narr-preview" id="narrPreview">
                  <span class="preview-name">기본 남자</span> 선택됨<br>
                  <span class="preview-voice">ko-KR-InJoonNeural · 1.0x</span>
                </div>
              </div>

              <!-- 탭3: 채팅 (스크롤 가능) -->
              <div id="tab-chat" class="tab-page">
                <div id="chatBox">
                  <div class="chat-msg ai">안녕하세요! 편집 요청을 입력해주세요 😊</div>
                  <div class="chat-msg ai">📎 파일 첨부: 아래 📎 버튼으로 템플릿/사진 첨부 가능!</div>
                </div>
                <div id="attachArea" class="attach-area"></div>
                <div class="chat-input-row">
                  <button id="btnAttach" class="btn-attach" title="파일 첨부">📎</button>
                  <sp-textfield id="chatInput" placeholder="예: 이 템플릿으로 수정해줘" style="flex:1;"></sp-textfield>
                  <button id="btnSend" class="primary">📨 전송</button>
                </div>
              </div>

              <!-- 탭4: 로그 -->
              <div id="tab-log" class="tab-page">
                <div id="log"><div class="ok">✅ 준비 완료 (UXP v2)</div></div>
              </div>

            </div>
          </div>
        `;
        document.body.appendChild(root);

        let polling = null;
        let folderToken = null;

        // ── 탭 전환 ──
        function switchTab(tabName) {
          document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
          document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));
          const btn = document.querySelector('.tab-btn[data-tab="' + tabName + '"]');
          const page = document.getElementById("tab-" + tabName);
          if (btn) btn.classList.add("active");
          if (page) page.classList.add("active");
          // 채팅 탭 열면 알림 제거
          if (tabName === "chat") {
            const chatTab = document.querySelector('.tab-btn[data-tab="chat"]');
            if (chatTab) chatTab.textContent = "💬 채팅";
          }
        }
        document.querySelectorAll(".tab-btn").forEach(function(btn) {
          btn.addEventListener("click", function() {
            switchTab(btn.dataset.tab);
          });
        });

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
          document.getElementById("statusText").textContent = on ? "연결됨" : "연결 안됨";
        }

        // ── Command Handlers (UXP Native API) ──
        async function handleCommand(cmd) {
          const action = cmd.action || "execute_script";
          const params = cmd.params || {};

          switch (action) {
            // ── Project & Sequence ──
            case "get_project_info": return await getProjectInfo();
            case "list_sequences": return await listSequences();
            case "list_sequence_tracks": return await listSequenceTracks(params);
            case "get_active_sequence": return await getActiveSequence();
            case "get_sequence_settings": return await getSequenceSettings(params);
            case "create_sequence": return await createNewSequence(params);
            case "set_active_sequence": return await setActiveSeq(params);
            case "delete_sequence": return await deleteSeq(params);
            case "save_project": return await saveProject();
            case "test_connection": return await testConnection();
            // ── Media & Items ──
            case "import_media": return await importMedia(params);
            case "import_files": return await importFilesToBin(params);
            case "list_project_items": return await listProjectItems();
            case "list_track_clips": return await listTrackClips(params);
            // ── Timeline Editing ──
            case "add_to_timeline": return await addToTimeline(params);
            case "trim_clip": return await trimClip(params);
            case "split_clip": return await splitClip(params);
            case "move_clip": return await moveClip(params);
            case "remove_clip": return await removeClip(params);
            case "add_track": return await addTrack(params);
            // ── Clip Properties ──
            case "set_clip_properties": return await setClipProperties(params);
            case "set_clip_scale": return await setClipScale(params);
            case "set_clip_opacity": return await setClipOpacity(params);
            case "batch_set_properties": return await batchSetProperties(params);
            // ── Effects & Transitions ──
            case "add_transition": return await addTransition(params);
            case "batch_add_transitions": return await batchAddTransitions(params);
            case "list_transitions": return await listTransitions();
            // ── Audio ──
            case "mute_track": return await muteTrack(params);
            // ── Playhead ──
            case "get_playhead": return await getPlayhead();
            case "set_playhead": return await setPlayhead(params);
            // ── Template Learning (Auto Cut) ──
            case "analyze_look": return await analyzeLook(params);
            case "apply_template": return await applyTemplate(params);
            // ── Utilities ──
            case "eval_code": return await evalCode(params);
            case "get_clip_info": return await getClipInfo(params);
            case "cleanup_sequences": return await cleanupSequences(params);
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
              try {
                result.push({
                  id: s.guid,
                  name: s.name,
                  videoTrackCount: await s.getVideoTrackCount(),
                  audioTrackCount: await s.getAudioTrackCount()
                });
              } catch(e) {
                result.push({ id: s.guid, name: s.name, error: e.message });
              }
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
            const rootItem = await project.getRootItem();
            const result = await project.importFiles([filePath], true, rootItem);
            return { success: true, imported: true, filePath: filePath };
          } catch (err) {
            return { success: false, error: err.message, filePath: filePath };
          }
        }

        // ── Import multiple files to root bin ──
        // params: { filePaths: string[] }
        async function importFilesToBin(params) {
          const project = await ppro.Project.getActiveProject();
          const paths = params.filePaths;
          if (!paths || !paths.length) return { success: false, error: "filePaths[] required" };
          const rootItem = await project.getRootItem();
          let imported = 0;
          const errors = [];
          for (const fp of paths) {
            try {
              await project.importFiles([fp], true, rootItem);
              imported++;
            } catch(e) { errors.push(fp + ": " + e.message); }
          }
          return { success: imported > 0, imported, total: paths.length, errors };
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

        // ── List clips on a track (cleaned up) ──
        async function listTrackClips(params) {
          const project = await ppro.Project.getActiveProject();
          const seq = await project.getActiveSequence();
          if (!seq) return { success: false, error: "No active sequence" };

          const trackType = params.trackType || "video";
          const trackIndex = params.trackIndex !== undefined ? params.trackIndex : 0;

          let track;
          if (trackType === "video") track = await seq.getVideoTrack(trackIndex);
          else track = await seq.getAudioTrack(trackIndex);
          if (!track) return { success: false, error: "Track not found" };

          const items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
          const clips = [];
          if (items && items.length) {
            for (let i = 0; i < items.length; i++) {
              const clip = items[i];
              const info = { index: i };
              try { info.name = clip.name; } catch(e) {}
              try {
                const st = await clip.getStartTime();
                info.startSeconds = Number(st.ticks) / 254016000000;
              } catch(e) {}
              try {
                const et = await clip.getEndTime();
                info.endSeconds = Number(et.ticks) / 254016000000;
              } catch(e) {}
              try {
                const pi = await clip.getProjectItem();
                if (pi) info.projectItemName = pi.name;
              } catch(e) {}
              clips.push(info);
            }
          }
          return { success: true, trackType, trackIndex, clipCount: clips.length, clips };
        }

        // ── Add clip to timeline ──
        async function addToTimeline(params) {
          const project = await ppro.Project.getActiveProject();
          const seq = await project.getActiveSequence();
          if (!seq) return { success: false, error: "No active sequence" };

          // Find project item by name
          let projectItem = null;
          if (params.itemName) {
            const rootItem = await project.getRootItem();
            const kids = await rootItem.getItems();
            for (let i = 0; i < kids.length; i++) {
              if (kids[i].name === params.itemName) { projectItem = kids[i]; break; }
            }
          }
          if (!projectItem) return { success: false, error: "Project item not found: " + params.itemName };

          const videoTrackIndex = params.videoTrackIndex !== undefined ? params.videoTrackIndex : (params.trackIndex !== undefined ? params.trackIndex : 0);
          const audioTrackIndex = params.audioTrackIndex !== undefined ? params.audioTrackIndex : 0;
          const startSeconds = params.timeSeconds !== undefined ? params.timeSeconds : (params.startTime || 0);
          const mode = params.mode || "overwrite"; // "insert" or "overwrite"
          const limitShift = params.limitShift !== undefined ? params.limitShift : false;

          try {
            const editor = ppro.SequenceEditor.getEditor(seq);
            const time = ppro.TickTime.createWithSeconds(startSeconds);

            // CORRECT PATTERN: lockedAccess + executeTransaction + compoundAction.addAction
            // Actions MUST be created inside the locked+transaction scope
            // Use RAW projectItem (NOT ClipProjectItem.queryCast)
            project.lockedAccess(() => {
              project.executeTransaction((compoundAction) => {
                let action;
                if (mode === "insert") {
                  action = editor.createInsertProjectItemAction(projectItem, time, videoTrackIndex, audioTrackIndex, limitShift);
                } else {
                  action = editor.createOverwriteItemAction(projectItem, time, videoTrackIndex, audioTrackIndex);
                }
                compoundAction.addAction(action);
              });
            });

            return {
              success: true,
              method: mode === "insert" ? "createInsertProjectItemAction" : "createOverwriteItemAction",
              itemName: params.itemName,
              videoTrackIndex,
              audioTrackIndex,
              startTime: startSeconds,
              mode
            };
          } catch(e) {
            return { success: false, error: e.message, stack: e.stack };
          }
        }

        // ── Trim clip ──
        async function trimClip(params) {
          const project = await ppro.Project.getActiveProject();
          const seq = await project.getActiveSequence();
          if (!seq) return { success: false, error: "No active sequence" };

          const trackType = params.trackType || "video";
          const trackIndex = params.trackIndex || 0;
          const clipIndex = params.clipIndex || 0;

          let track;
          if (trackType === "video") track = await seq.getVideoTrack(trackIndex);
          else track = await seq.getAudioTrack(trackIndex);
          if (!track) return { success: false, error: "Track not found" };

          let items = null;
          try { items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false); } catch(e) {}
          if (!items || clipIndex >= items.length) return { success: false, error: "Clip not found at index " + clipIndex };

          const clip = items[clipIndex];

          try {
            // CORRECT PATTERN: lockedAccess + executeTransaction + compoundAction
            // Each parameter gets its own transaction to avoid conflicts
            let actionsApplied = 0;

            if (params.startTime !== undefined) {
              project.lockedAccess(() => {
                project.executeTransaction((ca) => {
                  ca.addAction(clip.createSetStartAction(ppro.TickTime.createWithSeconds(params.startTime)));
                });
              });
              actionsApplied++;
            }
            if (params.endTime !== undefined) {
              project.lockedAccess(() => {
                project.executeTransaction((ca) => {
                  ca.addAction(clip.createSetEndAction(ppro.TickTime.createWithSeconds(params.endTime)));
                });
              });
              actionsApplied++;
            }
            if (params.inPoint !== undefined) {
              project.lockedAccess(() => {
                project.executeTransaction((ca) => {
                  ca.addAction(clip.createSetInPointAction(ppro.TickTime.createWithSeconds(params.inPoint)));
                });
              });
              actionsApplied++;
            }
            if (params.outPoint !== undefined) {
              project.lockedAccess(() => {
                project.executeTransaction((ca) => {
                  ca.addAction(clip.createSetOutPointAction(ppro.TickTime.createWithSeconds(params.outPoint)));
                });
              });
              actionsApplied++;
            }

            if (actionsApplied > 0) {
              return { success: true, trimmed: true, actionsApplied };
            }
            return { success: false, error: "No trim parameters provided (use startTime, endTime, inPoint, outPoint)" };
          } catch(err) {
            return { success: false, error: err.message, stack: err.stack };
          }
        }

        // ── Split clip at time ──
        async function splitClip(params) {
          const project = await ppro.Project.getActiveProject();
          const seq = await project.getActiveSequence();
          if (!seq) return { success: false, error: "No active sequence" };

          const splitTime = params.time || 0;
          const t = ppro.TickTime.createWithSeconds(splitTime);

          // Try razor at time
          try {
            if (typeof seq.razorAtTime === "function") {
              await seq.razorAtTime(t);
              return { success: true, method: "razorAtTime", time: splitTime };
            }
          } catch(e) {}

          // Try per-track split
          const trackType = params.trackType || "video";
          const trackIndex = params.trackIndex || 0;
          let track;
          if (trackType === "video") track = await seq.getVideoTrack(trackIndex);
          else track = await seq.getAudioTrack(trackIndex);

          if (track && typeof track.razorAtTime === "function") {
            try {
              await track.razorAtTime(t);
              return { success: true, method: "track.razorAtTime", time: splitTime };
            } catch(e) {}
          }

          const seqMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(seq) || {}).join(", ");
          return { success: false, error: "No razor/split method found", seqMethods };
        }

        // ── Move clip ──
        async function moveClip(params) {
          const project = await ppro.Project.getActiveProject();
          const seq = await project.getActiveSequence();
          if (!seq) return { success: false, error: "No active sequence" };

          const trackType = params.trackType || "video";
          const trackIndex = params.trackIndex || 0;
          const clipIndex = params.clipIndex || 0;
          const newStart = params.newStartTime;

          let track;
          if (trackType === "video") track = await seq.getVideoTrack(trackIndex);
          else track = await seq.getAudioTrack(trackIndex);
          if (!track) return { success: false, error: "Track not found" };

          let items = null;
          try { items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false); } catch(e) {}
          if (!items || clipIndex >= items.length) return { success: false, error: "Clip not found" };

          const clip = items[clipIndex];
          try {
            // CORRECT PATTERN: lockedAccess + executeTransaction + compoundAction
            project.lockedAccess(() => {
              project.executeTransaction((ca) => {
                const t = ppro.TickTime.createWithSeconds(newStart);
                ca.addAction(clip.createSetStartAction(t));
              });
            });
            return { success: true, moved: true, newStartTime: newStart };
          } catch(err) {
            return { success: false, error: err.message, stack: err.stack };
          }
        }

        // ── Set clip properties (scale, position, opacity) ──
        async function setClipProperties(params) {
          const project = await ppro.Project.getActiveProject();
          const seq = await project.getActiveSequence();
          if (!seq) return { success: false, error: "No active sequence" };

          const trackType = params.trackType || "video";
          const trackIndex = params.trackIndex || 0;
          const clipIndex = params.clipIndex || 0;

          let track;
          if (trackType === "video") track = await seq.getVideoTrack(trackIndex);
          else track = await seq.getAudioTrack(trackIndex);
          if (!track) return { success: false, error: "Track not found" };

          let items = null;
          try { items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false); } catch(e) {}
          if (!items || clipIndex >= items.length) return { success: false, error: "Clip not found" };

          const clip = items[clipIndex];

          // Get component chain for effects/properties
          // Component indices: 0 = Opacity, 1 = Motion
          try {
            const chain = await clip.getComponentChain();
            if (!chain) return { success: false, error: "No component chain" };

            const results = [];

            // Scale (Motion component index 1, Scale param index 1)
            if (params.scale !== undefined) {
              try {
                const motionComp = await chain.getComponentAtIndex(1);
                const scaleParam = await motionComp.getParam(1);
                const kf = scaleParam.createKeyframe(params.scale);
                project.lockedAccess(() => {
                  project.executeTransaction((ca) => {
                    ca.addAction(scaleParam.createSetValueAction(kf));
                  });
                });
                results.push("scale=" + params.scale);
              } catch(e) { results.push("scale error: " + e.message); }
            }

            // Opacity (Opacity component index 0, search by displayName)
            if (params.opacity !== undefined) {
              try {
                const opacityComp = await chain.getComponentAtIndex(0);
                const pCount = await opacityComp.getParamCount();
                for (let p = 0; p < pCount; p++) {
                  const param = await opacityComp.getParam(p);
                  const dn = param.displayName;
                  if (dn && (dn.includes("Opacity") || dn.includes("불투명도"))) {
                    const kf = param.createKeyframe(params.opacity);
                    project.lockedAccess(() => {
                      project.executeTransaction((ca) => {
                        ca.addAction(param.createSetValueAction(kf));
                      });
                    });
                    results.push("opacity=" + params.opacity);
                    break;
                  }
                }
              } catch(e) { results.push("opacity error: " + e.message); }
            }

            // Position — NOTE: PointKeyframe is READ-ONLY in UXP API
            if (params.position) {
              results.push("position: NOT SUPPORTED (PointKeyframe read-only in UXP)");
            }

            // Rotation (Motion component index 1, Rotation param index 3)
            if (params.rotation !== undefined) {
              try {
                const motionComp = await chain.getComponentAtIndex(1);
                const rotParam = await motionComp.getParam(3);
                const kf = rotParam.createKeyframe(params.rotation);
                project.lockedAccess(() => {
                  project.executeTransaction((ca) => {
                    ca.addAction(rotParam.createSetValueAction(kf));
                  });
                });
                results.push("rotation=" + params.rotation);
              } catch(e) { results.push("rotation error: " + e.message); }
            }

            // Explore mode: dump component structure
            if (params.explore) {
              const compList = [];
              const compCount = await chain.getComponentCount();
              for (let c = 0; c < compCount; c++) {
                const comp = await chain.getComponentAtIndex(c);
                const cInfo = { index: c, displayName: comp.displayName };
                try {
                  const pCount = await comp.getParamCount();
                  cInfo.params = [];
                  for (let p = 0; p < pCount; p++) {
                    const param = await comp.getParam(p);
                    const pInfo = { index: p, displayName: param.displayName };
                    try {
                      const v = await param.getValueAtTime(ppro.TickTime.TIME_ZERO);
                      pInfo.value = v ? v.value : undefined;
                    } catch(e) {}
                    cInfo.params.push(pInfo);
                  }
                } catch(e) {}
                compList.push(cInfo);
              }
              return { success: true, components: compList, applied: results };
            }

            return { success: true, applied: results };
          } catch(err) {
            return { success: false, error: err.message };
          }
        }

        // ── Add track ──
        async function addTrack(params) {
          const project = await ppro.Project.getActiveProject();
          const seq = await project.getActiveSequence();
          if (!seq) return { success: false, error: "No active sequence" };

          const trackType = params.trackType || "video";
          try {
            if (trackType === "video" && typeof seq.addVideoTrack === "function") {
              await seq.addVideoTrack();
              return { success: true, added: "video track" };
            }
            if (trackType === "audio" && typeof seq.addAudioTrack === "function") {
              await seq.addAudioTrack();
              return { success: true, added: "audio track" };
            }
            return { success: false, error: "addTrack method not found" };
          } catch(err) {
            return { success: false, error: err.message };
          }
        }

        // ── Get/Set playhead ──
        async function getPlayhead() {
          const project = await ppro.Project.getActiveProject();
          const seq = await project.getActiveSequence();
          if (!seq) return { success: false, error: "No active sequence" };
          try {
            const pos = await seq.getPlayerPosition();
            return { success: true, position: pos ? (pos.ticks !== undefined ? pos.ticks : pos) : null };
          } catch(e) {
            return { success: false, error: e.message };
          }
        }

        async function setPlayhead(params) {
          const project = await ppro.Project.getActiveProject();
          const seq = await project.getActiveSequence();
          if (!seq) return { success: false, error: "No active sequence" };
          try {
            const t = ppro.TickTime.createWithSeconds(params.time || 0);
            await seq.setPlayerPosition(t);
            return { success: true, position: params.time };
          } catch(e) {
            return { success: false, error: e.message };
          }
        }

        // ── Save project ──
        async function saveProject() {
          const project = await ppro.Project.getActiveProject();
          try {
            await project.save();
            return { success: true, saved: true };
          } catch(e) {
            return { success: false, error: e.message };
          }
        }

        // ── Remove clip from timeline ──
        async function removeClip(params) {
          const project = await ppro.Project.getActiveProject();
          const seq = await project.getActiveSequence();
          if (!seq) return { success: false, error: "No active sequence" };

          const trackType = params.trackType || "video";
          const trackIndex = params.trackIndex || 0;
          const clipIndex = params.clipIndex || 0;

          let track;
          if (trackType === "video") track = await seq.getVideoTrack(trackIndex);
          else track = await seq.getAudioTrack(trackIndex);
          if (!track) return { success: false, error: "Track not found" };

          let items = null;
          try { items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false); } catch(e) {}
          if (!items || clipIndex >= items.length) return { success: false, error: "Clip not found" };

          const clip = items[clipIndex];
          try {
            const editor = ppro.SequenceEditor.getEditor(seq);
            // CORRECT PATTERN: lockedAccess + executeTransaction + compoundAction
            project.lockedAccess(() => {
              project.executeTransaction((ca) => {
                const removeAction = editor.createRemoveItemsAction([clip], false, false);
                ca.addAction(removeAction);
              });
            });
            return { success: true, removed: true };
          } catch(err) {
            return { success: false, error: err.message, stack: err.stack };
          }
        }

        // ── Create new sequence ──
        async function createNewSequence(params) {
          const project = await ppro.Project.getActiveProject();
          const name = params.name || "New Sequence";

          // If itemNames provided, create sequence from media
          if (params.itemNames && params.itemNames.length > 0) {
            try {
              const rootItem = await project.getRootItem();
              const kids = await rootItem.getItems();
              const clipItems = [];

              for (const itemName of params.itemNames) {
                for (let i = 0; i < kids.length; i++) {
                  if (kids[i].name === itemName) {
                    const ci = ppro.ClipProjectItem.queryCast(kids[i]);
                    if (ci) clipItems.push(ci);
                    break;
                  }
                }
              }

              if (clipItems.length === 0) return { success: false, error: "No matching items found" };
              const seq = await project.createSequenceFromMedia(name, clipItems, rootItem);
              return { success: true, name: seq.name, guid: seq.guid, itemCount: clipItems.length };
            } catch(e) {
              return { success: false, error: e.message };
            }
          }

          // Default: create empty sequence
          try {
            const seq = await project.createSequence(name);
            return { success: true, name: seq.name, guid: seq.guid };
          } catch(e) {
            return { success: false, error: e.message };
          }
        }

        // ── Set active sequence ──
        async function setActiveSeq(params) {
          const project = await ppro.Project.getActiveProject();
          const seqs = await project.getSequences();
          let target = null;
          for (const s of seqs) {
            if (s.guid === params.sequenceId || s.name === params.name) { target = s; break; }
          }
          if (!target) return { success: false, error: "Sequence not found" };
          try {
            await project.setActiveSequence(target);
            return { success: true, name: target.name };
          } catch(e) {
            return { success: false, error: e.message };
          }
        }

        // ── Batch set scale/opacity on multiple clips ──
        // params: { trackIndex, scale?, opacity?, startClip?, endClip? }
        async function batchSetProperties(params) {
          const project = await ppro.Project.getActiveProject();
          const seq = await project.getActiveSequence();
          if (!seq) return { success: false, error: "No active sequence" };
          const trackIndex = params.trackIndex !== undefined ? params.trackIndex : 0;
          const track = await seq.getVideoTrack(trackIndex);
          const items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
          const start = params.startClip || 0;
          const end = params.endClip !== undefined ? Math.min(params.endClip, items.length) : items.length;
          let applied = 0;
          const errors = [];
          for (let i = start; i < end; i++) {
            try {
              const chain = await items[i].getComponentChain();
              if (params.scale !== undefined) {
                const motionComp = await chain.getComponentAtIndex(1);
                const scaleParam = await motionComp.getParam(1);
                const kf = scaleParam.createKeyframe(params.scale);
                project.lockedAccess(() => {
                  project.executeTransaction((ca) => { ca.addAction(scaleParam.createSetValueAction(kf)); });
                });
              }
              if (params.opacity !== undefined) {
                const opComp = await chain.getComponentAtIndex(0);
                const pCount = await opComp.getParamCount();
                for (let p = 0; p < pCount; p++) {
                  const param = await opComp.getParam(p);
                  if (param.displayName && (param.displayName.includes("Opacity") || param.displayName.includes("불투명도"))) {
                    const kf = param.createKeyframe(params.opacity);
                    project.lockedAccess(() => {
                      project.executeTransaction((ca) => { ca.addAction(param.createSetValueAction(kf)); });
                    });
                    break;
                  }
                }
              }
              applied++;
            } catch(e) { errors.push("clip " + i + ": " + e.message); }
          }
          return { success: true, applied, range: [start, end], errors };
        }

        // ── Batch add transitions to all clips on a track ──
        // params: { trackIndex?, matchName?, duration?, skipFirst? }
        async function batchAddTransitions(params) {
          const project = await ppro.Project.getActiveProject();
          const seq = await project.getActiveSequence();
          if (!seq) return { success: false, error: "No active sequence" };
          const trackIndex = params.trackIndex !== undefined ? params.trackIndex : 0;
          const matchName = params.matchName || "AE.ADBE Cross Dissolve New";
          const duration = params.duration || 0.3;
          const skipFirst = params.skipFirst !== undefined ? params.skipFirst : true;
          const track = await seq.getVideoTrack(trackIndex);
          const items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
          let applied = 0;
          const errors = [];
          const startIdx = skipFirst ? 1 : 0;
          for (let i = startIdx; i < items.length; i++) {
            try {
              const transition = await ppro.TransitionFactory.createVideoTransition(matchName);
              const options = new ppro.AddTransitionOptions();
              options.setDuration(ppro.TickTime.createWithSeconds(duration));
              options.setApplyToStart(true);
              project.lockedAccess(() => {
                project.executeTransaction((ca) => {
                  ca.addAction(items[i].createAddVideoTransitionAction(transition, options));
                });
              });
              applied++;
            } catch(e) { errors.push("clip " + i + ": " + e.message); if (errors.length >= 5) break; }
          }
          return { success: true, applied, total: items.length, errors };
        }

        // ── List available video transitions ──
        async function listTransitions() {
          try {
            const matchNames = await ppro.TransitionFactory.getVideoTransitionMatchNames();
            return { success: true, transitions: matchNames ? Array.from(matchNames).slice(0, 50) : [] };
          } catch(e) {
            return { success: false, error: e.message };
          }
        }

        // ── Get detailed clip info (scale, opacity, position) ──
        // params: { trackIndex, clipIndex }
        async function getClipInfo(params) {
          const project = await ppro.Project.getActiveProject();
          const seq = await project.getActiveSequence();
          if (!seq) return { success: false, error: "No active sequence" };
          const trackIndex = params.trackIndex !== undefined ? params.trackIndex : 0;
          const clipIndex = params.clipIndex !== undefined ? params.clipIndex : 0;
          try {
            const track = await seq.getVideoTrack(trackIndex);
            const items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
            if (clipIndex >= items.length) return { success: false, error: "Clip index out of range" };
            const clip = items[clipIndex];
            const info = {};
            try { info.name = clip.name; } catch(e) {}
            try { const st = await clip.getStartTime(); info.startSeconds = Number(st.ticks) / 254016000000; } catch(e) {}
            try { const et = await clip.getEndTime(); info.endSeconds = Number(et.ticks) / 254016000000; } catch(e) {}
            try { const pi = await clip.getProjectItem(); if (pi) info.projectItem = pi.name; } catch(e) {}
            // Get component values
            const chain = await clip.getComponentChain();
            const compCount = await chain.getComponentCount();
            info.components = [];
            for (let c = 0; c < compCount; c++) {
              const comp = await chain.getComponentAtIndex(c);
              const ci = { index: c, displayName: comp.displayName, params: [] };
              const pCount = await comp.getParamCount();
              for (let p = 0; p < pCount; p++) {
                const param = await comp.getParam(p);
                const pi = { index: p, displayName: param.displayName };
                try {
                  const v = await param.getValueAtTime(ppro.TickTime.TIME_ZERO);
                  pi.value = v ? v.value : undefined;
                } catch(e) {}
                ci.params.push(pi);
              }
              info.components.push(ci);
            }
            return { success: true, clip: info };
          } catch(e) {
            return { success: false, error: e.message };
          }
        }

        // ── Cleanup: delete duplicate/test sequences ──
        // params: { keepNames: string[] } — sequences NOT to delete
        async function cleanupSequences(params) {
          const project = await ppro.Project.getActiveProject();
          const seqs = await project.getSequences();
          const keepNames = params.keepNames || [];
          const activeSeq = await project.getActiveSequence();
          const deleted = [];
          const kept = [];
          const errors = [];
          for (let i = 0; i < seqs.length; i++) {
            const name = seqs[i].name;
            if (keepNames.includes(name) || (activeSeq && seqs[i].guid === activeSeq.guid)) {
              kept.push(name);
              continue;
            }
            try {
              project.lockedAccess(() => { project.deleteSequence(seqs[i]); });
              deleted.push(name);
            } catch(e) { errors.push(name + ": " + e.message); }
          }
          return { success: true, deleted, kept, errors };
        }

        // ═══════════════════════════════════════════
        // ── TEMPLATE LEARNING (AUTO CUT) ──
        // ═══════════════════════════════════════════

        // ── Analyze a "look" section to extract editing pattern ──
        // params: { lookIndex (1-based), cutsPerLook (default 5), lookDuration (seconds, auto-detected if omitted) }
        async function analyzeLook(params) {
          const project = await ppro.Project.getActiveProject();
          const seq = await project.getActiveSequence();
          if (!seq) return { success: false, error: "No active sequence" };

          const lookIdx = params.lookIndex || 1;
          const TICKS_PER_SEC = 254016000000;
          const template = { lookIndex: lookIdx, tracks: {} };

          try {
            const vtCount = await seq.getVideoTrackCount();
            const atCount = await seq.getAudioTrackCount();

            // Analyze each video track
            for (let t = 0; t < vtCount; t++) {
              const track = await seq.getVideoTrack(t);
              const items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
              if (!items || items.length === 0) continue;

              const trackData = { trackIndex: t, clips: [] };

              for (let i = 0; i < items.length; i++) {
                const clip = items[i];
                const st = await clip.getStartTime();
                const et = await clip.getEndTime();
                const startSec = Number(st.ticks) / TICKS_PER_SEC;
                const endSec = Number(et.ticks) / TICKS_PER_SEC;

                const clipInfo = {
                  index: i,
                  startSeconds: startSec,
                  endSeconds: endSec,
                  durationSeconds: endSec - startSec
                };

                // Get project item name
                try {
                  const pi = await clip.getProjectItem();
                  if (pi) clipInfo.itemName = pi.name;
                } catch(e) {}

                // Get scale & opacity
                try {
                  const chain = await clip.getComponentChain();
                  // Scale (Motion comp=1, param=1)
                  const motionComp = await chain.getComponentAtIndex(1);
                  const scaleParam = await motionComp.getParam(1);
                  const sv = await scaleParam.getValueAtTime(ppro.TickTime.TIME_ZERO);
                  clipInfo.scale = sv ? sv.value : undefined;
                  // Opacity (comp=0, search by name)
                  const opComp = await chain.getComponentAtIndex(0);
                  const pCount = await opComp.getParamCount();
                  for (let p = 0; p < pCount; p++) {
                    const param = await opComp.getParam(p);
                    if (param.displayName && (param.displayName.includes("Opacity") || param.displayName.includes("불투명도"))) {
                      const ov = await param.getValueAtTime(ppro.TickTime.TIME_ZERO);
                      clipInfo.opacity = ov ? ov.value : undefined;
                      break;
                    }
                  }
                } catch(e) {}

                // Check for transitions
                try {
                  const transitions = await track.getTrackItems(ppro.Constants.TrackItemType.TRANSITION, false);
                  if (transitions) {
                    for (const tr of transitions) {
                      const trSt = await tr.getStartTime();
                      const trEt = await tr.getEndTime();
                      const trStart = Number(trSt.ticks) / TICKS_PER_SEC;
                      const trEnd = Number(trEt.ticks) / TICKS_PER_SEC;
                      // If transition overlaps this clip's start
                      if (Math.abs(trStart - startSec) < 0.5 || Math.abs(trEnd - startSec) < 0.5) {
                        clipInfo.hasTransition = true;
                        clipInfo.transitionDuration = trEnd - trStart;
                        break;
                      }
                    }
                  }
                } catch(e) {}

                trackData.clips.push(clipInfo);
              }

              template.tracks["V" + (t + 1)] = trackData;
            }

            // Analyze audio tracks
            for (let t = 0; t < atCount; t++) {
              const track = await seq.getAudioTrack(t);
              const items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
              if (!items || items.length === 0) continue;

              const trackData = { trackIndex: t, clips: [] };
              for (let i = 0; i < items.length; i++) {
                const clip = items[i];
                const st = await clip.getStartTime();
                const et = await clip.getEndTime();
                const clipInfo = {
                  index: i,
                  startSeconds: Number(st.ticks) / TICKS_PER_SEC,
                  endSeconds: Number(et.ticks) / TICKS_PER_SEC
                };
                try {
                  const pi = await clip.getProjectItem();
                  if (pi) clipInfo.itemName = pi.name;
                } catch(e) {}
                trackData.clips.push(clipInfo);
              }
              template.tracks["A" + (t + 1)] = trackData;
            }

            // Auto-detect look boundaries
            const v1 = template.tracks["V1"];
            if (v1 && v1.clips.length > 0) {
              const firstClip = v1.clips[0];
              const lastClip = v1.clips[v1.clips.length - 1];
              template.totalDuration = lastClip.endSeconds - firstClip.startSeconds;
              template.clipCount = v1.clips.length;
              // Calculate relative timings (normalized to look duration)
              template.relativePattern = v1.clips.map(c => ({
                relStart: (c.startSeconds - firstClip.startSeconds) / template.totalDuration,
                relEnd: (c.endSeconds - firstClip.startSeconds) / template.totalDuration,
                relDuration: c.durationSeconds / template.totalDuration,
                itemName: c.itemName,
                scale: c.scale,
                hasTransition: c.hasTransition
              }));
            }

            // Save template to bridge folder for Claude Code to read
            template.sequenceName = seq.name;
            template.analyzedAt = new Date().toISOString();

            // Write template file
            if (folderToken) {
              try {
                const tf = await folderToken.createFile("template-look" + lookIdx + ".json", { overwrite: true });
                await tf.write(JSON.stringify(template, null, 2));
                template.savedTo = "template-look" + lookIdx + ".json";
              } catch(e) { template.saveError = e.message; }
            }

            return { success: true, template };
          } catch(e) {
            return { success: false, error: e.message, stack: e.stack };
          }
        }

        // ── Apply template pattern to create new looks ──
        // params: { templateLookIndex, targetLookIndex, videoItems[], photoTop?, photoBottom?, titleText? }
        async function applyTemplate(params) {
          const project = await ppro.Project.getActiveProject();
          const seq = await project.getActiveSequence();
          if (!seq) return { success: false, error: "No active sequence" };

          const TICKS_PER_SEC = 254016000000;
          const templateIdx = params.templateLookIndex || 1;
          const targetIdx = params.targetLookIndex || 2;

          // Read template from bridge folder
          let template = null;
          if (folderToken) {
            try {
              const entries = await folderToken.getEntries();
              for (const e of entries) {
                if (e.name === "template-look" + templateIdx + ".json") {
                  const content = await e.read();
                  template = JSON.parse(content);
                  break;
                }
              }
            } catch(e) {}
          }
          if (!template) return { success: false, error: "Template not found. Run analyze_look first." };

          const results = { placed: [], errors: [] };
          const editor = ppro.SequenceEditor.getEditor(seq);

          // Calculate target look start time
          const lookDuration = template.totalDuration || 6;
          const targetStart = (targetIdx - 1) * lookDuration;

          // Find project items by name
          const rootItem = await project.getRootItem();
          const kids = await rootItem.getItems();
          function findItem(name) {
            for (let i = 0; i < kids.length; i++) {
              if (kids[i].name === name) return kids[i];
            }
            return null;
          }

          try {
            // 1. Place V1 clips (main video cuts)
            if (params.videoItems && params.videoItems.length > 0 && template.relativePattern) {
              for (let i = 0; i < template.relativePattern.length && i < params.videoItems.length; i++) {
                const pattern = template.relativePattern[i];
                const itemName = params.videoItems[i];
                const item = findItem(itemName);
                if (!item) { results.errors.push("V1: " + itemName + " not found"); continue; }

                const clipStart = targetStart + pattern.relStart * lookDuration;
                try {
                  project.lockedAccess(() => {
                    project.executeTransaction((ca) => {
                      ca.addAction(editor.createOverwriteItemAction(
                        item, ppro.TickTime.createWithSeconds(clipStart), 0, 0
                      ));
                    });
                  });
                  results.placed.push("V1:" + itemName + "@" + clipStart.toFixed(1) + "s");
                } catch(e) { results.errors.push("V1:" + itemName + ": " + e.message); }
              }
            }

            // 2. Place title on V2
            if (params.titleItem) {
              const titleTemplate = template.tracks["V2"];
              if (titleTemplate && titleTemplate.clips.length > 0) {
                const tClip = titleTemplate.clips[0];
                const titleDuration = tClip.endSeconds - tClip.startSeconds;
                const titleItem = findItem(params.titleItem);
                if (titleItem) {
                  try {
                    project.lockedAccess(() => {
                      project.executeTransaction((ca) => {
                        ca.addAction(editor.createOverwriteItemAction(
                          titleItem, ppro.TickTime.createWithSeconds(targetStart), 1, -1
                        ));
                      });
                    });
                    // Trim to match template duration
                    const track = await seq.getVideoTrack(1);
                    const items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
                    for (const it of items) {
                      const st = await it.getStartTime();
                      if (Math.abs(Number(st.ticks) / TICKS_PER_SEC - targetStart) < 0.1) {
                        project.lockedAccess(() => {
                          project.executeTransaction((ca) => {
                            ca.addAction(it.createSetEndAction(ppro.TickTime.createWithSeconds(targetStart + titleDuration)));
                          });
                        });
                        break;
                      }
                    }
                    results.placed.push("V2:title@" + targetStart + "s");
                  } catch(e) { results.errors.push("V2: " + e.message); }
                }
              }
            }

            // 3. Place photos on V4 (top) and V5 (bottom)
            for (const [trackKey, trackIdx, paramKey] of [["V4", 3, "photoTop"], ["V5", 4, "photoBottom"]]) {
              const photoName = params[paramKey];
              if (!photoName) continue;
              const photoTemplate = template.tracks[trackKey];
              if (!photoTemplate || photoTemplate.clips.length === 0) continue;
              const pClip = photoTemplate.clips[0];
              const photoItem = findItem(photoName);
              if (!photoItem) { results.errors.push(trackKey + ": " + photoName + " not found"); continue; }

              try {
                const photoStart = targetStart + (pClip.startSeconds - (templateIdx - 1) * lookDuration);
                project.lockedAccess(() => {
                  project.executeTransaction((ca) => {
                    ca.addAction(editor.createOverwriteItemAction(
                      photoItem, ppro.TickTime.createWithSeconds(Math.max(0, photoStart)), trackIdx, -1
                    ));
                  });
                });

                // Apply same scale/opacity as template
                if (pClip.scale !== undefined || pClip.opacity !== undefined) {
                  const track = await seq.getVideoTrack(trackIdx);
                  const items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
                  // Find the clip we just placed
                  for (const it of items) {
                    const st = await it.getStartTime();
                    if (Math.abs(Number(st.ticks) / TICKS_PER_SEC - Math.max(0, photoStart)) < 0.5) {
                      const chain = await it.getComponentChain();
                      if (pClip.scale !== undefined) {
                        const mc = await chain.getComponentAtIndex(1);
                        const sp = await mc.getParam(1);
                        const kf = sp.createKeyframe(pClip.scale);
                        project.lockedAccess(() => {
                          project.executeTransaction((ca) => { ca.addAction(sp.createSetValueAction(kf)); });
                        });
                      }
                      if (pClip.opacity !== undefined) {
                        const oc = await chain.getComponentAtIndex(0);
                        const pc = await oc.getParamCount();
                        for (let p = 0; p < pc; p++) {
                          const param = await oc.getParam(p);
                          if (param.displayName && (param.displayName.includes("Opacity") || param.displayName.includes("불투명도"))) {
                            const kf = param.createKeyframe(pClip.opacity);
                            project.lockedAccess(() => {
                              project.executeTransaction((ca) => { ca.addAction(param.createSetValueAction(kf)); });
                            });
                            break;
                          }
                        }
                      }
                      break;
                    }
                  }
                }
                results.placed.push(trackKey + ":" + photoName);
              } catch(e) { results.errors.push(trackKey + ": " + e.message); }
            }

            // 4. Apply transitions if template had them
            if (template.relativePattern && template.relativePattern.some(p => p.hasTransition)) {
              try {
                const track = await seq.getVideoTrack(0);
                const v1Items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
                for (const it of v1Items) {
                  const st = await it.getStartTime();
                  const startSec = Number(st.ticks) / TICKS_PER_SEC;
                  if (startSec > targetStart && startSec < targetStart + lookDuration) {
                    try {
                      const transition = await ppro.TransitionFactory.createVideoTransition("AE.ADBE Cross Dissolve New");
                      const options = new ppro.AddTransitionOptions();
                      options.setDuration(ppro.TickTime.createWithSeconds(0.3));
                      options.setApplyToStart(true);
                      project.lockedAccess(() => {
                        project.executeTransaction((ca) => {
                          ca.addAction(it.createAddVideoTransitionAction(transition, options));
                        });
                      });
                      results.placed.push("transition@" + startSec.toFixed(1) + "s");
                    } catch(e) {}
                  }
                }
              } catch(e) { results.errors.push("transitions: " + e.message); }
            }

            return { success: true, targetLook: targetIdx, results };
          } catch(e) {
            return { success: false, error: e.message, stack: e.stack };
          }
        }

        // ── Set clip scale (ComponentParam) ──
        // params: { trackIndex, clipIndex, scale, trackType? }
        async function setClipScale(params) {
          const project = await ppro.Project.getActiveProject();
          const seq = await project.getActiveSequence();
          if (!seq) return { success: false, error: "No active sequence" };
          const trackIndex = params.trackIndex !== undefined ? params.trackIndex : 0;
          const clipIndex = params.clipIndex !== undefined ? params.clipIndex : 0;
          const scaleValue = params.scale !== undefined ? params.scale : 100;
          try {
            const track = await seq.getVideoTrack(trackIndex);
            const items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
            if (clipIndex >= items.length) return { success: false, error: "Clip index out of range" };
            const clip = items[clipIndex];
            const chain = await clip.getComponentChain();
            const motionComp = await chain.getComponentAtIndex(1);
            const scaleParam = await motionComp.getParam(1);
            const kf = scaleParam.createKeyframe(scaleValue);
            project.lockedAccess(() => {
              project.executeTransaction((ca) => {
                ca.addAction(scaleParam.createSetValueAction(kf));
              });
            });
            const verify = await scaleParam.getValueAtTime(ppro.TickTime.TIME_ZERO);
            return { success: true, scale: verify.value, trackIndex, clipIndex };
          } catch(e) {
            return { success: false, error: e.message, stack: e.stack };
          }
        }

        // ── Set clip opacity (ComponentParam) ──
        // params: { trackIndex, clipIndex, opacity }
        async function setClipOpacity(params) {
          const project = await ppro.Project.getActiveProject();
          const seq = await project.getActiveSequence();
          if (!seq) return { success: false, error: "No active sequence" };
          const trackIndex = params.trackIndex !== undefined ? params.trackIndex : 0;
          const clipIndex = params.clipIndex !== undefined ? params.clipIndex : 0;
          const opacityValue = params.opacity !== undefined ? params.opacity : 100;
          try {
            const track = await seq.getVideoTrack(trackIndex);
            const items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
            if (clipIndex >= items.length) return { success: false, error: "Clip index out of range" };
            const clip = items[clipIndex];
            const chain = await clip.getComponentChain();
            const opacityComp = await chain.getComponentAtIndex(0);
            const pCount = await opacityComp.getParamCount();
            for (let p = 0; p < pCount; p++) {
              const param = await opacityComp.getParam(p);
              const dn = param.displayName;
              if (dn && (dn.includes("Opacity") || dn.includes("불투명도"))) {
                const kf = param.createKeyframe(opacityValue);
                project.lockedAccess(() => {
                  project.executeTransaction((ca) => {
                    ca.addAction(param.createSetValueAction(kf));
                  });
                });
                const verify = await param.getValueAtTime(ppro.TickTime.TIME_ZERO);
                return { success: true, opacity: verify.value, trackIndex, clipIndex };
              }
            }
            return { success: false, error: "Opacity param not found" };
          } catch(e) {
            return { success: false, error: e.message, stack: e.stack };
          }
        }

        // ── Add video transition ──
        // params: { trackIndex, clipIndex, matchName?, duration?, applyToStart? }
        async function addTransition(params) {
          const project = await ppro.Project.getActiveProject();
          const seq = await project.getActiveSequence();
          if (!seq) return { success: false, error: "No active sequence" };
          const trackIndex = params.trackIndex !== undefined ? params.trackIndex : 0;
          const clipIndex = params.clipIndex !== undefined ? params.clipIndex : 0;
          const matchName = params.matchName || "AE.ADBE Cross Dissolve New";
          const duration = params.duration !== undefined ? params.duration : 0.5;
          const applyToStart = params.applyToStart !== undefined ? params.applyToStart : false;
          try {
            const track = await seq.getVideoTrack(trackIndex);
            const items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
            if (clipIndex >= items.length) return { success: false, error: "Clip index out of range" };
            const clip = items[clipIndex];
            const transition = await ppro.TransitionFactory.createVideoTransition(matchName);
            const options = new ppro.AddTransitionOptions();
            options.setDuration(ppro.TickTime.createWithSeconds(duration));
            options.setApplyToStart(applyToStart);
            project.lockedAccess(() => {
              project.executeTransaction((ca) => {
                ca.addAction(clip.createAddVideoTransitionAction(transition, options));
              });
            });
            return { success: true, matchName, duration, applyToStart, trackIndex, clipIndex };
          } catch(e) {
            return { success: false, error: e.message, stack: e.stack };
          }
        }

        // ── Mute/unmute audio track ──
        // params: { trackIndex, mute }
        async function muteTrack(params) {
          const project = await ppro.Project.getActiveProject();
          const seq = await project.getActiveSequence();
          if (!seq) return { success: false, error: "No active sequence" };
          const trackIndex = params.trackIndex !== undefined ? params.trackIndex : 0;
          const mute = params.mute !== undefined ? params.mute : true;
          try {
            const track = await seq.getAudioTrack(trackIndex);
            await track.setMute(mute);
            const isMuted = await track.isMuted();
            return { success: true, trackIndex, muted: isMuted };
          } catch(e) {
            return { success: false, error: e.message, stack: e.stack };
          }
        }

        // ── Delete sequence ──
        // params: { name }
        async function deleteSeq(params) {
          const project = await ppro.Project.getActiveProject();
          const seqs = await project.getSequences();
          for (let i = 0; i < seqs.length; i++) {
            if (seqs[i].name === params.name) {
              try {
                project.lockedAccess(() => {
                  project.deleteSequence(seqs[i]);
                });
                return { success: true, deleted: params.name };
              } catch(e) {
                return { success: false, error: e.message };
              }
            }
          }
          return { success: false, error: "Sequence not found: " + params.name };
        }

        // ── Eval arbitrary code (no more reloads needed!) ──
        async function evalCode(params) {
          const code = params.code;
          if (!code) return { success: false, error: "code required" };
          try {
            const fn = new Function("ppro", "project", "seq", code);
            const project = await ppro.Project.getActiveProject();
            const seq = await project.getActiveSequence();
            const result = await fn(ppro, project, seq);
            return { success: true, result: result };
          } catch(e) {
            return { success: false, error: e.message, stack: e.stack };
          }
        }

        async function listProjectItems() {
          const project = await ppro.Project.getActiveProject();
          const rootItem = await project.getRootItem();
          const items = [];

          async function walkItems(parent) {
            let kids = null;
            try { kids = await parent.getItems(); } catch(e) {}
            if (kids && kids.length) {
              for (let i = 0; i < kids.length; i++) {
                const item = kids[i];
                const info = {};
                try { info.name = item.name; } catch(e) {}
                try { info.type = item.type; } catch(e) {}
                try { info.id = item.getId ? await item.getId() : undefined; } catch(e) {}
                items.push(info);
                // recurse into bins
                if (info.type === 2 || info.type === "bin") {
                  try { await walkItems(item); } catch(e) {}
                }
              }
            }
          }

          // Also get root item methods for diagnostics
          const rootKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(rootItem) || {});
          try { await walkItems(rootItem); } catch(e) {}

          return {
            success: true,
            rootMethods: rootKeys.join(", "),
            itemCount: items.length,
            items: items
          };
        }

        // ── File Bridge Polling ──
        let _processing = false;
        async function processCommands() {
          if (!folderToken || _processing) return;
          _processing = true;
          try {
            const entries = await folderToken.getEntries();
            for (const entry of entries) {
              // ── Claude Code → 채팅 응답 ──
              if (entry.isFile && entry.name.startsWith("chat-response-") && entry.name.endsWith(".json")) {
                try {
                  const content = await entry.read();
                  const resp = JSON.parse(content);
                  if (resp.message) {
                    addChat(resp.message, "ai");
                    // TTS/나레이션 완료 시 → 나레이션 프리뷰 업데이트 (탭 이동 안 함)
                    if (resp.message.includes("TTS") || resp.message.includes("🎙️")) {
                      var narrPrev = document.getElementById("narrPreview");
                      if (narrPrev) {
                        narrPrev.innerHTML = resp.message.replace(/\n/g, "<br>");
                      }
                    }
                    // 현재 탭이 나레이션이면 채팅으로 안 넘어감
                    var activeTab = document.querySelector(".tab-btn.active");
                    if (activeTab && activeTab.dataset.tab !== "narr") {
                      // 채팅 탭 알림만 표시 (자동 전환 안 함)
                    }
                  }
                  await entry.delete();
                } catch(e) {}
                continue;
              }
              // ── 일반 브릿지 명령 ──
              if (entry.isFile && entry.name.startsWith("command-") && entry.name.endsWith(".json")) {
                try {
                  const content = await entry.read();
                  const cmd = JSON.parse(content);
                  log("명령: " + (cmd.action || "script") + " [" + cmd.id + "]");

                  let result;
                  if (cmd.action) {
                    result = await handleCommand(cmd);
                  } else {
                    result = { success: false, error: "ExtendScript not supported. Use action-based commands." };
                  }

                  const rn = entry.name.replace("command-", "response-");
                  const rf = await folderToken.createFile(rn, { overwrite: true });
                  result.timestamp = new Date().toISOString();
                  await rf.write(JSON.stringify(result));
                  await entry.delete();
                  log("완료: " + cmd.id);
                } catch (err) {
                  log("오류: " + err.message, "err");
                  try {
                    const rn = entry.name.replace("command-", "response-");
                    const rf = await folderToken.createFile(rn, { overwrite: true });
                    await rf.write(JSON.stringify({ error: err.message }));
                  } catch(e2) {}
                }
              }
            }
          } catch (err) {
            log("폴링 오류: " + err.message, "err");
          } finally {
            _processing = false;
          }
        }

        // ── UI Event Handlers ──
        document.getElementById("btnStart").addEventListener("click", async function() {
          const uxp = require("uxp");
          if (!folderToken) {
            // 저장된 폴더 토큰 복원 시도
            const savedToken = localStorage.getItem("bridgeFolderToken");
            if (savedToken) {
              try {
                folderToken = await uxp.storage.localFileSystem.getEntryForPersistentToken(savedToken);
                log("폴더 자동 연결: " + folderToken.nativePath, "info");
              } catch(e) {
                folderToken = null;
                localStorage.removeItem("bridgeFolderToken");
              }
            }
            // 저장된 토큰 없으면 최초 1회만 선택
            if (!folderToken) {
              log("브릿지 폴더를 선택하세요 (최초 1회만)", "warn");
              try {
                folderToken = await uxp.storage.localFileSystem.getFolder();
                // 다음번엔 자동 연결되도록 저장
                try {
                  const tokenStr = await uxp.storage.localFileSystem.createPersistentToken(folderToken);
                  localStorage.setItem("bridgeFolderToken", tokenStr);
                  log("폴더 저장 완료 (다음부턴 자동)", "ok");
                } catch(e2) { /* 저장 실패해도 이번엔 작동 */ }
              } catch(e) { log("폴더 선택 취소", "err"); return; }
            }
          }
          setStatus(true);
          document.getElementById("btnStart").disabled = true;
          document.getElementById("btnStop").disabled = false;
          polling = setInterval(processCommands, 500);
          log("브릿지 시작됨 ✓");
          // 시퀀스 정보 자동 표시
          try {
            const project = await ppro.Project.getActiveProject();
            const seq = await project.getActiveSequence();
            document.getElementById("seqInfo").textContent = seq ? "시퀀스: " + seq.name : "시퀀스: -";
          } catch(e) {}
        });

        document.getElementById("btnStop").addEventListener("click", function() {
          if (polling) { clearInterval(polling); polling = null; }
          setStatus(false);
          document.getElementById("btnStart").disabled = false;
          document.getElementById("btnStop").disabled = true;
          log("브릿지 중지됨");
        });

        document.getElementById("btnTest").addEventListener("click", async function() {
          try {
            const result = await testConnection();
            log("연결 확인: " + result.project, "info");
            // Update sequence info
            const project = await ppro.Project.getActiveProject();
            const seq = await project.getActiveSequence();
            document.getElementById("seqInfo").textContent = seq ? "시퀀스: " + seq.name : "시퀀스: -";
          } catch (err) {
            log("실패: " + err.message, "err");
          }
        });

        // ── Quick Action: Info ──
        document.getElementById("btnInfo").addEventListener("click", async function() {
          try {
            const project = await ppro.Project.getActiveProject();
            const seq = await project.getActiveSequence();
            if (!seq) { log("활성 시퀀스 없음", "warn"); return; }
            document.getElementById("seqInfo").textContent = "시퀀스: " + seq.name;
            const vtCount = await seq.getVideoTrackCount();
            let info = seq.name + " | ";
            for (let i = 0; i < vtCount; i++) {
              const track = await seq.getVideoTrack(i);
              const items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
              info += "V" + (i+1) + ":" + items.length + " ";
            }
            log(info, "info");
          } catch(e) { log(e.message, "err"); }
        });

        // ── Quick Action: Save ──
        document.getElementById("btnSave").addEventListener("click", async function() {
          try {
            const project = await ppro.Project.getActiveProject();
            await project.save();
            log("프로젝트 저장됨 ✓", "ok");
          } catch(e) { log("저장 실패: " + e.message, "err"); }
        });

        // ── Quick Action: Batch Transitions ──
        document.getElementById("btnTransitions").addEventListener("click", async function() {
          try {
            const result = await batchAddTransitions({ trackIndex: 0, duration: 0.3, skipFirst: true });
            log("트랜지션: " + result.applied + "/" + result.total + "개 적용", result.applied > 0 ? "ok" : "warn");
          } catch(e) { log(e.message, "err"); }
        });

        // ── Quick Action: Cleanup ──
        document.getElementById("btnCleanup").addEventListener("click", async function() {
          try {
            const project = await ppro.Project.getActiveProject();
            const seq = await project.getActiveSequence();
            const keepNames = seq ? [seq.name] : [];
            const result = await cleanupSequences({ keepNames });
            log("시퀀스 " + result.deleted.length + "개 삭제, " + result.kept.length + "개 유지", "ok");
          } catch(e) { log(e.message, "err"); }
        });

        // ── Batch: Scale ──
        document.getElementById("btnBatchScale").addEventListener("click", async function() {
          try {
            const project = await ppro.Project.getActiveProject();
            const seq = await project.getActiveSequence();
            if (!seq) { log("활성 시퀀스 없음", "warn"); return; }
            // Apply 100% scale to all V1 clips
            const result = await batchSetProperties({ trackIndex: 0, scale: 100 });
            log("스케일 100% → " + result.applied + "개 클립 적용", "ok");
          } catch(e) { log(e.message, "err"); }
        });

        // ── Batch: Opacity ──
        document.getElementById("btnBatchOpacity").addEventListener("click", async function() {
          try {
            const project = await ppro.Project.getActiveProject();
            const seq = await project.getActiveSequence();
            if (!seq) { log("활성 시퀀스 없음", "warn"); return; }
            // Apply 90% opacity to V4+V5 (photo tracks)
            await batchSetProperties({ trackIndex: 3, opacity: 90 });
            const r2 = await batchSetProperties({ trackIndex: 4, opacity: 90 });
            log("투명도 90% → V4+V5 완료", "ok");
          } catch(e) { log(e.message, "err"); }
        });

        // ── Batch: Mute All Audio ──
        document.getElementById("btnMuteAll").addEventListener("click", async function() {
          try {
            const project = await ppro.Project.getActiveProject();
            const seq = await project.getActiveSequence();
            if (!seq) { log("활성 시퀀스 없음", "warn"); return; }
            const atCount = await seq.getAudioTrackCount();
            for (let i = 0; i < atCount; i++) {
              const at = await seq.getAudioTrack(i);
              await at.setMute(true);
            }
            log("오디오 " + atCount + "개 트랙 음소거 완료", "ok");
          } catch(e) { log(e.message, "err"); }
        });

        // ── AI: Analyze Look ──
        document.getElementById("btnAnalyze").addEventListener("click", async function() {
          try {
            log("Look 1 패턴 분석 중...", "info");
            const result = await analyzeLook({ lookIndex: 1 });
            if (result.success) {
              const t = result.template;
              const v1 = t.tracks["V1"];
              log("Look 1: V1 클립 " + (v1 ? v1.clips.length : 0) + "개, 총 " + (t.totalDuration || 0).toFixed(1) + "초", "ok");
              if (t.savedTo) log("템플릿 저장됨: " + t.savedTo, "info");
            } else {
              log("분석 실패: " + result.error, "err");
            }
          } catch(e) { log(e.message, "err"); }
        });

        // ── AI: Auto Apply Template ──
        document.getElementById("btnAutoApply").addEventListener("click", async function() {
          log("자동 적용 시작...", "info");
          try {
            // 편집 조건 수집
            const activeOpts = [];
            document.querySelectorAll(".edit-opt.active").forEach(el => activeOpts.push(el.dataset.opt));
            const notes = document.getElementById("chatInput").value || "";
            log("조건: " + (activeOpts.length > 0 ? activeOpts.join(", ") : "없음"), "info");

            const result = await applyTemplate({
              lookRange: [2, 10],
              options: activeOpts,
              notes: notes
            });
            if (result.success) {
              log("자동 적용 완료: " + (result.applied || 0) + "개 룩 처리됨", "ok");
            } else {
              log("적용 실패: " + result.error, "err");
            }
          } catch(e) { log("자동 적용 오류: " + e.message, "err"); }
        });

        // ── 나레이션 탭 로직 ──
        var selectedVoice = { voice: "ko-KR-InJoonNeural", rate: 1.0, name: "기본 남자" };

        // 캐릭터 카드 선택
        document.querySelectorAll(".voice-card").forEach(function(card) {
          card.addEventListener("click", function() {
            document.querySelectorAll(".voice-card").forEach(function(c) { c.classList.remove("selected"); });
            card.classList.add("selected");
            selectedVoice.voice = card.dataset.voice;
            selectedVoice.rate = parseFloat(card.dataset.rate) || 1.0;
            selectedVoice.name = card.querySelector(".voice-name").textContent;
            // 속도 슬라이더 업데이트 (sp-slider: rate × 10)
            var slider = document.getElementById("narrSpeed");
            if (slider) { slider.value = Math.round(selectedVoice.rate * 10); }
            var speedVal = document.getElementById("narrSpeedVal");
            if (speedVal) { speedVal.textContent = selectedVoice.rate.toFixed(1) + "x"; }
            // 프리뷰 업데이트
            var preview = document.getElementById("narrPreview");
            if (preview) {
              preview.innerHTML = '<span class="preview-name">' + selectedVoice.name + '</span> 선택됨<br><span class="preview-voice">' + selectedVoice.voice + ' · ' + selectedVoice.rate.toFixed(1) + 'x</span>';
            }
          });
        });

        // 속도 슬라이더 (sp-slider: 5~20 → 0.5~2.0)
        var narrSpeedSlider = document.getElementById("narrSpeed");
        if (narrSpeedSlider) {
          narrSpeedSlider.addEventListener("input", function() {
            var raw = parseInt(this.value) || 10;
            var v = raw / 10.0;
            selectedVoice.rate = v;
            var speedVal = document.getElementById("narrSpeedVal");
            if (speedVal) { speedVal.textContent = v.toFixed(1) + "x"; }
            var preview = document.getElementById("narrPreview");
            if (preview) {
              preview.innerHTML = '<span class="preview-name">' + selectedVoice.name + '</span> 선택됨<br><span class="preview-voice">' + selectedVoice.voice + ' · ' + v.toFixed(1) + 'x</span>';
            }
          });
        }

        // 나레이션 생성 + 임포트 버튼
        document.getElementById("btnNarrGenerate").addEventListener("click", async function() {
          var textEl = document.getElementById("narrText");
          var text = textEl ? (textEl.value || "").trim() : "";
          if (!text) {
            log("나레이션 텍스트를 입력해주세요", "warn");
            return;
          }
          if (!folderToken) {
            log("먼저 ▶ 시작을 눌러주세요", "warn");
            return;
          }
          log("🎙️ 나레이션 생성 요청: " + selectedVoice.name + " (" + selectedVoice.voice + ")", "info");
          var ts = Date.now();
          var reqFile = await folderToken.createFile("chat-request-" + ts + ".json", { overwrite: true });
          await reqFile.write(JSON.stringify({
            type: "narration",
            message: "음성 " + text,
            voice: selectedVoice.voice,
            rate: selectedVoice.rate,
            characterName: selectedVoice.name,
            timestamp: new Date().toISOString()
          }));
          // 나레이션 탭에 결과 표시 (채팅으로 이동하지 않음)
          var preview = document.getElementById("narrPreview");
          if (preview) {
            preview.innerHTML = '⏳ <span class="preview-name">' + selectedVoice.name + '</span> 목소리로 생성 중...<br><span class="preview-voice">' + text.substring(0, 40) + (text.length > 40 ? "..." : "") + '</span>';
          }
          log("🎙️ 나레이션 생성: [" + selectedVoice.name + "] " + text, "info");
        });

        // 미리듣기 버튼 (짧은 샘플 생성)
        document.getElementById("btnNarrPreview").addEventListener("click", async function() {
          var textEl = document.getElementById("narrText");
          var text = textEl ? (textEl.value || "").trim() : "";
          if (!text) { text = "안녕하세요, 테스트입니다."; }
          // 첫 20자만 미리듣기
          var previewText = text.substring(0, 30);
          if (!folderToken) {
            log("먼저 ▶ 시작을 눌러주세요", "warn");
            return;
          }
          log("🔊 미리듣기: " + previewText, "info");
          var ts = Date.now();
          var reqFile = await folderToken.createFile("chat-request-" + ts + ".json", { overwrite: true });
          await reqFile.write(JSON.stringify({
            type: "tts_preview",
            message: "음성 " + previewText,
            voice: selectedVoice.voice,
            rate: selectedVoice.rate,
            preview: true,
            timestamp: new Date().toISOString()
          }));
          var preview = document.getElementById("narrPreview");
          if (preview) {
            preview.innerHTML = '🔊 미리듣기 생성 중...<br><span class="preview-voice">' + previewText + ' (' + selectedVoice.name + ')</span>';
          }
          log("🔊 미리듣기: " + previewText + " (" + selectedVoice.name + ")", "info");
        });

        // ── 편집 조건 토글 ──
        document.querySelectorAll(".edit-opt").forEach(function(el) {
          el.addEventListener("click", function() {
            el.classList.toggle("active");
            const opt = el.dataset.opt;
            const isActive = el.classList.contains("active");
            log((isActive ? "✓ " : "✗ ") + el.textContent.trim(), "info");
          });
        });

        // ── 채팅 헬퍼 ──
        function addChat(text, type) {
          const box = document.getElementById("chatBox");
          const div = document.createElement("div");
          div.className = "chat-msg " + (type || "ai");
          div.textContent = text;
          box.appendChild(div);
          box.scrollTop = box.scrollHeight;
          // 채팅탭 아닐 때 탭에 알림 표시
          const chatTab = document.querySelector('.tab-btn[data-tab="chat"]');
          if (chatTab && !chatTab.classList.contains("active")) {
            chatTab.textContent = "💬 채팅 🔴";
          }
        }

        // ── 채팅 명령 처리 엔진 ──
        async function processChat(msg, files) {
          files = files || [];
          const m = (msg || "").toLowerCase();
          try {
            // ── 첨부파일+메시지 → 무조건 Claude Code 전달 ──
            if (files.length > 0) {
              if (folderToken) {
                const ts = Date.now();
                const reqFile = await folderToken.createFile("chat-request-" + ts + ".json", { overwrite: true });
                const activeOpts = [];
                document.querySelectorAll(".edit-opt.active").forEach(el => activeOpts.push(el.dataset.opt));
                await reqFile.write(JSON.stringify({
                  type: "chat",
                  message: msg || "첨부파일 처리해줘",
                  options: activeOpts,
                  files: files.map(function(f) { return { name: f.name, path: f.path, type: f.type }; }),
                  timestamp: new Date().toISOString()
                }));
                addChat("🤖 파일 " + files.length + "개 + 요청 전달됨 — 처리 중...", "ai");
              } else {
                addChat("⚠️ 먼저 ▶ 시작을 눌러주세요!", "ai");
              }
              return;
            }

            // ── 저장 ──
            if (m.includes("저장")) {
              addChat("프로젝트 저장 중...", "ai");
              const project = await ppro.Project.getActiveProject();
              await project.save();
              addChat("✅ 프로젝트 저장 완료!", "ai");
              return;
            }

            // ── 정보 ──
            if (m.includes("정보") || m.includes("상태")) {
              const project = await ppro.Project.getActiveProject();
              const seq = await project.getActiveSequence();
              if (!seq) { addChat("❌ 활성 시퀀스가 없어요", "ai"); return; }
              const vtCount = await seq.getVideoTrackCount();
              const atCount = await seq.getAudioTrackCount();
              let info = "📊 " + seq.name + "\n";
              for (let i = 0; i < vtCount; i++) {
                const t = await seq.getVideoTrack(i);
                const clips = await t.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
                info += "V" + (i+1) + ": " + clips.length + "개  ";
              }
              info += "\n오디오 트랙: " + atCount + "개";
              addChat(info, "ai");
              return;
            }

            // ── 음소거 해제 (음소거보다 먼저 체크) ──
            if (m.includes("음소거 해제") || m.includes("소리 켜") || m.includes("unmute")) {
              const project = await ppro.Project.getActiveProject();
              const seq = await project.getActiveSequence();
              const atCount = await seq.getAudioTrackCount();
              for (let i = 0; i < atCount; i++) {
                const at = await seq.getAudioTrack(i);
                await at.setMute(false);
              }
              addChat("🔊 오디오 " + atCount + "개 트랙 음소거 해제!", "ai");
              return;
            }

            // ── 음소거 ──
            if (m.includes("음소거") || m.includes("뮤트") || m.includes("mute")) {
              const project = await ppro.Project.getActiveProject();
              const seq = await project.getActiveSequence();
              const atCount = await seq.getAudioTrackCount();
              for (let i = 0; i < atCount; i++) {
                const at = await seq.getAudioTrack(i);
                await at.setMute(true);
              }
              addChat("🔇 오디오 " + atCount + "개 트랙 음소거 완료!", "ai");
              return;
            }

            // ── 트랜지션 ──
            if (m.includes("트랜지션") || m.includes("전환")) {
              addChat("✨ V1 트랜지션 적용 중...", "ai");
              const result = await batchAddTransitions({ trackIndex: 0, duration: 0.3, skipFirst: true });
              addChat("✅ 트랜지션 " + result.applied + "/" + result.total + "개 적용!", "ai");
              return;
            }

            // ── 스케일 ──
            if (m.includes("스케일") || m.includes("scale") || m.includes("크기")) {
              const numMatch = msg.match(/(\d+)/);
              const scale = numMatch ? parseInt(numMatch[1]) : 100;
              // 트랙 번호 추출
              let trackIdx = 0;
              if (m.includes("v2") || m.includes("배경")) trackIdx = 1;
              else if (m.includes("v3")) trackIdx = 2;
              else if (m.includes("v4") || m.includes("상의")) trackIdx = 3;
              else if (m.includes("v5") || m.includes("하의")) trackIdx = 4;
              addChat("📐 V" + (trackIdx+1) + " 스케일 " + scale + "% 적용 중...", "ai");
              const result = await batchSetProperties({ trackIndex: trackIdx, scale: scale });
              addChat("✅ " + result.applied + "개 클립 스케일 " + scale + "% 완료!", "ai");
              return;
            }

            // ── 투명도 ──
            if (m.includes("투명도") || m.includes("opacity") || m.includes("불투명")) {
              const numMatch = msg.match(/(\d+)/);
              const opacity = numMatch ? parseInt(numMatch[1]) : 90;
              let trackIdx = 3; // 기본 V4
              if (m.includes("v2") || m.includes("배경")) trackIdx = 1;
              else if (m.includes("v3")) trackIdx = 2;
              else if (m.includes("v5") || m.includes("하의")) trackIdx = 4;
              else if (m.includes("v4") || m.includes("상의")) trackIdx = 3;
              addChat("🔲 V" + (trackIdx+1) + " 투명도 " + opacity + "% 적용 중...", "ai");
              const result = await batchSetProperties({ trackIndex: trackIdx, opacity: opacity });
              addChat("✅ " + result.applied + "개 클립 투명도 " + opacity + "% 완료!", "ai");
              return;
            }

            // ── 패턴 분석 ──
            if (m.includes("분석") || m.includes("패턴") || m.includes("analyze")) {
              addChat("🔍 Look 1 패턴 분석 중...", "ai");
              const result = await analyzeLook({ lookIndex: 1 });
              if (result.success) {
                const t = result.template;
                const v1 = t.tracks["V1"];
                addChat("✅ 분석 완료! V1 클립 " + (v1 ? v1.clips.length : 0) + "개, 총 " + (t.totalDuration || 0).toFixed(1) + "초", "ai");
              } else {
                addChat("❌ 분석 실패: " + result.error, "ai");
              }
              return;
            }

            // ── 자동 적용 ──
            if (m.includes("자동 적용") || m.includes("자동적용") || m.includes("apply")) {
              addChat("🚀 템플릿 자동 적용 중...", "ai");
              const activeOpts = [];
              document.querySelectorAll(".edit-opt.active").forEach(el => activeOpts.push(el.dataset.opt));
              const result = await applyTemplate({ lookRange: [2, 10], options: activeOpts, notes: msg });
              if (result.success) {
                addChat("✅ 자동 적용 완료! " + (result.applied || 0) + "개 룩 처리됨", "ai");
              } else {
                addChat("❌ " + result.error, "ai");
              }
              return;
            }

            // ── 정리 ──
            if (m.includes("정리") || m.includes("cleanup")) {
              const project = await ppro.Project.getActiveProject();
              const seq = await project.getActiveSequence();
              const keepNames = seq ? [seq.name] : [];
              const result = await cleanupSequences({ keepNames });
              addChat("🗑️ " + result.deleted.length + "개 시퀀스 삭제, " + result.kept.length + "개 유지", "ai");
              return;
            }

            // ── 도움말 ──
            if (m.includes("도움") || m.includes("help") || m === "?") {
              addChat("📌 사용 가능한 명령어:", "ai");
              addChat("저장 / 정보 / 음소거 / 음소거 해제", "ai");
              addChat("트랜지션 / 스케일 30 / 투명도 90", "ai");
              addChat("V4 스케일 25 / V5 투명도 30", "ai");
              addChat("패턴 분석 / 자동 적용 / 정리", "ai");
              addChat("🎙️ 음성 LOOK 1 소개합니다 → 남자 TTS 생성+임포트", "ai");
              addChat("😀 스티커 하트 / 이모지 귀여운 → 스티커 검색+임포트", "ai");
              addChat("📎 버튼으로 템플릿/사진 첨부 후 요청", "ai");
              addChat("그 외 자유 텍스트 → Claude Code 전달", "ai");
              return;
            }

            // ── 스티커/이모지 ──
            if (m.includes("스티커") || m.includes("이모지") || m.includes("이모티콘") || m.includes("sticker") || m.includes("emoji") || m.includes("짤")) {
              addChat("😀 스티커 검색 중...", "ai");
              if (folderToken) {
                const ts = Date.now();
                const reqFile = await folderToken.createFile("chat-request-" + ts + ".json", { overwrite: true });
                await reqFile.write(JSON.stringify({
                  type: "sticker",
                  message: msg,
                  timestamp: new Date().toISOString()
                }));
                addChat("⏳ 스티커 검색 + 다운로드 + 임포트 처리 중...", "ai");
              } else {
                addChat("⚠️ 먼저 ▶ 시작을 눌러주세요!", "ai");
              }
              return;
            }

            // ── TTS 음성 변환 ──
            if (m.includes("음성") || m.includes("tts") || m.includes("나레이션") || m.includes("말해") || m.includes("읽어") || m.includes("보이스")) {
              // "음성 안녕하세요" 또는 "TTS LOOK 1 소개" 에서 텍스트 추출
              let ttsText = msg;
              ttsText = ttsText.replace(/^(음성|tts|나레이션|말해|읽어|보이스)[:\s]*(생성|만들어|변환|줘|봐)?[:\s]*/i, "").trim();
              if (!ttsText || ttsText.length < 2) {
                addChat("🎙️ 사용법: '음성 안녕하세요' 또는 'TTS LOOK 1 소개'", "ai");
                return;
              }
              addChat("🎙️ 음성 생성 요청: " + ttsText, "ai");
              // chat-monitor가 즉시 처리 (chat-request 파일로 전달)
              if (folderToken) {
                const ts = Date.now();
                const reqFile = await folderToken.createFile("chat-request-" + ts + ".json", { overwrite: true });
                await reqFile.write(JSON.stringify({
                  type: "tts",
                  message: "음성 " + ttsText,
                  timestamp: new Date().toISOString()
                }));
                addChat("⏳ 남자 목소리 TTS 생성 + 프리미어 임포트 처리 중...", "ai");
              } else {
                addChat("⚠️ 먼저 ▶ 시작을 눌러주세요!", "ai");
              }
              return;
            }

            // ── 매칭 안 됨 → Claude Code로 전달 ──
            if (folderToken) {
              const ts = Date.now();
              const reqFile = await folderToken.createFile("chat-request-" + ts + ".json", { overwrite: true });
              const activeOpts = [];
              document.querySelectorAll(".edit-opt.active").forEach(el => activeOpts.push(el.dataset.opt));
              const reqData = {
                type: "chat",
                message: msg,
                options: activeOpts,
                files: files.map(function(f) { return { name: f.name, path: f.path, type: f.type }; }),
                timestamp: new Date().toISOString()
              };
              await reqFile.write(JSON.stringify(reqData));
              const fileNote = files.length > 0 ? " (📎 " + files.length + "개 파일 포함)" : "";
              addChat("🤖 Claude Code로 전달됨" + fileNote + " — 잠시 기다려주세요...", "ai");
              log("채팅 → Claude: " + (msg || "").substring(0, 30) + fileNote, "info");
            } else {
              addChat("⚠️ 먼저 ▶ 시작을 눌러주세요!", "ai");
            }

          } catch(e) {
            addChat("❌ 오류: " + e.message, "ai");
            log("채팅 오류: " + e.message, "err");
          }
        }

        // ── 첨부파일 관리 ──
        let attachedFiles = [];

        function renderAttachments() {
          const area = document.getElementById("attachArea");
          area.innerHTML = "";
          attachedFiles.forEach(function(f, idx) {
            const chip = document.createElement("span");
            chip.className = "attach-chip";
            chip.innerHTML = "📄 " + f.name + " <span class='remove' data-idx='" + idx + "'>✕</span>";
            area.appendChild(chip);
          });
          // 삭제 버튼
          area.querySelectorAll(".remove").forEach(function(btn) {
            btn.addEventListener("click", function() {
              const i = parseInt(btn.dataset.idx);
              attachedFiles.splice(i, 1);
              renderAttachments();
            });
          });
        }

        // ── 📎 파일 첨부 버튼 ──
        document.getElementById("btnAttach").addEventListener("click", async function() {
          const uxp = require("uxp");
          try {
            const types = [
              "png", "jpg", "jpeg", "gif", "bmp", "webp",
              "mogrt", "prproj", "json",
              "mp3", "wav", "mp4", "mov"
            ];
            const file = await uxp.storage.localFileSystem.getFileForOpening({ types: types });
            if (!file) return;

            const fileInfo = {
              name: file.name,
              path: file.nativePath,
              type: file.name.split(".").pop().toLowerCase()
            };
            attachedFiles.push(fileInfo);
            renderAttachments();

            // 채팅에도 표시
            const ext = fileInfo.type;
            let icon = "📄";
            if (["png","jpg","jpeg","gif","bmp","webp"].includes(ext)) icon = "🖼️";
            else if (["mp3","wav"].includes(ext)) icon = "🎵";
            else if (["mp4","mov"].includes(ext)) icon = "🎬";
            else if (ext === "mogrt") icon = "🎨";
            else if (ext === "json") icon = "📋";
            addChat(icon + " " + file.name + " 첨부됨", "user");
            log("첨부: " + file.nativePath, "info");
          } catch(e) {
            // 취소 또는 에러
            if (e.message && !e.message.includes("cancel")) {
              log("첨부 오류: " + e.message, "err");
            }
          }
        });

        // ── 채팅: 전송 버튼 ──
        document.getElementById("btnSend").addEventListener("click", async function() {
          const input = document.getElementById("chatInput");
          const msg = input.value.trim();
          if (!msg && attachedFiles.length === 0) return;

          if (msg) addChat(msg, "user");
          input.value = "";

          // 첨부파일이 있으면 메시지에 정보 포함
          const filesForRequest = attachedFiles.slice();
          if (filesForRequest.length > 0) {
            attachedFiles = [];
            renderAttachments();
          }

          await processChat(msg, filesForRequest);
        });

        // ── 채팅: Enter 키 ──
        document.getElementById("chatInput").addEventListener("keyup", function(e) {
          if (e.key === "Enter") {
            document.getElementById("btnSend").click();
          }
        });
      },
      show() {},
      hide() {}
    }
  }
});
