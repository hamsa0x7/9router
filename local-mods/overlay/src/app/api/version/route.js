import https from "https";
import pkg from "../../../../package.json" with { type: "json" };

const UPDATE_REPO = "hamsa0x7/9router";
const UPDATE_API_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;

function normalizeVersion(version) {
  return String(version || "").trim().replace(/^v/i, "").split(/[+-]/)[0];
}

function compareVersions(a, b) {
  const pa = normalizeVersion(a).split(".").map((part) => parseInt(part, 10) || 0);
  const pb = normalizeVersion(b).split(".").map((part) => parseInt(part, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

function fetchLatestRelease() {
  return new Promise((resolve) => {
    const req = https.get(UPDATE_API_URL, {
      timeout: 5000,
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `9router/${pkg.version}`,
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

export async function GET() {
  const currentVersion = pkg.version;
  const release = await fetchLatestRelease();
  const latestVersion = normalizeVersion(release?.tag_name || release?.name);
  const hasUpdate = latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false;
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const packageAsset = assets.find((asset) => /\.tgz$/i.test(asset.name || "") && /9router/i.test(asset.name || ""))
    || assets.find((asset) => /\.tgz$/i.test(asset.name || ""));

  return Response.json({
    currentVersion,
    latestVersion: latestVersion || null,
    hasUpdate,
    updateRepo: UPDATE_REPO,
    canAutoInstall: !!packageAsset?.browser_download_url,
  });
}
