# 편집 워크플로우 (필수 준수)

> ⚠️ **절대 규칙**: 아래 1~4단계를 모두 통과하기 전에는 **어떤 컷편집도 시작하지 않는다.**
> 클립 내용을 모른 채 프레임 이미지만 보고 편집하면 브이로그의 핵심(대화·감정·이야기)이
> 사라진다. 과거 실패 사례: 45분 촬영본을 2분 20초로 잘못 압축함.

---

## STEP 1 — 전체 클립 전사 (Transcribe ALL clips)

시퀀스에 들어간 **모든** 소스 클립을 순서대로 전사한다. 일부만 전사하면 안 된다.

```bash
# 1-1. 시퀀스 클립 순서를 order.json으로 저장
#      (Claude가 list_sequence_tracks로 읽은 순서를 파일명 배열로 기록)

# 1-2. 배치 전사 실행 → dialogue_map.json 생성
python3 batch_transcribe.py \
  --clips-dir "/소스/클립/폴더" \
  --order ./output/order.json \
  --output ./output \
  --language en --model large-v3
```

산출물: `output/dialogue_map.json` — 모든 클립의 대사 + 시퀀스 타임라인 매핑

---

## STEP 2 — SRT 생성 후 시퀀스에 캡션 삽입

```bash
python3 srt_export.py \
  --dialogue ./output/dialogue_map.json \
  --output ./output/sequence.srt
```

그 다음 Premiere MCP로 시퀀스에 자막 트랙을 삽입한다:
- `create_caption_track` 로 SRT(`output/sequence.srt`)를 시퀀스에 추가
- 삽입 후 `read_sequence_captions` 로 실제 들어갔는지 검증

자막이 시퀀스에 들어가야 편집자(사람)도, Claude도 같은 화면에서 흐름을 확인할 수 있다.

---

## STEP 3 — 이해도 게이트 (Comprehension Gate) ★필수★

컷편집 시작 전에 Claude는 **반드시** 아래를 사용자에게 제출하고 확인을 받는다.
이것을 통과하지 못하면 컷편집 금지.

제출 항목:
1. **클립별 1줄 요약** — 모든 클립(예: 0041~0074)에 대해
   `[클립번호] 타임라인구간 | 장소 | 화자 | 핵심 대사/사건 | 감정 톤`
2. **전체 스토리 흐름** — 기승전결 또는 8단계 서클로 매핑
3. **하이라이트 후보** — 웃긴 순간, 감정 피크, 반전 지점 (타임코드 포함)
4. **목표 길이 계획** — 10~20분 롱폼. 각 서사 단계에 몇 분 배분할지

> 게이트 통과 기준: 사용자가 "맞아, 진행해"라고 확인. 또는 수정 피드백 반영 후 재확인.

---

## STEP 4 — 컷편집 실행 (대화·감정 보존)

게이트 통과 후에만 시작. 롱폼 브이로그 원칙:

- **대화는 자른다 ≠ 대화를 죽인다.** 말 끝나기 전에 끊지 말 것. 호흡/리액션 여백 유지.
- **삭제 단위는 "지루한 구간"이지 "대화 구간"이 아니다.** 침묵·이동·반복 준비과정만 압축.
- **목표는 10~20분.** 45분 → 2분은 명백한 과편집. 통상 롱폼은 원본의 30~50% 유지.
- 편집 기술은 `claude_edit_prompt.md`의 템플릿(Punch-In, Speed Ramp, J/L-Cut 등) 적용.

---

## 처리 규칙 (Process Rules)

### 규칙 A — 영상·오디오 동시 삭제 (Linked A/V Delete)
클립 일부를 삭제할 때 영상만 지우고 오디오를 따로 또 지우는 "두 번 일"을 하지 않는다.

- `razor_timeline_at_time` 은 **모든 트랙(영상+오디오)을 동시에** 자른다 → 이걸 우선 사용.
- 삭제는 `remove_from_timeline(deleteMode="ripple")` 로 해당 구간 영상+오디오를 한 번에 제거.
- 클립이 링크 해제돼 있으면 `link_audio_video(linked=true)` 로 먼저 링크 후 삭제.
- 절대 영상 클립 삭제 → 남은 오디오 따로 삭제 순서로 두 번 작업하지 않는다.

### 규칙 B — 클립 순서 유동적 변경 (Reorder, 필요할 때만)
재미를 위해 시간 순서를 바꾸는 게 나을 때만 사용. 기본은 촬영 순서 유지.

- `move_clip(clipId, newTime, newTrackIndex)` 로 위치 이동.
- 순서를 바꾸면 대사 흐름/문맥이 깨지지 않는지 dialogue_map.json으로 반드시 재검증.
- 예: 하이라이트(반전 리액션)를 오프닝 훅으로 앞당기기 → 단, 원래 위치엔 맥락 남기기.

### 규칙 C — 원본 보호
편집은 항상 `duplicate_sequence` 로 복제본에서 진행. 원본 시퀀스는 손대지 않는다.
