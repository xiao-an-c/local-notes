/**
 * demo dev API 全功能自测（一次性脚本，跑完自清理，不留测试文件）。
 * 覆盖：md GET/PUT 保存、409 冲突、POST 新建（含模板/重复 409）、
 * mindmap PUT 原子写、附件静态服务、目录穿越防护。
 *
 * 用法：先 `pnpm dev` 起 demo 站点，再 `node api-selftest.mjs [baseUrl]`；
 * baseUrl 缺省 http://localhost:5173（VitePress dev 默认端口）。
 */
const BASE = (process.argv[2] ?? "http://localhost:5173").replace(/\/+$/, "") + "/api";
const results = [];
const ok = (name, cond, detail = "") =>
  results.push(`${cond ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);

const j = (r) => r.json();
const api = (path, opts) => fetch(BASE + path, opts);

// 1. md GET
const getRes = await api("/md?path=journal%2F2026-09-11.md");
const getData = await j(getRes);
ok("GET md 200", getRes.status === 200 && getData.content.includes("2026-09-11"), `status=${getRes.status}`);

// 2. PUT 保存（带正确 baseMtime）
const newContent = getData.content + "\n- api-selftest line (will be removed)\n";
const putRes = await api("/md", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ path: "journal/2026-09-11.md", content: newContent, baseMtime: getData.mtime }),
});
const putData = await j(putRes);
ok("PUT md 保存 200", putRes.status === 200 && putData.ok === true, `status=${putRes.status} mtime=${putData.mtime}`);
const reread = await j(await api("/md?path=journal%2F2026-09-11.md"));
ok("PUT 后文件确实落盘", reread.content.includes("api-selftest line"));

// 3. 409 冲突（用旧 baseMtime 再写）
const conflictRes = await api("/md", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ path: "journal/2026-09-11.md", content: "OVERWRITE!", baseMtime: getData.mtime }),
});
ok("PUT 过期 baseMtime → 409", conflictRes.status === 409, `status=${conflictRes.status}`);
const afterConflict = await j(await api("/md?path=journal%2F2026-09-11.md"));
ok("409 不落盘（文件未被 OVERWRITE）", afterConflict.content.includes("api-selftest line") && !afterConflict.content.includes("OVERWRITE!"));

// 4. 还原 journal 文件
const restoreRes = await api("/md", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ path: "journal/2026-09-11.md", content: getData.content, baseMtime: afterConflict.mtime }),
});
ok("还原 journal 笔记 200", restoreRes.status === 200);

// 5. POST 新建（无模板）
const postRes = await api("/md", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ path: "journal/api-selftest-empty.md" }),
});
ok("POST 新建 201", postRes.status === 201, `status=${postRes.status}`);
const emptyCreated = await j(await api("/md?path=journal%2Fapi-selftest-empty.md"));
ok("无模板新建内容为一级标题", emptyCreated.content === "# api-selftest-empty\n", JSON.stringify(emptyCreated.content));

// 6. POST 重复 → 409
const dupRes = await api("/md", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ path: "journal/api-selftest-empty.md" }),
});
ok("POST 重复 → 409", dupRes.status === 409, `status=${dupRes.status}`);

// 7. POST 套模板
const tplRes = await api("/md", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ path: "journal/api-selftest-tpl.md", template: "templates/meeting-note.md" }),
});
ok("POST 模板新建 201", tplRes.status === 201, `status=${tplRes.status}`);
const tplCreated = await j(await api("/md?path=journal%2Fapi-selftest-tpl.md"));
ok("模板内容逐字复制", tplCreated.content.includes("# 会议记录") && tplCreated.content.includes("templates/meeting-note.md"));

// 清理测试文件
const fs = await import("node:fs");
for (const f of ["api-selftest-empty.md", "api-selftest-tpl.md"]) {
  fs.unlinkSync(new URL(`./journal/${f}`, `file://${process.cwd()}/`));
}
ok("测试文件已清理", !fs.existsSync(new URL("./journal/api-selftest-empty.md", `file://${process.cwd()}/`)) && !fs.existsSync(new URL("./journal/api-selftest-tpl.md", `file://${process.cwd()}/`)));

// 8. mindmap PUT（回写原内容，验证写路径）
const mindmapPath = "assets/demo-mindmap.mindmap.json";
const origMindmap = fs.readFileSync(new URL(`./${mindmapPath}`, `file://${process.cwd()}/`), "utf8");
const mmRes = await api("/mindmap", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ path: mindmapPath, data: JSON.parse(origMindmap) }),
});
ok("mindmap PUT 200", mmRes.status === 200, `status=${mmRes.status}`);
const mmNow = fs.readFileSync(new URL(`./${mindmapPath}`, `file://${process.cwd()}/`), "utf8");
ok("mindmap 落盘内容等价", JSON.stringify(JSON.parse(mmNow)) === JSON.stringify(JSON.parse(origMindmap)));

// 9. 附件静态服务 + 穿越防护
const ORIGIN = BASE.replace(/\/api$/, "");
const pdfRes = await fetch(`${ORIGIN}/vault/assets/sample.pdf`);
ok("附件 /vault/ PDF 200 + content-type", pdfRes.status === 200 && pdfRes.headers.get("content-type") === "application/pdf", `status=${pdfRes.status} ct=${pdfRes.headers.get("content-type")}`);
const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
ok("PDF 字节完整", pdfBytes.length === 1223 && pdfBytes.subarray(0, 5).toString() === "%PDF-", `len=${pdfBytes.length}`);
// 注意：fetch/undici 会把 %2e%2e 归一化掉，必须用 node:http 发原始请求行，
// 才能真正打到 vaultAsset 中间件的穿越防护逻辑
const travRes = await new Promise((resolve, reject) => {
  import("node:http").then(({ get }) => {
    const req = get({ host: "localhost", port: new URL(ORIGIN).port || 80, path: "/vault/%2e%2e/%2e%2e/package.json" }, resolve);
    req.on("error", reject);
  });
});
const travBody = await new Promise((resolve, reject) => {
  let buf = "";
  travRes.setEncoding("utf8");
  travRes.on("data", (c) => (buf += c));
  travRes.on("end", () => resolve(buf));
  travRes.on("error", reject);
});
ok(
  "路径穿越被拒（未返回目标文件，仅 SPA fallback HTML）",
  travRes.headers["content-type"] !== "application/json" && !travBody.includes('"name"') && travBody.trimStart().startsWith("<"),
  `status=${travRes.statusCode} ct=${travRes.headers["content-type"]}`,
);
const travApi = await api("/md?path=..%2F..%2Fpackage%2Ejson");
ok("API 穿越/后缀校验被拒", travApi.status === 400, `status=${travApi.status}`);
const hidden = await api("/md?path=.vitepress%2Fconfig.mts");
ok("隐藏目录/非 md 拒绝", hidden.status === 400, `status=${hidden.status}`);

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("❌")).length;
console.log(failed === 0 ? `\n全部通过（${results.length} 项）` : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
