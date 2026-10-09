// src/options.ts
var DEFAULT_SKIP_DIRS = [
  "node_modules",
  ".git",
  ".obsidian",
  ".claude",
  ".agents",
  ".workbuddy",
  ".pnpm-store",
  ".vitepress",
  ".quartz-cache",
  ".trash",
  "web",
  "web-vitepress",
  "dist"
];
var DEFAULT_ASSET_PREFIX = "/vault/";
var DEFAULT_API_BASE = "/api";
var DEFAULT_HOME_FILE = "README.md";
var DEFAULT_VIEWER_PATH = "/viewer";
var RESTART_PENDING_EVENT = "local-notes:restart-pending";
function mergeSkipDirs(extraSkipDirs) {
  return [.../* @__PURE__ */ new Set([...DEFAULT_SKIP_DIRS, ...extraSkipDirs ?? []])];
}
function resolveLocalNotesOptions(options) {
  return {
    vaultDir: options.vaultDir,
    skipDirs: mergeSkipDirs(options.extraSkipDirs),
    templateDir: options.templateDir,
    assetPrefix: options.assetPrefix ?? DEFAULT_ASSET_PREFIX,
    apiBase: options.apiBase ?? DEFAULT_API_BASE,
    homeFile: options.homeFile ?? DEFAULT_HOME_FILE,
    viewerPath: options.viewerPath ?? DEFAULT_VIEWER_PATH,
    excludedPages: options.excludedPages ?? [],
    outDir: options.outDir,
    configPath: options.configPath,
    mermaid: options.mermaid ?? true
  };
}
function resolveLocalNotesThemeOptions(options = {}) {
  return {
    assetPrefix: options.assetPrefix ?? DEFAULT_ASSET_PREFIX,
    viewerPath: options.viewerPath ?? DEFAULT_VIEWER_PATH,
    boardPath: options.boardPath,
    apiBase: options.apiBase ?? DEFAULT_API_BASE,
    homeFile: options.homeFile ?? DEFAULT_HOME_FILE,
    excludedPages: options.excludedPages ?? [],
    defaultNewNoteDir: options.defaultNewNoteDir,
    graphFolderColors: options.graphFolderColors ?? {},
    enableEditThisPage: options.enableEditThisPage ?? true,
    enableNewNote: options.enableNewNote ?? true
  };
}

// src/plugins/backlinks.ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
var MODULE_ID = "virtual:backlinks";
var RESOLVED_ID = "\0virtual:backlinks";
var GRAPH_MODULE_ID = "virtual:graph";
var GRAPH_RESOLVED_ID = "\0virtual:graph";
function buildNoteIndex(vaultDir, skipDirs) {
  const byName = /* @__PURE__ */ new Map();
  const byPath = /* @__PURE__ */ new Map();
  function scanDir(dir) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      let stat;
      try {
        stat = statSync(fullPath, { throwIfNoEntry: false });
      } catch {
        continue;
      }
      if (!stat) continue;
      if (stat.isDirectory()) {
        if (skipDirs.has(entry) || entry.startsWith(".")) {
          continue;
        }
        scanDir(fullPath);
      } else if (entry.endsWith(".md")) {
        const relPath = relative(vaultDir, fullPath).replace(/\\/g, "/");
        const nameNoExt = basename(entry, ".md");
        const pagePath = relPath.replace(/\.md$/, "");
        let title = nameNoExt;
        try {
          const content = readFileSync(fullPath, "utf-8");
          const fmMatch = content.match(/^---\n[\s\S]*?^title:\s*(.+)$/m);
          if (fmMatch) {
            title = fmMatch[1]?.trim().replace(/^["']|["']$/g, "") ?? title;
          } else {
            const h1Match = content.match(/^#\s+(.+)$/m);
            if (h1Match) {
              title = h1Match[1]?.trim() ?? title;
            }
          }
        } catch {
        }
        const target = { pagePath, title };
        byPath.set(pagePath, target);
        if (!byName.has(nameNoExt)) {
          byName.set(nameNoExt, target);
        }
      }
    }
  }
  scanDir(vaultDir);
  return { byName, byPath };
}
function extractWikilinks(content) {
  const links = [];
  const regex = /(?<!!)\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const inner = match[1] ?? "";
    const pipeIdx = inner.indexOf("|");
    let target, text;
    if (pipeIdx >= 0) {
      target = inner.slice(0, pipeIdx).trim();
      text = inner.slice(pipeIdx + 1).trim();
    } else {
      target = inner.trim();
      text = inner.trim();
    }
    target = basename(target).trim();
    const hashIdx = target.indexOf("#");
    if (hashIdx >= 0) {
      target = target.slice(0, hashIdx).trim();
    }
    if (target) {
      links.push({ target, text });
    }
  }
  return links;
}
function buildGraphData(vaultDir, skipDirs) {
  const nodes = [];
  const edges = [];
  const seenEdges = /* @__PURE__ */ new Set();
  const backlinks = buildBacklinksIndex(vaultDir, skipDirs);
  const { byPath } = buildNoteIndex(vaultDir, skipDirs);
  for (const [pagePath, target] of byPath) {
    nodes.push({
      id: pagePath,
      title: target.title,
      folder: pagePath.includes("/") ? pagePath.split("/")[0] ?? "\uFF08\u6839\u76EE\u5F55\uFF09" : "\uFF08\u6839\u76EE\u5F55\uFF09"
    });
  }
  for (const [target, entries] of Object.entries(backlinks)) {
    for (const e of entries) {
      const key = `${e.from}\0${target}`;
      if (e.from === target || seenEdges.has(key)) continue;
      seenEdges.add(key);
      edges.push({ source: e.from, target });
    }
  }
  return { nodes, edges };
}
function buildBacklinksIndex(vaultDir, skipDirs) {
  const { byName, byPath } = buildNoteIndex(vaultDir, skipDirs);
  const backlinks = {};
  function scanDir(dir) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      let stat;
      try {
        stat = statSync(fullPath, { throwIfNoEntry: false });
      } catch {
        continue;
      }
      if (!stat) continue;
      if (stat.isDirectory()) {
        if (skipDirs.has(entry) || entry.startsWith(".")) {
          continue;
        }
        scanDir(fullPath);
      } else if (entry.endsWith(".md")) {
        const relPath = relative(vaultDir, fullPath).replace(/\\/g, "/");
        const pagePath = relPath.replace(/\.md$/, "");
        const sourceTarget = byPath.get(pagePath);
        const sourceTitle = sourceTarget?.title ?? basename(entry, ".md");
        let content;
        try {
          content = readFileSync(fullPath, "utf-8");
        } catch {
          continue;
        }
        const links = extractWikilinks(content);
        for (const link of links) {
          const targetNote = byName.get(link.target);
          if (!targetNote) continue;
          if (!backlinks[targetNote.pagePath]) {
            backlinks[targetNote.pagePath] = [];
          }
          backlinks[targetNote.pagePath].push({
            from: pagePath,
            title: sourceTitle,
            text: link.text
          });
        }
      }
    }
  }
  scanDir(vaultDir);
  for (const key of Object.keys(backlinks)) {
    const seen = /* @__PURE__ */ new Set();
    backlinks[key] = (backlinks[key] ?? []).filter((bl) => {
      if (seen.has(bl.from)) return false;
      seen.add(bl.from);
      return true;
    });
  }
  return backlinks;
}
function backlinksPlugin(options) {
  const resolved = resolveLocalNotesOptions(options);
  const vaultDir = resolve(resolved.vaultDir);
  const skipDirs = new Set(resolved.skipDirs);
  let cachedIndex = null;
  let cachedGraph = null;
  function getIndex() {
    if (!cachedIndex) {
      cachedIndex = buildBacklinksIndex(vaultDir, skipDirs);
    }
    return cachedIndex;
  }
  function getGraph() {
    if (!cachedGraph) {
      cachedGraph = buildGraphData(vaultDir, skipDirs);
    }
    return cachedGraph;
  }
  return {
    name: "local-notes:backlinks",
    enforce: "pre",
    resolveId(id) {
      if (id === MODULE_ID) return RESOLVED_ID;
      if (id === GRAPH_MODULE_ID) return GRAPH_RESOLVED_ID;
    },
    load(id) {
      if (id === RESOLVED_ID) {
        const index = getIndex();
        return `export default ${JSON.stringify(index)};`;
      }
      if (id === GRAPH_RESOLVED_ID) {
        const graph = getGraph();
        return `export default ${JSON.stringify(graph)};`;
      }
    },
    // vault 笔记增删改时失效缓存，dev 下一次 load 重新扫描（含新笔记的反链与图谱）
    watchChange(id) {
      if (typeof id === "string" && id.endsWith(".md")) {
        cachedIndex = null;
        cachedGraph = null;
      }
    },
    // dev：内容「编辑」不重启 server，而是清缓存 + 失效虚拟模块，
    // 图谱/反链页在下次加载（导航/刷新）时拿到新数据
    configureServer(server) {
      const invalidate = () => {
        for (const id of [RESOLVED_ID, GRAPH_RESOLVED_ID]) {
          const mod = server.moduleGraph.getModuleById(id);
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
      };
      server.watcher.on("change", (file) => {
        if (typeof file === "string" && file.endsWith(".md")) {
          cachedIndex = null;
          cachedGraph = null;
          invalidate();
        }
      });
    }
  };
}

// src/plugins/autoRestart.ts
import path from "node:path";
import { utimesSync, watch } from "node:fs";

// src/plugins/selfWrite.ts
var selfWrites = /* @__PURE__ */ new Map();
function trackSelfWrite(absPath) {
  const now = Date.now();
  selfWrites.set(absPath, now);
  for (const [p, ts] of selfWrites) {
    if (now - ts > SELF_WRITE_WINDOW_MS * 3) selfWrites.delete(p);
  }
}
function isSelfRecentWrite(absPath, windowMs = SELF_WRITE_WINDOW_MS) {
  const ts = selfWrites.get(absPath);
  if (!ts) return false;
  if (Date.now() - ts > windowMs) {
    selfWrites.delete(absPath);
    return false;
  }
  return true;
}
var SELF_WRITE_WINDOW_MS = 5e3;

// src/plugins/autoRestart.ts
function restartPingRoute(apiBase) {
  return `${apiBase}/restart-ping`.replace(/\/{2,}/g, "/");
}
function newBootId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function vaultMdAutoRestart(options) {
  const resolved = resolveLocalNotesOptions(options);
  const root = path.resolve(resolved.vaultDir).replaceAll("\\", "/");
  const skipDirs = new Set(resolved.skipDirs);
  const explicitConfigPath = resolved.configPath;
  const bootId = newBootId();
  let registeredAt = 0;
  let timer = null;
  let configFilePath = explicitConfigPath ?? "";
  let fsWatcher = null;
  let lastTouchAt = 0;
  const norm = (p) => p.replaceAll("\\", "/");
  const vaultMdEventPath = (f) => {
    if (typeof f !== "string" || !f.endsWith(".md")) return null;
    let p = norm(f);
    if (!p.startsWith("/")) p = `${root}/${p}`;
    if (!p.startsWith(root + "/")) return null;
    if (p.endsWith(".tmp")) return null;
    const rel = p.slice(root.length + 1);
    if (rel.split("/").some((seg) => skipDirs.has(seg))) return null;
    return p;
  };
  return {
    name: "local-notes:md-auto-restart",
    apply: "serve",
    configResolved(config) {
      if (!configFilePath) configFilePath = config.configFile ?? "";
    },
    configureServer(server) {
      registeredAt = Date.now();
      const schedule = () => {
        if (Date.now() - lastTouchAt < 3e3) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          if (!configFilePath) {
            server.config.logger.warn(
              "[local-notes:md-auto-restart] \u672A\u627E\u5230\u7AD9\u70B9\u914D\u7F6E\u6587\u4EF6\u8DEF\u5F84\uFF08configFile \u4E3A\u7A7A\uFF09\uFF0C\u8DF3\u8FC7\u81EA\u52A8\u91CD\u542F\uFF1B\u53EF\u901A\u8FC7 options.configPath \u663E\u5F0F\u6307\u5B9A"
            );
            return;
          }
          const ping = restartPingRoute(resolved.apiBase);
          server.ws.send({
            type: "custom",
            event: RESTART_PENDING_EVENT,
            data: { ping }
          });
          const now = /* @__PURE__ */ new Date();
          utimesSync(configFilePath, now, now);
          lastTouchAt = Date.now();
        }, 800);
      };
      const guarded = (f) => {
        if (Date.now() - registeredAt < 5e3) return;
        const p = vaultMdEventPath(f);
        if (!p) return;
        if (isSelfRecentWrite(p)) return;
        schedule();
      };
      const pingRoute = restartPingRoute(resolved.apiBase);
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (url !== pingRoute) return next();
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify({ bootId }));
      });
      try {
        fsWatcher = watch(root, { recursive: true }, (_event, filename) => guarded(filename));
      } catch {
        server.config.logger.warn(
          "[local-notes:md-auto-restart] fs.watch(recursive) \u4E0D\u53EF\u7528\uFF0C\u9000\u56DE server.watcher \u76D1\u542C\uFF08\u53EF\u80FD\u6536\u4E0D\u5230 vault \u5185\u65B0\u589E\u6587\u4EF6\u4E8B\u4EF6\uFF09"
        );
      }
      server.watcher.on("add", guarded);
      server.watcher.on("unlink", guarded);
      server.watcher.on("close", () => {
        fsWatcher?.close();
        fsWatcher = null;
      });
    }
  };
}

// src/plugins/boardApi.ts
import fs from "node:fs";
import path2 from "node:path";
var SUFFIX = ".taskboard.json";
var MAX_BODY_BYTES = 32 * 1024 * 1024;
function sendJson(res, status, payload) {
  if (res.writableEnded || res.destroyed) return;
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", String(Buffer.byteLength(body)));
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve2, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("body \u8D85\u8FC7\u5927\u5C0F\u4E0A\u9650"), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve2(Buffer.concat(chunks).toString("utf8")));
    req.on("error", (err) => reject(err));
  });
}
function boardApiContext(options) {
  const resolved = resolveLocalNotesOptions(options);
  return {
    vaultDir: path2.resolve(resolved.vaultDir),
    apiBase: resolved.apiBase,
    skipDirs: new Set(resolved.skipDirs)
  };
}
function resolveBoardTarget(ctx, rawRel) {
  const vaultDir = ctx.vaultDir;
  if (typeof rawRel !== "string" || rawRel.trim() === "") return { error: "path \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32" };
  if (rawRel.includes("\0")) return { error: "path \u975E\u6CD5\uFF08\u542B\u7A7A\u5B57\u8282\uFF09" };
  let rel;
  try {
    rel = decodeURIComponent(rawRel);
  } catch {
    return { error: "path URL \u7F16\u7801\u975E\u6CD5" };
  }
  const segs = rel.split(/[\\/]+/).filter(Boolean);
  if (segs.length === 0) return { error: "path \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32" };
  for (const seg of segs) {
    if (seg === "..") return { error: "path \u4E0D\u5141\u8BB8\u5305\u542B .. \u8DEF\u5F84\u6BB5" };
    if (seg.startsWith(".")) return { error: `path \u4E0D\u5141\u8BB8\u6307\u5411\u9690\u85CF\u76EE\u5F55/\u6587\u4EF6\uFF1A${seg}` };
    if (ctx.skipDirs.has(seg)) return { error: `path \u4E0D\u5141\u8BB8\u843D\u5728\u5DE5\u7A0B/\u9690\u79C1\u76EE\u5F55\u5185\uFF1A${seg}` };
  }
  if (!rel.toLowerCase().endsWith(SUFFIX)) return { error: "path \u5FC5\u987B\u4EE5 .taskboard.json \u7ED3\u5C3E" };
  const abs = path2.resolve(vaultDir, rel);
  if (abs !== vaultDir && !abs.startsWith(vaultDir + path2.sep)) {
    return { error: "path \u8D8A\u51FA vault \u6839\u76EE\u5F55" };
  }
  return { abs };
}
function validateBoardData(data) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return "data \u5FC5\u987B\u662F\u5BF9\u8C61";
  for (const key of ["members", "statuses", "categories", "tasks"]) {
    const list = data[key];
    if (!Array.isArray(list)) return `data.${key} \u5FC5\u987B\u662F\u6570\u7EC4`;
  }
  return null;
}
async function handlePut(ctx, req, res) {
  try {
    const contentType = String(req.headers["content-type"] ?? "");
    if (!contentType.toLowerCase().includes("application/json")) {
      return sendJson(res, 400, { error: "Content-Type \u5FC5\u987B\u4E3A application/json" });
    }
    let raw;
    try {
      raw = await readBody(req);
    } catch (e) {
      const status = e.statusCode === 413 ? 413 : 400;
      return sendJson(res, status, { error: e?.message ?? "\u8BFB\u53D6\u8BF7\u6C42\u4F53\u5931\u8D25" });
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return sendJson(res, 400, { error: "body \u4E0D\u662F\u5408\u6CD5 JSON" });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return sendJson(res, 400, { error: "body \u5FC5\u987B\u662F JSON \u5BF9\u8C61" });
    }
    const { path: relPath, data } = body;
    const target = resolveBoardTarget(ctx, relPath);
    if ("error" in target) return sendJson(res, 400, { error: target.error });
    const dataError = validateBoardData(data);
    if (dataError) return sendJson(res, 400, { error: dataError });
    const content = JSON.stringify(data, null, 2) + "\n";
    fs.mkdirSync(path2.dirname(target.abs), { recursive: true });
    const tmp = target.abs + ".tmp";
    try {
      fs.writeFileSync(tmp, content);
      fs.renameSync(tmp, target.abs);
    } catch (e) {
      try {
        fs.unlinkSync(tmp);
      } catch {
      }
      throw e;
    }
    const mtime = fs.statSync(target.abs).mtimeMs;
    return sendJson(res, 200, { ok: true, mtime });
  } catch (e) {
    return sendJson(res, 500, { error: `\u5199\u5165\u5931\u8D25\uFF1A${e?.message ?? String(e)}` });
  }
}
function boardApiPlugin(options) {
  const ctx = boardApiContext(options);
  const route = (suffix) => (ctx.apiBase + suffix).replace(/\/{2,}/g, "/");
  return {
    name: "local-notes:board-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        try {
          if (url === route("/board/ping")) {
            if (req.method !== "GET") return sendJson(res, 405, { error: "\u4EC5\u652F\u6301 GET" });
            return sendJson(res, 200, { ok: true });
          }
          if (url === route("/board")) {
            if (req.method !== "PUT") return sendJson(res, 405, { error: "\u4EC5\u652F\u6301 PUT" });
            return void handlePut(ctx, req, res);
          }
        } catch (e) {
          return sendJson(res, 500, { error: `\u670D\u52A1\u5F02\u5E38\uFF1A${e?.message ?? String(e)}` });
        }
        return next();
      });
    }
  };
}

// src/plugins/mdApi.ts
import fs2 from "node:fs";
import path3 from "node:path";
var SUFFIX2 = ".md";
var MAX_BODY_BYTES2 = 32 * 1024 * 1024;
var MTIME_EPSILON = 1;
function sendJson2(res, status, payload) {
  if (res.writableEnded || res.destroyed) return;
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", String(Buffer.byteLength(body)));
  res.end(body);
}
function readBody2(req) {
  return new Promise((resolve2, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES2) {
        reject(Object.assign(new Error("body \u8D85\u8FC7\u5927\u5C0F\u4E0A\u9650"), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve2(Buffer.concat(chunks).toString("utf8")));
    req.on("error", (err) => reject(err));
  });
}
function mdApiContext(options) {
  const resolved = resolveLocalNotesOptions(options);
  return {
    vaultDir: path3.resolve(resolved.vaultDir),
    apiBase: resolved.apiBase,
    templateDir: resolved.templateDir?.replaceAll("\\", "/").replace(/\/+$/, "") || void 0,
    skipDirs: new Set(resolved.skipDirs)
  };
}
function resolveMdTarget(ctx, rawRel) {
  const vaultDir = ctx.vaultDir;
  if (typeof rawRel !== "string" || rawRel.trim() === "") return { error: "path \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32" };
  if (rawRel.includes("\0")) return { error: "path \u975E\u6CD5\uFF08\u542B\u7A7A\u5B57\u8282\uFF09" };
  let rel;
  try {
    rel = decodeURIComponent(rawRel);
  } catch {
    return { error: "path URL \u7F16\u7801\u975E\u6CD5" };
  }
  const segs = rel.split(/[\\/]+/).filter(Boolean);
  if (segs.length === 0) return { error: "path \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32" };
  for (const seg of segs) {
    if (seg === "..") return { error: "path \u4E0D\u5141\u8BB8\u5305\u542B .. \u8DEF\u5F84\u6BB5" };
    if (seg.startsWith(".")) return { error: `path \u4E0D\u5141\u8BB8\u6307\u5411\u9690\u85CF\u76EE\u5F55/\u6587\u4EF6\uFF1A${seg}` };
    if (ctx.skipDirs.has(seg)) return { error: `path \u4E0D\u5141\u8BB8\u843D\u5728\u5DE5\u7A0B/\u9690\u79C1\u76EE\u5F55\u5185\uFF1A${seg}` };
  }
  if (!rel.toLowerCase().endsWith(SUFFIX2)) return { error: "path \u5FC5\u987B\u4EE5 .md \u7ED3\u5C3E\uFF08\u4EC5\u652F\u6301\u7F16\u8F91 vault \u7B14\u8BB0\uFF09" };
  const abs = path3.resolve(vaultDir, rel);
  if (abs !== vaultDir && !abs.startsWith(vaultDir + path3.sep)) {
    return { error: "path \u8D8A\u51FA vault \u6839\u76EE\u5F55" };
  }
  return { abs };
}
function extractPathParam(rawUrl) {
  const qIndex = rawUrl.indexOf("?");
  if (qIndex < 0) return {};
  const query = Buffer.from(rawUrl.slice(qIndex + 1), "latin1").toString("utf8");
  for (const pair of query.split("&")) {
    const eq = pair.indexOf("=");
    const key = eq < 0 ? pair : pair.slice(0, eq);
    if (key !== "path") continue;
    const rawValue = eq < 0 ? "" : pair.slice(eq + 1);
    try {
      decodeURIComponent(rawValue);
    } catch {
      return { error: "path URL \u7F16\u7801\u975E\u6CD5" };
    }
    return { rawValue };
  }
  return {};
}
function statIfExists(abs) {
  try {
    const st = fs2.statSync(abs);
    return st.isFile() ? st : null;
  } catch {
    return null;
  }
}
function handleGet(ctx, res, rawUrl) {
  const { rawValue, error } = extractPathParam(rawUrl);
  if (error) return void sendJson2(res, 400, { error });
  const target = resolveMdTarget(ctx, rawValue);
  if ("error" in target) return void sendJson2(res, 400, { error: target.error });
  const stat = statIfExists(target.abs);
  if (!stat) return void sendJson2(res, 404, { error: "\u6587\u4EF6\u4E0D\u5B58\u5728" });
  const content = fs2.readFileSync(target.abs, "utf8");
  return void sendJson2(res, 200, { content, mtime: stat.mtimeMs });
}
async function handlePut2(ctx, req, res) {
  try {
    const contentType = String(req.headers["content-type"] ?? "");
    if (!contentType.toLowerCase().includes("application/json")) {
      return void sendJson2(res, 400, { error: "Content-Type \u5FC5\u987B\u4E3A application/json" });
    }
    let raw;
    try {
      raw = await readBody2(req);
    } catch (e) {
      const status = e.statusCode === 413 ? 413 : 400;
      return void sendJson2(res, status, { error: e?.message ?? "\u8BFB\u53D6\u8BF7\u6C42\u4F53\u5931\u8D25" });
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return void sendJson2(res, 400, { error: "body \u4E0D\u662F\u5408\u6CD5 JSON" });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return void sendJson2(res, 400, { error: "body \u5FC5\u987B\u662F JSON \u5BF9\u8C61" });
    }
    const { path: relPath, content, baseMtime } = body;
    const target = resolveMdTarget(ctx, relPath);
    if ("error" in target) return void sendJson2(res, 400, { error: target.error });
    if (typeof content !== "string") return void sendJson2(res, 400, { error: "content \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\uFF08\u5141\u8BB8\u7A7A\u4E32\uFF09" });
    const stat = statIfExists(target.abs);
    if (!stat) return void sendJson2(res, 404, { error: "\u6587\u4EF6\u4E0D\u5B58\u5728" });
    if (typeof baseMtime === "number" && Number.isFinite(baseMtime)) {
      if (Math.abs(stat.mtimeMs - baseMtime) > MTIME_EPSILON) {
        return void sendJson2(res, 409, { error: "\u6587\u4EF6\u5DF2\u88AB\u5916\u90E8\u4FEE\u6539", mtime: stat.mtimeMs });
      }
    }
    trackSelfWrite(target.abs);
    fs2.mkdirSync(path3.dirname(target.abs), { recursive: true });
    const tmp = target.abs + ".tmp";
    try {
      fs2.writeFileSync(tmp, content);
      fs2.renameSync(tmp, target.abs);
    } catch (e) {
      try {
        fs2.unlinkSync(tmp);
      } catch {
      }
      throw e;
    }
    const mtime = fs2.statSync(target.abs).mtimeMs;
    return void sendJson2(res, 200, { ok: true, mtime });
  } catch (e) {
    return void sendJson2(res, 500, { error: `\u5199\u5165\u5931\u8D25\uFF1A${e?.message ?? String(e)}` });
  }
}
function collectDirsAndTemplates(ctx) {
  const vaultDir = ctx.vaultDir;
  const dirs = [];
  const templates = [];
  const walk = (base) => {
    let entries;
    try {
      entries = fs2.readdirSync(base ? path3.join(vaultDir, base) : vaultDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (e.name.startsWith(".") || ctx.skipDirs.has(e.name)) continue;
        const rel = base ? `${base}/${e.name}` : e.name;
        dirs.push(rel);
        walk(rel);
      } else if (e.isFile() && base) {
        const rel = `${base}/${e.name}`;
        if (ctx.templateDir && rel.startsWith(ctx.templateDir + "/") && e.name.toLowerCase().endsWith(SUFFIX2)) {
          templates.push(rel);
        }
      }
    }
  };
  walk("");
  const coll = "zh-Hans-CN";
  dirs.sort((a, b) => a.localeCompare(b, coll));
  templates.sort((a, b) => a.localeCompare(b, coll));
  return { dirs, templates };
}
function handleGetDirs(ctx, res) {
  const { dirs, templates } = collectDirsAndTemplates(ctx);
  if (!ctx.templateDir) return void sendJson2(res, 200, { dirs });
  return void sendJson2(res, 200, { dirs, templates, templateDir: ctx.templateDir });
}
async function handlePost(ctx, req, res) {
  try {
    const contentType = String(req.headers["content-type"] ?? "");
    if (!contentType.toLowerCase().includes("application/json")) {
      return void sendJson2(res, 400, { error: "Content-Type \u5FC5\u987B\u4E3A application/json" });
    }
    let raw;
    try {
      raw = await readBody2(req);
    } catch (e) {
      const status = e.statusCode === 413 ? 413 : 400;
      return void sendJson2(res, status, { error: e?.message ?? "\u8BFB\u53D6\u8BF7\u6C42\u4F53\u5931\u8D25" });
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return void sendJson2(res, 400, { error: "body \u4E0D\u662F\u5408\u6CD5 JSON" });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return void sendJson2(res, 400, { error: "body \u5FC5\u987B\u662F JSON \u5BF9\u8C61" });
    }
    const { path: relPath, template } = body;
    const target = resolveMdTarget(ctx, relPath);
    if ("error" in target) return void sendJson2(res, 400, { error: target.error });
    if (template !== void 0 && template !== null && !ctx.templateDir) {
      return void sendJson2(res, 400, { error: "\u6A21\u677F\u529F\u80FD\u672A\u542F\u7528\uFF08\u672A\u914D\u7F6E templateDir\uFF09\uFF0C\u4E0D\u63A5\u53D7 template \u5B57\u6BB5" });
    }
    const root = ctx.vaultDir;
    const parentAbs = path3.dirname(target.abs);
    if (parentAbs !== root) {
      let parentOk = false;
      try {
        parentOk = fs2.statSync(parentAbs).isDirectory();
      } catch {
      }
      if (!parentOk) {
        return void sendJson2(res, 400, { error: "\u76EE\u5F55\u4E0D\u5B58\u5728\uFF0C\u8BF7\u4ECE\u5DF2\u6709\u76EE\u5F55\u4E2D\u9009\u62E9\uFF08\u6682\u4E0D\u652F\u6301\u65B0\u5EFA\u76EE\u5F55\uFF09" });
      }
    }
    if (statIfExists(target.abs)) return void sendJson2(res, 409, { error: "\u6587\u4EF6\u5DF2\u5B58\u5728" });
    let content = null;
    if (typeof template === "string" && template.trim() !== "" && ctx.templateDir) {
      const tpl = resolveMdTarget(ctx, template);
      if ("error" in tpl) return void sendJson2(res, 400, { error: `\u6A21\u677F\u8DEF\u5F84\u975E\u6CD5\uFF1A${tpl.error}` });
      const templateRoot = path3.join(root, ctx.templateDir);
      if (!tpl.abs.startsWith(templateRoot + path3.sep)) {
        return void sendJson2(res, 400, { error: `\u6A21\u677F\u5FC5\u987B\u662F ${ctx.templateDir}/ \u4E0B\u7684 .md \u6587\u4EF6` });
      }
      if (!statIfExists(tpl.abs)) return void sendJson2(res, 400, { error: "\u6A21\u677F\u4E0D\u5B58\u5728" });
      content = fs2.readFileSync(tpl.abs, "utf8");
    } else if (template !== void 0 && template !== null) {
      return void sendJson2(res, 400, { error: "template \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\uFF08\u53EF\u7701\u7565\uFF09" });
    }
    if (content === null) {
      const base = path3.basename(target.abs);
      content = `# ${base.slice(0, -SUFFIX2.length)}
`;
    }
    const tmp = target.abs + ".tmp";
    try {
      fs2.writeFileSync(tmp, content);
      fs2.renameSync(tmp, target.abs);
    } catch (e) {
      try {
        fs2.unlinkSync(tmp);
      } catch {
      }
      throw e;
    }
    const rel = path3.relative(root, target.abs).replaceAll(path3.sep, "/");
    return void sendJson2(res, 201, { ok: true, path: rel });
  } catch (e) {
    return void sendJson2(res, 500, { error: `\u65B0\u5EFA\u5931\u8D25\uFF1A${e?.message ?? String(e)}` });
  }
}
function mdApiPlugin(options) {
  const ctx = mdApiContext(options);
  const route = (suffix) => (ctx.apiBase + suffix).replace(/\/{2,}/g, "/");
  return {
    name: "local-notes:md-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        const pathname = url.split("?")[0];
        try {
          if (pathname === route("/md/ping")) {
            if (req.method !== "GET") return void sendJson2(res, 405, { error: "\u4EC5\u652F\u6301 GET" });
            return void sendJson2(res, 200, { ok: true });
          }
          if (pathname === route("/md/dirs")) {
            if (req.method !== "GET") return void sendJson2(res, 405, { error: "\u4EC5\u652F\u6301 GET" });
            return void handleGetDirs(ctx, res);
          }
          if (pathname === route("/md")) {
            if (req.method === "GET") return void handleGet(ctx, res, url);
            if (req.method === "PUT") return void handlePut2(ctx, req, res);
            if (req.method === "POST") return void handlePost(ctx, req, res);
            return void sendJson2(res, 405, { error: "\u4EC5\u652F\u6301 GET / PUT / POST" });
          }
        } catch (e) {
          return void sendJson2(res, 500, { error: `\u670D\u52A1\u5F02\u5E38\uFF1A${e?.message ?? String(e)}` });
        }
        return next();
      });
    }
  };
}

// src/plugins/mindmapApi.ts
import fs3 from "node:fs";
import path4 from "node:path";
var SUFFIX3 = ".mindmap.json";
var MAX_BODY_BYTES3 = 32 * 1024 * 1024;
function sendJson3(res, status, payload) {
  if (res.writableEnded || res.destroyed) return;
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", String(Buffer.byteLength(body)));
  res.end(body);
}
function readBody3(req) {
  return new Promise((resolve2, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES3) {
        reject(Object.assign(new Error("body \u8D85\u8FC7\u5927\u5C0F\u4E0A\u9650"), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve2(Buffer.concat(chunks).toString("utf8")));
    req.on("error", (err) => reject(err));
  });
}
function mindmapApiContext(options) {
  const resolved = resolveLocalNotesOptions(options);
  return {
    vaultDir: path4.resolve(resolved.vaultDir),
    apiBase: resolved.apiBase,
    skipDirs: new Set(resolved.skipDirs)
  };
}
function resolveMindmapTarget(ctx, rawRel) {
  const vaultDir = ctx.vaultDir;
  if (typeof rawRel !== "string" || rawRel.trim() === "") return { error: "path \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32" };
  if (rawRel.includes("\0")) return { error: "path \u975E\u6CD5\uFF08\u542B\u7A7A\u5B57\u8282\uFF09" };
  let rel;
  try {
    rel = decodeURIComponent(rawRel);
  } catch {
    return { error: "path URL \u7F16\u7801\u975E\u6CD5" };
  }
  const segs = rel.split(/[\\/]+/).filter(Boolean);
  if (segs.length === 0) return { error: "path \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32" };
  for (const seg of segs) {
    if (seg === "..") return { error: "path \u4E0D\u5141\u8BB8\u5305\u542B .. \u8DEF\u5F84\u6BB5" };
    if (seg.startsWith(".")) return { error: `path \u4E0D\u5141\u8BB8\u6307\u5411\u9690\u85CF\u76EE\u5F55/\u6587\u4EF6\uFF1A${seg}` };
    if (ctx.skipDirs.has(seg)) return { error: `path \u4E0D\u5141\u8BB8\u843D\u5728\u5DE5\u7A0B/\u9690\u79C1\u76EE\u5F55\u5185\uFF1A${seg}` };
  }
  if (!rel.toLowerCase().endsWith(SUFFIX3)) return { error: "path \u5FC5\u987B\u4EE5 .mindmap.json \u7ED3\u5C3E" };
  const abs = path4.resolve(vaultDir, rel);
  if (abs !== vaultDir && !abs.startsWith(vaultDir + path4.sep)) {
    return { error: "path \u8D8A\u51FA vault \u6839\u76EE\u5F55" };
  }
  return { abs };
}
function validateMindmapData(data) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return "data \u5FC5\u987B\u662F\u5BF9\u8C61";
  const root = data.root;
  if (typeof root !== "object" || root === null || Array.isArray(root)) return "data.root \u7F3A\u5931";
  if (root.data === void 0) return "data.root.data \u7F3A\u5931";
  return null;
}
async function handlePut3(ctx, req, res) {
  try {
    const contentType = String(req.headers["content-type"] ?? "");
    if (!contentType.toLowerCase().includes("application/json")) {
      return sendJson3(res, 400, { error: "Content-Type \u5FC5\u987B\u4E3A application/json" });
    }
    let raw;
    try {
      raw = await readBody3(req);
    } catch (e) {
      const status = e.statusCode === 413 ? 413 : 400;
      return sendJson3(res, status, { error: e?.message ?? "\u8BFB\u53D6\u8BF7\u6C42\u4F53\u5931\u8D25" });
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return sendJson3(res, 400, { error: "body \u4E0D\u662F\u5408\u6CD5 JSON" });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return sendJson3(res, 400, { error: "body \u5FC5\u987B\u662F JSON \u5BF9\u8C61" });
    }
    const { path: relPath, data } = body;
    const target = resolveMindmapTarget(ctx, relPath);
    if ("error" in target) return sendJson3(res, 400, { error: target.error });
    const dataError = validateMindmapData(data);
    if (dataError) return sendJson3(res, 400, { error: dataError });
    const content = JSON.stringify(data, null, 2) + "\n";
    fs3.mkdirSync(path4.dirname(target.abs), { recursive: true });
    const tmp = target.abs + ".tmp";
    try {
      fs3.writeFileSync(tmp, content);
      fs3.renameSync(tmp, target.abs);
    } catch (e) {
      try {
        fs3.unlinkSync(tmp);
      } catch {
      }
      throw e;
    }
    const mtime = fs3.statSync(target.abs).mtimeMs;
    return sendJson3(res, 200, { ok: true, mtime });
  } catch (e) {
    return sendJson3(res, 500, { error: `\u5199\u5165\u5931\u8D25\uFF1A${e?.message ?? String(e)}` });
  }
}
function mindmapApiPlugin(options) {
  const ctx = mindmapApiContext(options);
  const route = (suffix) => (ctx.apiBase + suffix).replace(/\/{2,}/g, "/");
  return {
    name: "local-notes:mindmap-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        try {
          if (url === route("/mindmap/ping")) {
            if (req.method !== "GET") return sendJson3(res, 405, { error: "\u4EC5\u652F\u6301 GET" });
            return sendJson3(res, 200, { ok: true });
          }
          if (url === route("/mindmap")) {
            if (req.method !== "PUT") return sendJson3(res, 405, { error: "\u4EC5\u652F\u6301 PUT" });
            return void handlePut3(ctx, req, res);
          }
        } catch (e) {
          return sendJson3(res, 500, { error: `\u670D\u52A1\u5F02\u5E38\uFF1A${e?.message ?? String(e)}` });
        }
        return next();
      });
    }
  };
}

// src/plugins/markdown.ts
import fs5 from "node:fs";
import path6 from "node:path";

// src/plugins/vaultAsset.ts
import fs4 from "node:fs";
import path5 from "node:path";
var MIME = {
  ".pdf": "application/pdf",
  ".epub": "application/epub+zip",
  ".mobi": "application/x-mobipocket-ebook",
  ".azw3": "application/vnd.amazon.ebook",
  ".djvu": "image/vnd.djvu",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // 研报 HTML（WorkBuddy 等工具产出的自包含交互报告）：与 .txt 同级的纯文本资源，
  // 供 HtmlView 组件 <iframe> 内嵌渲染（脚本可执行，ECharts 正常出图）
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8"
};
var SERVE_EXTS = new Set(Object.keys(MIME));
var MINDMAP_SUFFIX = ".mindmap.json";
var BOARDS_SUFFIX = ".taskboard.json";
var MINDMAP_MIME = "application/json; charset=utf-8";
var BOARDS_MIME = "application/json; charset=utf-8";
function isMindmapFile(name) {
  return name.toLowerCase().endsWith(MINDMAP_SUFFIX);
}
function isBoardFile(name) {
  return name.toLowerCase().endsWith(BOARDS_SUFFIX);
}
function normalizePrefix(raw) {
  let p = raw.trim();
  if (!p.startsWith("/")) p = `/${p}`;
  if (!p.endsWith("/")) p = `${p}/`;
  return p;
}
function mimeOf(filePath) {
  if (isMindmapFile(filePath)) return MINDMAP_MIME;
  if (isBoardFile(filePath)) return BOARDS_MIME;
  return MIME[path5.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}
function resolveVaultFile(vaultDirRaw, prefix, skipDirs, rawUrl) {
  const vaultDir = path5.resolve(vaultDirRaw);
  let pathname;
  try {
    pathname = decodeURIComponent(rawUrl.split("?")[0] ?? "");
  } catch {
    return null;
  }
  if (!pathname.startsWith(prefix)) return null;
  const rel = pathname.slice(prefix.length);
  if (!rel || rel.includes("\0")) return null;
  if (rel.split("/").some((seg) => skipDirs.has(seg))) return null;
  const abs = path5.resolve(vaultDir, rel);
  if (abs !== vaultDir && !abs.startsWith(vaultDir + path5.sep)) return null;
  if (!isMindmapFile(abs) && !isBoardFile(abs) && !SERVE_EXTS.has(path5.extname(abs).toLowerCase()))
    return null;
  return abs;
}
function sendFile(req, res, filePath) {
  const stat = fs4.statSync(filePath);
  const mime = mimeOf(filePath);
  const range = req.headers.range;
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (m && stat.size > 0) {
    let start;
    let end;
    if (m[1] === "") {
      start = Math.max(0, stat.size - Number(m[2] || 0));
      end = stat.size - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === "" ? stat.size - 1 : Math.min(Number(m[2]), stat.size - 1);
    }
    if (start >= stat.size || start > end) {
      res.statusCode = 416;
      res.setHeader("Content-Range", `bytes */${stat.size}`);
      res.end();
      return;
    }
    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    res.setHeader("Content-Length", String(end - start + 1));
    res.setHeader("Content-Type", mime);
    res.setHeader("Accept-Ranges", "bytes");
    fs4.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Length", String(stat.size));
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "no-cache");
  fs4.createReadStream(filePath).pipe(res);
}
function collectAssets(vaultDirRaw, skipDirs, exts = SERVE_EXTS, base = "", out = []) {
  const vaultDir = path5.resolve(vaultDirRaw);
  const skipped = skipDirs instanceof Set ? skipDirs : new Set(skipDirs);
  let entries;
  try {
    entries = fs4.readdirSync(base ? path5.join(vaultDir, base) : vaultDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (skipped.has(e.name) || e.name.startsWith(".")) continue;
      collectAssets(vaultDir, skipped, exts, rel, out);
    } else if (e.isFile() && (exts.has(path5.extname(e.name).toLowerCase()) || // 结构化数据后缀特判只属于完整服务白名单（默认参数）；显式传入自定义
    // 白名单的调用方（如侧栏只收 PDF/EPUB）不受影响
    exts === SERVE_EXTS && (isMindmapFile(e.name) || isBoardFile(e.name)))) {
      out.push(rel);
    }
  }
  return out;
}
function assetContext(options) {
  const resolved = resolveLocalNotesOptions(options);
  return {
    vaultDir: path5.resolve(resolved.vaultDir),
    prefix: normalizePrefix(resolved.assetPrefix),
    skipDirs: new Set(resolved.skipDirs)
  };
}
function vaultAssetPlugin(options) {
  const ctx = assetContext(options);
  return {
    name: "local-notes:vault-assets",
    apply: "serve",
    configureServer(server) {
      const tryServe = (rawUrl) => {
        const filePath = resolveVaultFile(ctx.vaultDir, ctx.prefix, ctx.skipDirs, rawUrl);
        if (!filePath || !fs4.existsSync(filePath) || !fs4.statSync(filePath).isFile()) return null;
        return filePath;
      };
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith(ctx.prefix) && !url.startsWith(`/${encodeURIComponent(ctx.prefix.replaceAll("/", ""))}/`))
          return next();
        let filePath = tryServe(url);
        if (!filePath) {
          const repaired = Buffer.from(url, "latin1").toString("utf8");
          if (repaired !== url) filePath = tryServe(repaired);
        }
        if (!filePath) return next();
        try {
          sendFile(req, res, filePath);
        } catch {
          res.statusCode = 500;
          res.end();
        }
      });
    }
    // apply: "serve" 下 closeBundle 不会执行；build 拷贝放在独立插件里
  };
}
function vaultAssetCopyPlugin(options) {
  const resolved = resolveLocalNotesOptions(options);
  const ctx = assetContext(resolved);
  const outDir = path5.resolve(resolved.outDir ?? "dist");
  return {
    name: "local-notes:vault-assets-copy",
    apply: "build",
    closeBundle() {
      const targetRoot = path5.join(outDir, ctx.prefix.replaceAll("/", ""));
      const assets = collectAssets(ctx.vaultDir, ctx.skipDirs);
      let copied = 0;
      for (const rel of assets) {
        const src = path5.join(ctx.vaultDir, rel);
        const dest = path5.join(targetRoot, rel);
        try {
          const st = fs4.statSync(src);
          const existing = fs4.existsSync(dest) ? fs4.statSync(dest) : null;
          if (existing && existing.size === st.size && existing.mtimeMs >= st.mtimeMs) continue;
          fs4.mkdirSync(path5.dirname(dest), { recursive: true });
          fs4.copyFileSync(src, dest);
          fs4.utimesSync(dest, st.atime, st.mtime);
          copied++;
        } catch {
        }
      }
      console.log(
        `[local-notes:vault-assets] ${assets.length} \u4E2A\u9644\u4EF6\u5DF2\u5C31\u7EEA\uFF0C\u672C\u6B21\u62F7\u8D1D ${copied} \u4E2A \u2192 ${path5.relative(process.cwd(), targetRoot) || targetRoot}/`
      );
    }
  };
}

// src/plugins/markdown.ts
function escapeAttr(v) {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function toVaultUrl(prefix, rel) {
  return prefix + rel.split("/").map(encodeURIComponent).join("/");
}
function viewerHtml(src, title, page) {
  const attrs = [`src="${escapeAttr(src)}"`];
  if (title) attrs.push(`title="${escapeAttr(title)}"`);
  if (page && Number.isFinite(page)) attrs.push(`:page="${page}"`);
  return `<PdfViewer ${attrs.join(" ")} />`;
}
function splitHref(href) {
  const [beforeHash = "", hash = ""] = href.split("#", 2);
  const [clean = "", query = ""] = beforeHash.split("?", 2);
  const m = /(?:^|&|;)page=(\d+)/.exec(hash.startsWith("page=") ? hash : `&${hash}`);
  return {
    clean,
    page: m ? Number(m[1]) : void 0,
    embedOff: /(?:^|&)embed=0(?:&|$)/.test(query) || /(?:^|&|;)embed=0/.test(hash)
  };
}
function isInternalFileHref(href) {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href);
}
function pdfEmbedPlugin(options) {
  const resolved = resolveLocalNotesOptions(options);
  const vaultDir = path6.resolve(resolved.vaultDir);
  let prefix = resolved.assetPrefix.trim();
  if (!prefix.startsWith("/")) prefix = `/${prefix}`;
  if (!prefix.endsWith("/")) prefix = `${prefix}/`;
  let nameIndex = null;
  const getIndex = () => {
    if (!nameIndex) {
      nameIndex = /* @__PURE__ */ new Map();
      for (const rel of collectAssets(vaultDir, new Set(resolved.skipDirs), /* @__PURE__ */ new Set([".pdf"]))) {
        const name = path6.basename(rel);
        const list = nameIndex.get(name);
        if (list) list.push(rel);
        else nameIndex.set(name, [rel]);
      }
    }
    return nameIndex;
  };
  const resolveTarget = (rawTarget, currentRelDir, mode) => {
    let target = rawTarget.trim();
    try {
      target = decodeURIComponent(target);
    } catch {
    }
    if (!/\.pdf$/i.test(target)) return null;
    const candidates = [];
    if (target.startsWith(prefix)) {
      candidates.push(target.slice(prefix.length));
    } else if (target.startsWith("/")) {
      candidates.push(target.slice(1));
    } else if (mode === "wikilink" && target.includes("/")) {
      candidates.push(path6.posix.normalize(target));
      candidates.push(path6.posix.normalize(path6.posix.join(currentRelDir, target)));
      candidates.push(...getIndex().get(path6.basename(target)) ?? []);
    } else if (target.includes("/")) {
      const joined = path6.posix.normalize(path6.posix.join(currentRelDir, target));
      candidates.push(joined.startsWith("..") ? path6.posix.normalize(target.replace(/^\.\.?\//, "")) : joined);
    } else {
      candidates.push(...getIndex().get(path6.basename(target)) ?? []);
    }
    for (const rel of candidates) {
      const abs = path6.resolve(vaultDir, rel);
      if (abs.startsWith(vaultDir + path6.sep) && fs5.existsSync(abs) && fs5.statSync(abs).isFile()) {
        return { rel, name: path6.basename(rel) };
      }
    }
    return null;
  };
  return (md) => {
    md.inline.ruler.before("link", "pdf_wikilink", (state, silent) => {
      const m = /^(!?)\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]/.exec(state.src.slice(state.pos));
      if (!m) return false;
      if (!/\.pdf$/i.test((m[2] ?? "").trim())) return false;
      const alias = m[3]?.trim();
      const currentRelDir = path6.posix.dirname(state.env?.relativePath ?? ".");
      const resolvedTarget = resolveTarget(m[2] ?? "", currentRelDir, "wikilink");
      if (!resolvedTarget) return false;
      if (silent) return true;
      const token = state.push("html_inline", "", 0);
      token.content = viewerHtml(toVaultUrl(prefix, resolvedTarget.rel), alias || resolvedTarget.name);
      state.pos += m[0].length;
      return true;
    });
    md.core.ruler.push("pdf_link_embed", (state) => {
      const currentRelDir = path6.posix.dirname(state.env?.relativePath ?? ".");
      for (const block of state.tokens) {
        if (block.type !== "inline" || !block.children) continue;
        const children = block.children;
        for (let i = children.length - 1; i >= 0; i--) {
          if (children[i]?.type !== "link_close") continue;
          let depth = 0;
          let openIdx = -1;
          for (let j = i - 1; j >= 0; j--) {
            if (children[j]?.type === "link_close") depth++;
            else if (children[j]?.type === "link_open") {
              if (depth === 0) {
                openIdx = j;
                break;
              }
              depth--;
            }
          }
          if (openIdx < 0) continue;
          const href = children[openIdx]?.attrGet("href");
          if (!href || !isInternalFileHref(href)) continue;
          const { clean, page, embedOff } = splitHref(href);
          if (embedOff) continue;
          const resolvedTarget = resolveTarget(clean, currentRelDir, "mdlink");
          if (!resolvedTarget) continue;
          const text = children.slice(openIdx + 1, i).filter((t) => t.type === "text" || t.type === "code_inline").map((t) => t.content.trim()).filter(Boolean).join(" ").trim();
          const token = new state.Token("html_inline", "", 0);
          token.content = viewerHtml(toVaultUrl(prefix, resolvedTarget.rel), text || resolvedTarget.name, page);
          children.splice(openIdx, i - openIdx + 1, token);
          i = openIdx;
        }
      }
    });
  };
}

// src/plugins/mermaidFence.ts
function mermaidFencePlugin() {
  return (md) => {
    const defaultFence = md.renderer.rules.fence ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      if (token.info.trim() === "mermaid") {
        const b64 = Buffer.from(token.content, "utf8").toString("base64");
        return `<MermaidFence code-b64="${b64}"></MermaidFence>
`;
      }
      return defaultFence(tokens, idx, options, env, self);
    };
  };
}

// src/plugins/vueHmrGuard.ts
function vueHmrGuardPlugin() {
  return {
    name: "local-notes:vue-hmr-guard",
    apply: "serve",
    configResolved(config) {
      for (const p of config.plugins) {
        const plugin = p;
        if (plugin?.name !== "vite:vue" || typeof plugin.handleHotUpdate !== "function") continue;
        const original = plugin.handleHotUpdate;
        plugin.handleHotUpdate = async function(ctx) {
          try {
            return await original.call(this, ctx);
          } catch (e) {
            config.logger.warn(
              `[local-notes:vue-hmr-guard] \u62E6\u622A\u4E00\u6B21 HMR \u7ADE\u6001\u5D29\u6E83\uFF08${e?.message ?? e}\uFF09 file=${ctx?.file ?? "?"}\uFF0C\u5982\u9875\u9762\u672A\u66F4\u65B0\u8BF7\u624B\u52A8\u5237\u65B0`
            );
            return [];
          }
        };
      }
    }
  };
}

// src/plugins/sidebar.ts
import path7 from "node:path";
var DOCS_EXTS = /* @__PURE__ */ new Set([".pdf", ".epub"]);
var ICON = { ".pdf": "\u{1F4C4}", ".epub": "\u{1F4DA}" };
function normalizePrefix2(raw) {
  let p = raw.trim();
  if (!p.startsWith("/")) p = `/${p}`;
  if (!p.endsWith("/")) p = `${p}/`;
  return p;
}
function normalizeViewerPath(raw) {
  let p = raw.trim();
  if (!p.startsWith("/")) p = `/${p}`;
  return p.replace(/\/+$/, "");
}
function buildFileIndex(vaultDir, skipDirs, assetLinkPrefix) {
  const map = /* @__PURE__ */ new Map();
  for (const rel of collectAssets(vaultDir, skipDirs, DOCS_EXTS)) {
    const dir = path7.posix.dirname(rel);
    const key = dir === "." ? "" : dir;
    const list = map.get(key) ?? [];
    let name = path7.basename(rel);
    try {
      name = decodeURIComponent(name);
    } catch {
    }
    const ext = path7.extname(rel).toLowerCase();
    const encodedRel = rel.split("/").map((seg) => encodeURIComponent(seg)).join("/");
    list.push({ text: `${ICON[ext] ?? "\u{1F4C4}"} ${name}`, link: `${assetLinkPrefix}${encodedRel}` });
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.text.localeCompare(b.text, "zh-Hans-CN", { numeric: true }));
  }
  return map;
}
function buildChildrenIndex(dirs) {
  const map = /* @__PURE__ */ new Map();
  for (const dir of dirs) {
    const parent = path7.posix.dirname(dir);
    if (dir === "" || parent === ".") continue;
    const list = map.get(parent) ?? [];
    list.push(dir);
    map.set(parent, list);
  }
  return map;
}
function collectLinks(node, out = []) {
  if (node.link) out.push(node.link);
  for (const child of node.items ?? []) collectLinks(child, out);
  return out;
}
function commonDirPrefix(links) {
  if (links.length === 0) return null;
  const dirs = links.map((l) => {
    const clean = l.replace(/^\//, "").split(/[?#]/)[0] ?? "";
    const cut = clean.lastIndexOf("/");
    return cut === -1 ? "" : clean.slice(0, cut);
  });
  let prefix = dirs[0].split("/").filter(Boolean);
  for (const dir of dirs.slice(1)) {
    const segs = dir.split("/").filter(Boolean);
    let i = 0;
    while (i < prefix.length && i < segs.length && prefix[i] === segs[i]) i++;
    prefix = prefix.slice(0, i);
    if (prefix.length === 0) return "";
  }
  return prefix.join("/");
}
function dirOf(node) {
  const links = collectLinks(node);
  return commonDirPrefix(links);
}
function mergeVaultAssetSidebar(sidebar, options) {
  const resolved = resolveLocalNotesOptions(options);
  const vault = path7.resolve(resolved.vaultDir);
  const skipDirs = new Set(resolved.skipDirs);
  const assetLinkPrefix = `${normalizeViewerPath(resolved.viewerPath)}#${normalizePrefix2(resolved.assetPrefix)}`;
  const filesByDir = buildFileIndex(vault, skipDirs, assetLinkPrefix);
  if (filesByDir.size === 0) return sidebar;
  const allDirs = new Set(filesByDir.keys());
  for (const dir of filesByDir.keys()) {
    let cur = path7.posix.dirname(dir);
    while (cur !== "." && cur !== "/") {
      allDirs.add(cur);
      const next = path7.posix.dirname(cur);
      if (next === cur) break;
      cur = next;
    }
  }
  const childrenByDir = buildChildrenIndex(allDirs);
  const synthNode = (dir) => ({
    text: dir.split("/").pop() ?? dir,
    collapsed: true,
    items: [...filesByDir.get(dir) ?? [], ...(childrenByDir.get(dir) ?? []).map(synthNode)]
  });
  const covered = /* @__PURE__ */ new Set();
  const walk = (items) => {
    for (const node of items) {
      const dir = dirOf(node);
      if (dir === null) continue;
      covered.add(dir);
      if (!node.items) continue;
      const existingDirs = /* @__PURE__ */ new Set();
      for (const child of node.items) {
        if (!child.items) continue;
        const childDir = dirOf(child);
        if (childDir !== null && childDir !== dir) existingDirs.add(childDir);
      }
      const files = filesByDir.get(dir);
      if (files?.length) node.items.push(...files);
      for (const sub of childrenByDir.get(dir) ?? []) {
        if (!existingDirs.has(sub)) node.items.push(synthNode(sub));
      }
      walk(node.items);
    }
  };
  walk(sidebar);
  for (const dir of allDirs) {
    if (dir === "" || dir.includes("/") || covered.has(dir)) continue;
    sidebar.push(synthNode(dir));
  }
  return sidebar;
}

// src/plugins/index.ts
function localNotesPlugins(options) {
  const plugins = [
    backlinksPlugin(options),
    vaultAssetPlugin(options)
  ];
  if (options.outDir) plugins.push(vaultAssetCopyPlugin(options));
  plugins.push(
    mindmapApiPlugin(options),
    boardApiPlugin(options),
    mdApiPlugin(options),
    vaultMdAutoRestart(options),
    vueHmrGuardPlugin()
  );
  return plugins;
}
function localNotesMarkdownItPlugins(options) {
  const plugins = [pdfEmbedPlugin(options)];
  if (resolveLocalNotesOptions(options).mermaid) plugins.push(mermaidFencePlugin());
  return plugins;
}

// src/config.ts
import { existsSync } from "node:fs";
import path8 from "node:path";
import { defineConfig } from "vitepress";
import { generateSidebar } from "vitepress-sidebar";
function withLocalNotes(site = {}, user = {}) {
  const root = process.cwd();
  const srcDir = site.srcDir ?? (site.vaultDir ? relativeDir(root, site.vaultDir) : "site");
  const vaultDir = path8.resolve(root, site.vaultDir ?? srcDir);
  const outDir = site.outDir ?? user.outDir ?? path8.resolve(root, ".vitepress/dist");
  const configPath = site.configPath ?? probeConfigPath(root);
  const pluginOptions = {
    vaultDir,
    templateDir: site.templateDir,
    assetPrefix: site.assetPrefix,
    apiBase: site.apiBase,
    extraSkipDirs: site.extraSkipDirs,
    homeFile: site.homeFile,
    viewerPath: site.viewerPath,
    excludedPages: site.excludedPages,
    outDir,
    configPath,
    mermaid: site.mermaid
  };
  const templateGlob = site.templateDir ? [`${site.templateDir}/**`] : [];
  const sidebar = site.sidebar === false ? user.themeConfig?.sidebar : buildSidebar(site.sidebar ?? {}, { pluginOptions, srcDir, templateGlob });
  return defineConfig({
    ...user,
    srcDir,
    ignoreDeadLinks: user.ignoreDeadLinks ?? true,
    srcExclude: dedupe([...templateGlob, ...user.srcExclude ?? []]),
    vite: {
      ...user.vite,
      plugins: [...localNotesPlugins(pluginOptions), ...user.vite?.plugins ?? []]
    },
    markdown: {
      ...user.markdown,
      config(md) {
        for (const p of localNotesMarkdownItPlugins(pluginOptions)) md.use(p);
        user.markdown?.config?.(md);
      }
    },
    themeConfig: { sidebar, ...user.themeConfig }
  });
}
function relativeDir(root, vaultDir) {
  const rel = path8.relative(root, path8.resolve(root, vaultDir));
  return rel && !rel.startsWith("..") ? rel.split(path8.sep).join("/") : path8.resolve(root, vaultDir);
}
function probeConfigPath(root) {
  for (const f of ["config.mts", "config.ts", "config.mjs", "config.js"]) {
    const p = path8.resolve(root, ".vitepress", f);
    if (existsSync(p)) return p;
  }
  return void 0;
}
function dedupe(xs) {
  return [...new Set(xs)];
}
function buildSidebar(opts, ctx) {
  const generated = generateSidebar({
    useTitleFromFrontmatter: true,
    useTitleFromFileHeading: true,
    useFolderTitleFromIndexFile: true,
    useFolderLinkFromIndexFile: true,
    capitalizeFirst: false,
    collapsed: true,
    ...opts,
    documentRootPath: opts.documentRootPath ?? ctx.srcDir,
    excludeByGlobPattern: dedupe([...ctx.templateGlob, ...opts.excludeByGlobPattern ?? []])
    // vitepress-sidebar 的 Sidebar 声明较松，运行时结构与 SidebarItem 兼容
  });
  return mergeVaultAssetSidebar(normalizeSidebarLinks(generated), ctx.pluginOptions);
}
function normalizeSidebarLinks(items) {
  for (const node of items) {
    if (node.link) node.link = node.link.replace(/\/index\.md$/, "/");
    if (node.items) normalizeSidebarLinks(node.items);
  }
  return items;
}
export {
  DEFAULT_API_BASE,
  DEFAULT_ASSET_PREFIX,
  DEFAULT_HOME_FILE,
  DEFAULT_SKIP_DIRS,
  DEFAULT_VIEWER_PATH,
  backlinksPlugin,
  boardApiPlugin,
  localNotesMarkdownItPlugins,
  localNotesPlugins,
  mdApiPlugin,
  mergeSkipDirs,
  mergeVaultAssetSidebar,
  mermaidFencePlugin,
  mindmapApiPlugin,
  pdfEmbedPlugin,
  resolveLocalNotesOptions,
  resolveLocalNotesThemeOptions,
  vaultAssetCopyPlugin,
  vaultAssetPlugin,
  vaultMdAutoRestart,
  vueHmrGuardPlugin,
  withLocalNotes
};
