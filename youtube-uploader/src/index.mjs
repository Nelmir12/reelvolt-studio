import { createReadStream } from "node:fs";
import { appendFile, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const baseUrl = (process.env.REELVOLT_BASE_URL || "").replace(/\/+$/, "");
const workerSecret = process.env.YOUTUBE_WORKER_SECRET || "";
const pollIntervalMs = Math.max(2_000, Number(process.env.POLL_INTERVAL_MS || 10_000));
const port = Number(process.env.PORT || 10_000);
const uploadChunkBytes = 16 * 1024 * 1024;
let shuttingDown = false;
let activeJob = null;
let lastError = null;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function authHeaders(extra = {}) {
  return { authorization: `Bearer ${workerSecret}`, ...extra };
}

async function responseJson(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { error: text || `HTTP ${response.status}` };
  }
  if (!response.ok) {
    const error = new Error(payload?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function siteRequest(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: authHeaders(init.headers),
    signal: AbortSignal.timeout(init.timeoutMs || 120_000),
  });
  return responseJson(response);
}

async function heartbeat(job, status, fields = {}) {
  return siteRequest(`/api/internal/youtube/jobs/${job.id}/heartbeat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lease: job.lease, status, ...fields }),
  });
}

async function failJob(job, error, retryable = true) {
  const message = error instanceof Error ? error.message : String(error);
  try {
    await siteRequest(`/api/internal/youtube/jobs/${job.id}/fail`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lease: job.lease, error: message.slice(0, 700), retryable }),
    });
  } catch (reportError) {
    console.error("Não foi possível registrar a falha:", reportError);
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
      } else {
        reject(new Error(`${command} falhou (${code}): ${Buffer.concat(stderr).toString("utf8").slice(-1200)}`));
      }
    });
  });
}

async function downloadMedia(job, destination) {
  const head = await fetch(job.mediaUrl, {
    method: "HEAD",
    signal: AbortSignal.timeout(60_000),
  });
  if (!head.ok) throw new Error(`O MP4 assinado não está disponível (HTTP ${head.status}).`);
  const total = Number(head.headers.get("content-length") || job.sizeBytes || 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error("O tamanho do MP4 não foi informado.");
  let offset = 0;
  while (offset < total) {
    const end = Math.min(total - 1, offset + uploadChunkBytes - 1);
    const response = await fetch(job.mediaUrl, {
      headers: { range: `bytes=${offset}-${end}` },
      signal: AbortSignal.timeout(120_000),
    });
    if (response.status !== 206 || !response.body) {
      throw new Error(`O download retomável falhou no byte ${offset} (HTTP ${response.status}).`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    await appendFile(destination, bytes);
    offset += bytes.length;
    await heartbeat(job, "preflight", { bytesUploaded: 0 });
  }
  return total;
}

async function probeMedia(path) {
  const output = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,format_name:stream=index,codec_type,codec_name,width,height",
    "-of", "json",
    path,
  ]);
  const data = JSON.parse(output);
  const video = data.streams?.find((stream) => stream.codec_type === "video");
  const audio = data.streams?.find((stream) => stream.codec_type === "audio");
  const durationSeconds = Number(data.format?.duration || 0);
  if (!video || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Arquivo corrompido ou sem faixa de vídeo válida.");
  }
  return {
    durationSeconds,
    durationMs: Math.round(durationSeconds * 1000),
    widthPixels: Number(video.width || 0),
    heightPixels: Number(video.height || 0),
    codec: String(video.codec_name || "unknown"),
    audioCodec: audio?.codec_name ? String(audio.codec_name) : null,
    hasAudio: Boolean(audio),
    container: String(data.format?.format_name || ""),
  };
}

async function extractEvidence(input, directory, probe) {
  const positions = [
    Math.min(1, Math.max(0, probe.durationSeconds * 0.05)),
    Math.max(0, probe.durationSeconds * 0.35),
    Math.max(0, probe.durationSeconds * 0.7),
  ];
  const frames = [];
  for (let index = 0; index < positions.length; index += 1) {
    const framePath = join(directory, `frame-${index + 1}.jpg`);
    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-ss", positions[index].toFixed(3),
      "-i", input, "-frames:v", "1", "-vf", "scale='min(720,iw)':-2",
      "-q:v", "4", "-y", framePath,
    ]);
    frames.push(framePath);
  }
  let audioPath = null;
  if (probe.hasAudio) {
    audioPath = join(directory, "audio.m4a");
    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-i", input, "-vn",
      "-ac", "1", "-ar", "16000", "-c:a", "aac", "-b:a", "48k", "-y", audioPath,
    ]);
  }
  return { frames, audioPath };
}

async function fileSha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function analyze(job, evidence, fingerprint) {
  const form = new FormData();
  form.set("lease", job.lease);
  form.set("sourceCaption", "");
  form.set("contentFingerprint", fingerprint);
  for (let index = 0; index < evidence.frames.length; index += 1) {
    const bytes = await readFile(evidence.frames[index]);
    form.set(`frame${index + 1}`, new Blob([bytes], { type: "image/jpeg" }), `frame-${index + 1}.jpg`);
  }
  if (evidence.audioPath) {
    const bytes = await readFile(evidence.audioPath);
    form.set("audio", new Blob([bytes], { type: "audio/mp4" }), "audio.m4a");
  }
  const response = await fetch(`${baseUrl}/api/internal/youtube/jobs/${job.id}/analyze`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
    signal: AbortSignal.timeout(180_000),
  });
  return responseJson(response);
}

async function youtubeRequest(url, accessToken, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
    redirect: "manual",
    signal: AbortSignal.timeout(init.timeoutMs || 120_000),
    ...(init.body && typeof init.body.pipe === "function" ? { duplex: "half" } : {}),
  });
  return response;
}

async function startUpload(job, metadata, sizeBytes, contentType) {
  const query = new URLSearchParams({
    uploadType: "resumable",
    part: "snippet,status,paidProductPlacementDetails",
    notifySubscribers: "false",
  });
  const response = await youtubeRequest(
    `https://www.googleapis.com/upload/youtube/v3/videos?${query}`,
    job.accessToken,
    {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-length": String(sizeBytes),
        "x-upload-content-type": contentType || "video/mp4",
      },
      body: JSON.stringify({
        snippet: {
          title: metadata.youtubeTitle,
          description: [
            metadata.youtubeDescription,
            ...(metadata.youtubeTags || []).map((tag) => tag.startsWith("#") ? tag : `#${tag.replace(/\s+/g, "")}`),
          ].filter(Boolean).join("\n\n"),
          tags: metadata.youtubeTags || [],
          categoryId: "24",
          defaultLanguage: "en",
        },
        status: {
          privacyStatus: "private",
          selfDeclaredMadeForKids: Boolean(job.madeForKids),
          containsSyntheticMedia: Boolean(job.containsSyntheticMedia),
        },
        paidProductPlacementDetails: {
          hasPaidProductPlacement: Boolean(job.paidProductPlacement),
        },
      }),
    },
  );
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`O YouTube recusou o início do upload (${response.status}): ${payload.slice(0, 700)}`);
  }
  const sessionUrl = response.headers.get("location");
  if (!sessionUrl) throw new Error("O YouTube não retornou a sessão de upload retomável.");
  await heartbeat(job, "uploading", { uploadSessionUrl: sessionUrl, bytesUploaded: 0 });
  return sessionUrl;
}

function confirmedOffset(response) {
  const range = response.headers.get("range");
  const match = range?.match(/bytes=0-(\d+)/i);
  return match ? Number(match[1]) + 1 : 0;
}

async function queryUploadOffset(sessionUrl, accessToken, totalBytes) {
  const response = await youtubeRequest(sessionUrl, accessToken, {
    method: "PUT",
    headers: {
      "content-length": "0",
      "content-range": `bytes */${totalBytes}`,
    },
  });
  if (response.status === 308) return { offset: confirmedOffset(response), video: null };
  if (response.ok) return { offset: totalBytes, video: await response.json() };
  const body = await response.text();
  throw new Error(`Não foi possível retomar o upload (${response.status}): ${body.slice(0, 500)}`);
}

async function uploadFile(job, sessionUrl, filePath, totalBytes, initialOffset = 0) {
  let offset = initialOffset;
  let failures = 0;
  while (offset < totalBytes) {
    const end = Math.min(totalBytes - 1, offset + uploadChunkBytes - 1);
    const stream = createReadStream(filePath, { start: offset, end });
    try {
      const response = await youtubeRequest(sessionUrl, job.accessToken, {
        method: "PUT",
        headers: {
          "content-type": job.contentType || "video/mp4",
          "content-length": String(end - offset + 1),
          "content-range": `bytes ${offset}-${end}/${totalBytes}`,
        },
        body: stream,
        timeoutMs: 10 * 60_000,
      });
      if (response.status === 308) {
        offset = Math.max(offset, confirmedOffset(response));
        await heartbeat(job, "uploading", { uploadSessionUrl: sessionUrl, bytesUploaded: offset });
        failures = 0;
        continue;
      }
      if (response.ok) {
        const video = await response.json();
        await heartbeat(job, "processing", { uploadSessionUrl: sessionUrl, bytesUploaded: totalBytes });
        return video;
      }
      if ([401, 403, 404, 410].includes(response.status)) {
        const body = await response.text();
        throw new Error(`Sessão ou autorização de upload inválida (${response.status}): ${body.slice(0, 500)}`);
      }
      if (response.status < 500 && response.status !== 429) {
        const body = await response.text();
        throw new Error(`Upload rejeitado (${response.status}): ${body.slice(0, 500)}`);
      }
      throw new Error(`Falha temporária do YouTube (${response.status}).`);
    } catch (error) {
      failures += 1;
      if (failures >= 5) throw error;
      await sleep(Math.min(30_000, 1_000 * 2 ** failures));
      const resumed = await queryUploadOffset(sessionUrl, job.accessToken, totalBytes);
      if (resumed.video) return resumed.video;
      offset = resumed.offset;
    }
  }
  const completed = await queryUploadOffset(sessionUrl, job.accessToken, totalBytes);
  if (completed.video) return completed.video;
  throw new Error("A sessão terminou sem retornar o ID do vídeo.");
}

async function waitForProcessing(job, videoId, localProbe) {
  const deadline = Date.now() + 30 * 60_000;
  while (Date.now() < deadline) {
    const query = new URLSearchParams({
      part: "status,processingDetails,fileDetails",
      id: videoId,
    });
    const response = await youtubeRequest(
      `https://www.googleapis.com/youtube/v3/videos?${query}`,
      job.accessToken,
    );
    const payload = await responseJson(response);
    const video = payload?.items?.[0];
    if (!video) throw new Error("O vídeo enviado não foi encontrado no canal conectado.");
    if (video.status?.privacyStatus !== "private") {
      throw new Error("Gate de privacidade violado: o upload não permaneceu privado.");
    }
    const uploadStatus = video.status?.uploadStatus;
    const processingStatus = video.processingDetails?.processingStatus;
    if (uploadStatus === "rejected" || uploadStatus === "failed" || processingStatus === "failed") {
      throw new Error(`O processamento do YouTube falhou: ${video.processingDetails?.processingFailureReason || uploadStatus}.`);
    }
    if (uploadStatus === "processed" && processingStatus === "succeeded") {
      const stream = video.fileDetails?.videoStreams?.[0] || {};
      return {
        durationMs: Number(video.fileDetails?.durationMs || localProbe.durationMs),
        widthPixels: Number(stream.widthPixels || localProbe.widthPixels),
        heightPixels: Number(stream.heightPixels || localProbe.heightPixels),
        codec: String(stream.codec || localProbe.codec),
        hasAudio: localProbe.hasAudio,
      };
    }
    await heartbeat(job, "processing", { bytesUploaded: job.sizeBytes });
    await sleep(15_000);
  }
  throw new Error("O YouTube não concluiu o processamento dentro de 30 minutos.");
}

function validatePreflight(probe) {
  if (probe.widthPixels <= 0 || probe.heightPixels <= 0) {
    return "O vídeo não informou dimensões válidas.";
  }
  if (probe.widthPixels > probe.heightPixels) {
    return "O vídeo é horizontal. Use um arquivo quadrado ou vertical.";
  }
  if (probe.durationMs > 180_000) {
    return "O vídeo ultrapassa 180 segundos e não entra no fluxo de Shorts.";
  }
  return null;
}

async function processJob(job) {
  const directory = await mkdtemp(join(tmpdir(), "reelvolt-youtube-"));
  const videoPath = join(directory, "video.mp4");
  try {
    await heartbeat(job, "preflight");
    const sizeBytes = await downloadMedia(job, videoPath);
    const actual = await stat(videoPath);
    if (actual.size !== sizeBytes) throw new Error("O MP4 baixado ficou incompleto.");
    const probe = await probeMedia(videoPath);
    const preflightError = validatePreflight(probe);
    if (preflightError) {
      await failJob(job, new Error(preflightError), false);
      return;
    }
    await heartbeat(job, "analyzing");
    const evidence = await extractEvidence(videoPath, directory, probe);
    const analysis = await analyze(job, evidence, await fileSha256(videoPath));
    if (analysis?.blocked) return;
    if (!job.accessToken) {
      throw new Error("Conecte o canal do YouTube para continuar após a análise preventiva.");
    }
    const metadata = analysis?.metadata;
    if (!metadata?.youtubeTitle || !metadata?.youtubeDescription) {
      throw new Error("A análise não retornou metadados completos.");
    }
    const sessionUrl = await startUpload(job, metadata, sizeBytes, job.contentType);
    const uploaded = await uploadFile(job, sessionUrl, videoPath, sizeBytes);
    const videoId = uploaded?.id;
    if (!videoId) throw new Error("O YouTube concluiu o upload sem retornar um ID.");
    const technical = await waitForProcessing(job, videoId, probe);
    await siteRequest(`/api/internal/youtube/jobs/${job.id}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lease: job.lease, videoId, ...technical }),
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function claim() {
  return siteRequest("/api/internal/youtube/jobs/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

async function pollingLoop() {
  if (!baseUrl || !workerSecret) {
    lastError = "Configure REELVOLT_BASE_URL e YOUTUBE_WORKER_SECRET.";
    console.error(lastError);
    return;
  }
  while (!shuttingDown) {
    try {
      const payload = await claim();
      if (!payload?.job) {
        await sleep(pollIntervalMs);
        continue;
      }
      activeJob = payload.job.id;
      try {
        await processJob(payload.job);
        lastError = null;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.error(`Job ${payload.job.id}:`, error);
        await failJob(payload.job, error, true);
      } finally {
        activeJob = null;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error("Polling:", error);
      await sleep(pollIntervalMs);
    }
  }
}

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(lastError ? 200 : 200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      ok: Boolean(baseUrl && workerSecret),
      activeJob,
      shuttingDown,
      lastError,
    }));
    return;
  }
  response.writeHead(404);
  response.end();
});

server.listen(port, "0.0.0.0", () => {
  console.log(`ReelVolt YouTube executor ouvindo na porta ${port}.`);
});

function shutdown(signal) {
  console.log(`Recebido ${signal}; encerrando após o job atual.`);
  shuttingDown = true;
  server.close();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

await pollingLoop();
