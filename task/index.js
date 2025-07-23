const fs = require("fs");
const path = require("path");
const https = require("https");

async function uploadTrivyReport() {
  try {
    console.log("🔍 Starting Trivy report upload...");
    const apiUrl = process.env["INPUT_APIURL"];
    console.log(`🔹 API URL: ${apiUrl}`);
    const apiKey = process.env["INPUT_APIKEY"];
    console.log(`🔹 API Key: ${apiKey}`);

    const application = process.env["INPUT_APPLICATION"];
    console.log(`🔹 Application: ${application}`);

    const tempDir = process.env["INPUT_TEMPDIR"] || "/home/vsts/work/_temp/trivy";
    const files = fs.readdirSync(tempDir);
    const trivyReportFiles = files.filter(file => file.startsWith('trivy-results') && file.endsWith('.json'));

    if (trivyReportFiles.length === 0) {
      throw new Error(`❌ No trivy report files found in: ${tempDir}`);
    }

    console.log(`🔹 Found ${trivyReportFiles.length} Trivy report files`);

    // Sort files to process them in a consistent order
    const sortedReportFiles = trivyReportFiles.sort((a, b) => b.localeCompare(a));

    // Process each file
    for (const reportFile of sortedReportFiles) {
      const trivyFilePath = path.join(tempDir, reportFile);
      console.log(`\n🔹 Processing report file: ${reportFile}`);

      if (!fs.existsSync(trivyFilePath)) {
        console.warn(`⚠️ File not found, skipping: ${trivyFilePath}`);
        continue;
      }

      const reportData = fs.readFileSync(trivyFilePath, "utf8");
      
      // Parse the JSON report
      let reportJson;
      try {
        reportJson = JSON.parse(reportData);
      } catch (error) {
        console.warn(`⚠️ Failed to parse JSON from ${reportFile}, skipping...`);
        continue;
      }
      
      // Extract the ArtifactName
      if (!reportJson.ArtifactName) {
        console.warn(`⚠️ No ArtifactName found in report ${reportFile}, skipping...`);
        continue;
      }
      
      // Get the component part (after the slash if it exists)
      const artifactName = reportJson.ArtifactName;
      const component = artifactName.includes('/') ? artifactName.split('/').pop() : artifactName;
      
      console.log(`🔹 Full ArtifactName: ${artifactName}`);
      console.log(`🔹 Component: ${component}`);

      const apiUrlWithApp = `${apiUrl}/${application}/${component}`;
      console.log(`🔹 API URL with application and component: ${apiUrlWithApp}`);

      console.log("📤 Sending request to API...");

      const boundary = '--------------------------' + Date.now().toString(16);

      const formData = [
        '--' + boundary,
        `Content-Disposition: form-data; name="file"; filename="${reportFile}"`,
        'Content-Type: application/json',
        '',
        reportData,
        '--' + boundary + '--',
        ''
      ].join('\r\n');

      const response = await new Promise((resolve, reject) => {
        const req = https.request(apiUrlWithApp, {
          method: "POST",
          headers: {
            'Accept': 'text/plain',
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Authorization': `Basic ${Buffer.from(apiKey).toString("base64")}`,
            'Content-Length': Buffer.byteLength(formData)
          }
        }, (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              json: () => Promise.resolve(data ? JSON.parse(data) : {})
            });
          });
        });

        req.on('error', (error) => {
          reject(error);
        });

        req.write(formData);
        req.end();
      });

      if (!response.ok) {
        console.error(`❌ Upload failed for ${reportFile} with status: ${response.status}`);
        continue;
      }

      const responseBody = await response.json();
      console.log(`✅ Upload successful for ${reportFile}! Response:`, responseBody);
    }

    console.log("\n✅ All report files processed!");
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

uploadTrivyReport();
