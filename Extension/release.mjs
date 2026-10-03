#!/usr/bin/env node
/*
 * 打包发布产物到仓库根目录的 release/
 *
 *   release/key.pem                        ← 签名私钥（首次自动生成）
 *   release/Discord-Token-Login-<版本>.crx
 *   release/Discord-Token-Login-<版本>.zip
 *
 * 用法：cd Extension && npm run release
 *
 * 注意：release/ 和 *.pem 都在 .gitignore 里，不会被提交。
 *       key.pem 请自己另外备份一份 —— 丢了它，扩展 ID 就会变，
 *       已经装了的人保存的账号会全部读不出来。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, cpSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(here, "build");
const releaseDir = path.join(here, "..", "release");
const version = JSON.parse(readFileSync(path.join(here, "package.json"), "utf8")).version;
const baseName = `Discord-Token-Login-${version}`;
const keyPath = path.join(releaseDir, "key.pem");
const crxPath = path.join(releaseDir, `${baseName}.crx`);
const zipPath = path.join(releaseDir, `${baseName}.zip`);
const stageDir = path.join(releaseDir, "_stage");

function findChrome() {
	if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
	const candidates = [
		"C:/Program Files/Google/Chrome/Application/chrome.exe",
		"C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
		process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
	].filter(Boolean);
	for (const c of candidates) if (existsSync(c)) return c;
	throw new Error("找不到 Chrome，请设置环境变量 CHROME_PATH 指向 chrome.exe");
}

if (!existsSync(buildDir)) {
	console.error("✗ 没有 build/ 目录 —— 先跑一次 npm run build:chromium");
	process.exit(1);
}

mkdirSync(releaseDir, { recursive: true });
const chrome = findChrome();
const slashed = (p) => p.replace(/\\/g, "/");

/* ---------- 1. CRX ---------- */
console.log(`→ 打包 CRX（版本 ${version}）…`);
const chromeArgs = [`--pack-extension=${slashed(buildDir)}`, "--no-message-box"];
if (existsSync(keyPath)) chromeArgs.push(`--pack-extension-key=${slashed(keyPath)}`);
execFileSync(chrome, chromeArgs, { stdio: "ignore" });

const rawCrx = `${buildDir}.crx`;
const rawKey = `${buildDir}.pem`;
if (!existsSync(keyPath) && existsSync(rawKey)) {
	renameSync(rawKey, keyPath);
	console.log("");
	console.log("  ⚠  首次运行，已生成签名私钥 → release/key.pem");
	console.log("  ⚠  立刻把它备份到安全的地方！");
	console.log("  ⚠  丢了它 = 扩展 ID 会变 = 用户存的账号全部读不出来");
	console.log("");
}
if (!existsSync(rawCrx)) throw new Error("Chrome 没有产出 .crx，检查 --pack-extension 是否被拦截");
rmSync(crxPath, { force: true });
renameSync(rawCrx, crxPath);
console.log(`  ✓ ${path.basename(crxPath)}`);

/* ---------- 2. ZIP ---------- */
console.log("→ 打包 ZIP…");
rmSync(stageDir, { recursive: true, force: true });
cpSync(buildDir, path.join(stageDir, baseName), { recursive: true });
rmSync(zipPath, { force: true });
execFileSync(
	"powershell",
	[
		"-NoProfile",
		"-Command",
		`Compress-Archive -Path '${path.join(stageDir, baseName)}' -DestinationPath '${zipPath}' -Force`,
	],
	{ stdio: "ignore" },
);
rmSync(stageDir, { recursive: true, force: true });
if (!existsSync(zipPath)) throw new Error("Compress-Archive 没有产出 .zip");
console.log(`  ✓ ${path.basename(zipPath)}`);

console.log("");
console.log("完成。把下面两个文件传到 GitHub Release 的 Assets 里：");
console.log(`  ${crxPath}`);
console.log(`  ${zipPath}`);
