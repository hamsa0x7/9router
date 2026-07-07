import https from "https";
import pkg from "../../../../package.json" with { type: "json" };

const GITHUB_REPO = "hamsa0x7/9router";

// Fetch latest version from GitHub releases
function fetchLatestVersion() {
  return new Promise((resolve) => {
    const req = https.get(
      {
        hostname: "api.github.com",
        path: `/repos/${GITHUB_REPO}/releases/latest`,
        headers: { "User-Agent": "9router" },
        timeout: 4000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const release = JSON.parse(data);
            const tag = release.tag_name;
            if (tag && tag.startsWith("v")) {
              resolve(tag.slice(1));
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

export async function GET() {
  const latestVersion = await fetchLatestVersion();
  const currentVersion = pkg.version;
  const hasUpdate = latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false;

  return Response.json({ currentVersion, latestVersion, hasUpdate });
}
