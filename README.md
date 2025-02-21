# Trivy Report Uploader Extension

This Azure DevOps extension allows you to upload Trivy vulnerability scan reports to your specified API endpoint. It processes all Trivy JSON report files in the pipeline's temporary directory and uploads them individually.

## Prerequisites

- Azure DevOps pipeline
- Trivy scan results in JSON format
- API endpoint configured to receive the reports

## Installation

1. Install this extension from the Azure DevOps marketplace
2. Add the task to your pipeline YAML configuration

## Usage

### YAML Pipeline Configuration


### Input Parameters

| Parameter | Description | Required |
|-----------|-------------|----------|
| `apiUrl` | The base URL of your API endpoint | Yes |
| `apiKey` | API key for authentication (sent as Basic auth) | Yes |
| `application` | Application name/identifier | Yes |

### How It Works

1. The task looks for files in the `/home/vsts/work/_temp/` directory that:
   - Start with 'trivy-results'
   - End with '.json'

2. For each matching file found, the task:
   - Reads the JSON report
   - Uploads it to `{apiUrl}/{application}` using multipart/form-data
   - Uses Basic authentication with the provided API key
   - Continues processing remaining files even if one upload fails

### Authentication

The task uses Basic Authentication. Your API key is encoded in base64 and sent in the Authorization header.

### API Requirements

The API endpoint should:
- Accept POST requests
- Handle multipart/form-data content type
- Accept JSON files
- Use Basic authentication

### Logging

The task provides detailed logging:
- 🔍 Start of execution
- 🔹 Configuration details
- 📤 Upload progress
- ✅ Successful uploads
- ❌ Error messages

### Error Handling

- The task will continue processing files even if individual uploads fail
- Exits with status code 1 if critical errors occur (no files found, invalid configuration)
- Provides detailed error messages in the pipeline logs

## Example Response

A successful upload will log the API response in the pipeline output:

## Troubleshooting

Common issues and solutions:

1. **No files found**: Ensure Trivy scan is generating reports with the correct naming pattern
2. **Authentication failures**: Verify your API key is correct
3. **API errors**: Check the API endpoint URL and application name

## Support

For issues and feature requests, please create an issue in the repository.

## License

[Add your license information here]