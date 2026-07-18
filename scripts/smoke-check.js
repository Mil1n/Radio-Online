const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const serviceWorker = fs.readFileSync("service-worker.js", "utf8");
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

const ids = [...app.matchAll(/document\.getElementById\("([^"]+)"\)/g)].map((match) => match[1]);
const missingIds = [...new Set(ids)].filter((id) => !html.includes(`id="${id}"`));
if (missingIds.length) {
  throw new Error(`Missing DOM ids referenced from app.js: ${missingIds.join(", ")}`);
}

const shellFiles = [...serviceWorker.matchAll(/"\.\/([^"]+)"/g)].map((match) => match[1]).filter((file) => file && file !== "");
const missingShellFiles = [...new Set(shellFiles)].filter((file) => !fs.existsSync(file));
if (missingShellFiles.length) {
  throw new Error(`Missing service worker shell files: ${missingShellFiles.join(", ")}`);
}

if (!manifest.name || !manifest.start_url || !Array.isArray(manifest.icons)) {
  throw new Error("manifest.json is missing required app metadata");
}

new vm.Script(app, { filename: "app.js" });
new vm.Script(serviceWorker, { filename: "service-worker.js" });
console.log("Smoke checks passed");
