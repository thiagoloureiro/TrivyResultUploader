const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const REQUEST_TIMEOUT_MS = 60_000;

function requireInput(name, value) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required input: ${name}`);
  }
  return String(value).trim();
}

function joinUrl(base, ...parts) {
  const trimmedBase = base.replace(/\/+$/, "");
  const trimmedParts = parts
    .map((part) => String(part).replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
  return `${trimmedBase}/${trimmedParts.join("/")}`;
}

function getArtifactName(reportJson) {
  return reportJson.ArtifactName
    || reportJson.Metadata?.RepoTags?.[0]
    || reportJson.Results?.[0]?.Target
    || "";
}

function postForm(targetUrl, headers, body) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(targetUrl);
    } catch {
      reject(new Error(`Invalid API URL: ${targetUrl}`));
      return;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      reject(new Error(`Unsupported API URL protocol: ${url.protocol}`));
      return;
    }

    const client = url.protocol === "http:" ? http : https;
    const req = client.request(url, {
      method: "POST",
      headers,
      timeout: REQUEST_TIMEOUT_MS
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode || 0,
          text: Buffer.concat(chunks).toString("utf8")
        });
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function parseResponseBody(text) {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function uploadTrivyReport() {
  try {
    console.log("🔍 Starting Trivy report upload...");

    const apiUrl = requireInput("apiUrl", process.env["INPUT_APIURL"]);
    const apiKey = requireInput("apiKey", process.env["INPUT_APIKEY"]);
    const application = requireInput("application", process.env["INPUT_APPLICATION"]);
    const tempDir = process.env["INPUT_TEMPDIR"] || "/home/vsts/work/_temp/trivy";

    console.log(`🔹 API URL: ${apiUrl}`);
    console.log(`🔹 Application: ${application}`);
    console.log(`🔹 Trivy results path: ${tempDir}`);

    if (!fs.existsSync(tempDir)) {
      throw new Error(`Trivy results path does not exist: ${tempDir}`);
    }

    const files = fs.readdirSync(tempDir);
    const trivyReportFiles = files
      .filter((file) => file.startsWith("trivy-results") && file.endsWith(".json"))
      .sort((a, b) => b.localeCompare(a));

    if (trivyReportFiles.length === 0) {
      throw new Error(`No trivy report files found in: ${tempDir}`);
    }

    console.log(`🔹 Found ${trivyReportFiles.length} Trivy report files`);

    let uploaded = 0;
    let failed = 0;

    for (const reportFile of trivyReportFiles) {
      const trivyFilePath = path.join(tempDir, reportFile);
      console.log(`\n🔹 Processing report file: ${reportFile}`);

      try {
        const reportData = fs.readFileSync(trivyFilePath, "utf8");

        let reportJson;
        try {
          reportJson = JSON.parse(reportData);
        } catch {
          throw new Error("Invalid JSON");
        }

        const artifactName = getArtifactName(reportJson);
        if (!artifactName) {
          throw new Error("No ArtifactName, RepoTags, or Target found in report");
        }

        const component = artifactName.includes("/")
          ? artifactName.split("/").pop()
          : artifactName;

        console.log(`🔹 Full ArtifactName: ${artifactName}`);
        console.log(`🔹 Component: ${component}`);

        const apiUrlWithApp = joinUrl(apiUrl, application, component);
        console.log(`🔹 API URL with application and component: ${apiUrlWithApp}`);
        console.log("📤 Sending request to API...");

        const boundary = `--------------------------${Date.now().toString(16)}`;
        const formData = [
          `--${boundary}`,
          `Content-Disposition: form-data; name="file"; filename="${reportFile}"`,
          "Content-Type: application/json",
          "",
          reportData,
          `--${boundary}--`,
          ""
        ].join("\r\n");

        const response = await postForm(apiUrlWithApp, {
          Accept: "text/plain",
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          Authorization: `Basic ${Buffer.from(apiKey).toString("base64")}`,
          "Content-Length": Buffer.byteLength(formData)
        }, formData);

        if (response.status < 200 || response.status >= 300) {
          throw new Error(`Upload failed with status ${response.status}${response.text ? `: ${response.text}` : ""}`);
        }

        console.log(`✅ Upload successful for ${reportFile}! Response:`, parseResponseBody(response.text));
        uploaded += 1;
      } catch (error) {
        failed += 1;
        console.error(`❌ ${reportFile}: ${error.message}`);
      }
    }

    console.log(`\n🔹 Upload summary: ${uploaded} succeeded, ${failed} failed, ${trivyReportFiles.length} total`);

    if (failed > 0) {
      throw new Error(`${failed} of ${trivyReportFiles.length} Trivy report(s) failed to upload`);
    }

    console.log("✅ All report files processed!");
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

uploadTrivyReport();
