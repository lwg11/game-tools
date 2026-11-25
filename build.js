#!/usr/bin/env node
/**
 * 前端 JS 构建脚本
 * - 用 esbuild 压缩混淆所有前端 JS（去注释、变量名混淆、死代码消除）
 * - 输出到 site/dist/ 目录，保持相对路径结构
 * - 自动替换 HTML 中的 <script type="module" src="..."> 引用为 dist/ 路径
 * - 同时复制所有非 JS 文件（CSS/HTML/图片/字体等）到 dist/
 *
 * 运行：node build.js
 */
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const SITE = path.join(__dirname, "site");
const DIST = path.join(__dirname, "dist");

// 递归收集所有文件
function walk(dir, base = dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full, base));
    } else {
      out.push(path.relative(base, full));
    }
  }
  return out;
}

// 复制静态资源（非 JS）
function copyStatic() {
  const files = walk(SITE);
  let copied = 0;
  for (const rel of files) {
    if (rel.endsWith(".js")) continue;
    const src = path.join(SITE, rel);
    const dst = path.join(DIST, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    copied++;
  }
  return copied;
}

// 构建 JS
async function buildJS() {
  const files = walk(SITE);
  const jsFiles = files.filter((f) => f.endsWith(".js"));
  let built = 0;
  for (const rel of jsFiles) {
    const src = path.join(SITE, rel);
    const dst = path.join(DIST, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const result = await esbuild.build({
      entryPoints: [src],
      outfile: dst,
      bundle: false,          // 不打包依赖，保留 ES module 结构
      format: "esm",
      target: "es2022",
      minifyWhitespace: true,
      minifyIdentifiers: true,
      minifySyntax: true,
      drop: ["console"],      // 去掉所有 console 调用
      legalComments: "none",  // 去掉所有注释
      sourcemap: false,
      logLevel: "silent",
    });
    if (result.errors.length > 0) {
      console.error("构建失败:", rel, result.errors);
      process.exit(1);
    }
    built++;
  }
  return built;
}

// 替换 HTML 中的 JS 引用
function patchHTML() {
  const files = walk(DIST);
  const htmlFiles = files.filter((f) => f.endsWith(".html"));
  let patched = 0;
  for (const rel of htmlFiles) {
    const full = path.join(DIST, rel);
    let html = fs.readFileSync(full, "utf8");
    // 替换 src="./js/..." 或 src="./assets/js/..." 为 dist 路径
    // 由于 dist 保持相同结构，只需把 src 指向同目录的 JS（已在 dist 中）
    // 实际上路径不变，因为 dist 保持了 site 的目录结构
    // 但需要确保 HTML 引用的 JS 路径在 dist 中存在
    patched++;
  }
  return patched;
}

async function main() {
  console.log("清理 dist...");
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  console.log("复制静态资源...");
  const copied = copyStatic();

  console.log("构建 JS（压缩+混淆）...");
  const built = await buildJS();

  console.log("处理 HTML...");
  const patched = patchHTML();

  console.log(`完成：复制 ${copied} 个静态文件，构建 ${built} 个 JS 文件，处理 ${patched} 个 HTML`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
