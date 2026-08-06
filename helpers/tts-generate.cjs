// tts-generate.cjs — TTS 음성 생성 (edge-tts 남자 한국어 목소리)
// 사용법: node tts-generate.cjs "텍스트" [출력파일] [속도(0.5~2.0)] [voice]
//
// 음성: ko-KR-InJoonNeural (남자), ko-KR-SunHiNeural (여자)
// 속도: 1.0 = 보통, 0.7 = 느리게, 1.5 = 빠르게

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const text = process.argv[2];
const outFile = process.argv[3] || path.join("C:\\Users\\skafu\\Desktop\\ClaudeCode\\sfx", `tts-${Date.now()}.mp3`);
const rate = parseFloat(process.argv[4]) || 1.0;
const voice = process.argv[5] || "ko-KR-InJoonNeural"; // 기본: 남자

if (!text) {
  console.log(JSON.stringify({
    success: false,
    error: "텍스트를 입력하세요",
    usage: 'node tts-generate.cjs "안녕하세요" [output.mp3] [속도] [voice]',
    voices: { male: "ko-KR-InJoonNeural", female: "ko-KR-SunHiNeural" }
  }));
  process.exit(0);
}

try {
  const dir = path.dirname(outFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // edge-tts rate format: "+20%" or "-30%"
  const ratePercent = Math.round((rate - 1.0) * 100);
  const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

  // edge-tts CLI
  const cmd = `edge-tts --voice "${voice}" --rate="${rateStr}" --text "${text.replace(/"/g, '\\"')}" --write-media "${outFile}"`;

  execSync(cmd, {
    timeout: 30000,
    encoding: "utf8",
    env: { ...process.env, PATH: process.env.PATH }
  });

  const stats = fs.statSync(outFile);
  console.log(JSON.stringify({
    success: true,
    file: outFile,
    size: stats.size,
    text: text,
    rate: rate,
    voice: voice
  }));
} catch (e) {
  // edge-tts 실패 시 System.Speech 폴백 (여자 목소리)
  try {
    const wavFile = outFile.replace(/\.mp3$/, ".wav");
    const rateVal = Math.round((rate - 1.0) * 10);
    const psScript = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SelectVoice('Microsoft Heami Desktop'); $s.Rate = ${rateVal}; $s.SetOutputToWaveFile('${wavFile.replace(/\\/g, "\\\\")}'); $s.Speak('${text.replace(/'/g, "''")}'); $s.Dispose()`;
    execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`, {
      timeout: 30000,
      encoding: "utf8"
    });
    const stats = fs.statSync(wavFile);
    console.log(JSON.stringify({
      success: true,
      file: wavFile,
      size: stats.size,
      text: text,
      rate: rate,
      voice: "Microsoft Heami Desktop (fallback)",
      note: "edge-tts 실패로 System.Speech 사용"
    }));
  } catch (e2) {
    console.log(JSON.stringify({
      success: false,
      error: e.message || String(e),
      fallbackError: e2.message || String(e2)
    }));
    process.exit(1);
  }
}
