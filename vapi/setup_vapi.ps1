$ErrorActionPreference = 'Stop'

function Save-Ids {
    param([string]$Path, [object]$Ids)

    $json = ConvertTo-Json -InputObject $Ids -Depth 20
    [System.IO.File]::WriteAllText($Path, $json, (New-Object System.Text.UTF8Encoding($false)))
}

function Invoke-VapiRequest {
    param(
        [string]$Method,
        [string]$Uri,
        [object]$Payload,
        [string]$ApiKey
    )

    $json = ConvertTo-Json -InputObject $Payload -Depth 20 -Compress
    $body = [System.Text.Encoding]::UTF8.GetBytes($json)
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Method $Method -Uri $Uri `
            -Headers @{ Authorization = "Bearer $ApiKey" } `
            -ContentType 'application/json; charset=utf-8' -Body $body
        return ($response.Content | ConvertFrom-Json)
    }
    catch {
        $httpResponse = $_.Exception.Response
        if ($null -ne $httpResponse) {
            $stream = $httpResponse.GetResponseStream()
            if ($null -ne $stream) {
                $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
                try {
                    $responseText = $reader.ReadToEnd()
                }
                finally {
                    $reader.Dispose()
                }
                if ($responseText) {
                    Write-Host $responseText
                }
            }
        }
        throw 'Vapi request failed. See the response body above.'
    }
}

function Write-IdsFile {
    param([string]$Path, [object]$Ids)

    Save-Ids -Path $Path -Ids $Ids
}

$secureApiKey = Read-Host 'Vapi PRIVATE API key' -AsSecureString
$apiKeyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureApiKey)
try {
    $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($apiKeyPointer)
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($apiKeyPointer)
}

$tunnelBase = (Read-Host 'Tunnel base URL (https://...trycloudflare.com)').Trim().TrimEnd('/')
$tunnelUri = $null
if (-not [Uri]::TryCreate($tunnelBase, [UriKind]::Absolute, [ref]$tunnelUri) -or
    $tunnelUri.Scheme -ne 'https' -or $tunnelUri.Host -notlike '*.trycloudflare.com') {
    throw 'Enter an HTTPS trycloudflare.com tunnel base URL.'
}
$businessName = (Read-Host 'Business name').Trim()
if (-not $businessName) {
    throw 'Business name is required.'
}
$spokenBusinessName = ($businessName -replace '\s*&\s*', ' en ').Trim()
$transferPhoneNumber = (Read-Host 'Owner transfer phone number in E.164 format (for example +923496113706)').Trim()
if ($transferPhoneNumber -notmatch '^\+[1-9]\d{7,14}$') {
    throw 'Enter the owner transfer phone number in E.164 format, including + and the country code.'
}

$secretPath = Join-Path $HOME 'vapi_secret.txt'
if (-not (Test-Path -LiteralPath $secretPath -PathType Leaf)) {
    throw 'The local webhook-secret file $HOME\vapi_secret.txt was not found.'
}
$webhookSecret = [System.IO.File]::ReadAllText($secretPath).Trim()
if (-not $webhookSecret) {
    throw 'The local webhook-secret file is empty.'
}

$toolsPath = Join-Path $PSScriptRoot 'tools.json'
$assistantPath = Join-Path $PSScriptRoot 'assistant.json'
$promptPath = Join-Path $PSScriptRoot 'system_prompt_nl.md'
$idsPath = Join-Path $PSScriptRoot 'ids.json'
$toolDefinitions = Get-Content -LiteralPath $toolsPath -Raw | ConvertFrom-Json
$assistant = Get-Content -LiteralPath $assistantPath -Raw | ConvertFrom-Json
$systemPrompt = [System.IO.File]::ReadAllText($promptPath, [System.Text.Encoding]::UTF8).Replace('{{BUSINESS_NAME}}', $spokenBusinessName)

$idsFileExists = Test-Path -LiteralPath $idsPath -PathType Leaf
$ids = [ordered]@{ tools = [ordered]@{}; assistant = $null }
if ($idsFileExists) {
    $savedIds = Get-Content -LiteralPath $idsPath -Raw | ConvertFrom-Json
    if ($null -eq $savedIds.tools) {
        throw 'vapi/ids.json exists but does not contain tool IDs.'
    }
    foreach ($property in $savedIds.tools.PSObject.Properties) {
        $ids.tools[$property.Name] = [string]$property.Value
    }
    $ids.assistant = $savedIds.assistant
}

foreach ($definition in $toolDefinitions) {
    if ($definition.type -eq 'transferCall') {
        $toolName = 'transfer_to_owner'
        foreach ($destination in $definition.destinations) {
            $destination.number = $transferPhoneNumber
        }
    }
    else {
        $toolName = $definition.function.name
        $definition.server.url = $definition.server.url.Replace('{{N8N_BASE}}', $tunnelBase)
        $definition.server.headers.'x-vapi-secret' = $webhookSecret
    }
    if ($ids.tools.Contains($toolName)) {
        $method = 'PATCH'
        $uri = "https://api.vapi.ai/tool/$($ids.tools[$toolName])"
    }
    else {
        $method = 'POST'
        $uri = 'https://api.vapi.ai/tool'
    }
    $result = Invoke-VapiRequest -Method $method -Uri $uri -Payload $definition -ApiKey $apiKey
    if ($result.id) {
        $ids.tools[$toolName] = [string]$result.id
    }
    elseif (-not $ids.tools.Contains($toolName)) {
        throw "Vapi did not return an ID for tool $toolName."
    }
    Write-IdsFile -Path $idsPath -Ids $ids
}

$assistant.name = $businessName.Substring(0, [Math]::Min(40, $businessName.Length))
$assistant.firstMessage = $assistant.firstMessage.Replace('{{BUSINESS_NAME_SPOKEN}}', $spokenBusinessName)
$assistant.model.messages[0].content = $systemPrompt
$assistant.model.toolIds = @($toolDefinitions | ForEach-Object {
    $toolName = if ($_.type -eq 'transferCall') { 'transfer_to_owner' } else { $_.function.name }
    $ids.tools[$toolName]
})
if ($ids.assistant) {
    $assistantResult = Invoke-VapiRequest -Method 'PATCH' -Uri "https://api.vapi.ai/assistant/$($ids.assistant)" -Payload $assistant -ApiKey $apiKey
}
else {
    $assistantResult = Invoke-VapiRequest -Method 'POST' -Uri 'https://api.vapi.ai/assistant' -Payload $assistant -ApiKey $apiKey
}
if ($assistantResult.id) {
    $ids.assistant = [string]$assistantResult.id
}
if (-not $ids.assistant) {
    throw 'Vapi did not return an assistant ID.'
}
Write-IdsFile -Path $idsPath -Ids $ids
Write-Host "Assistant ID: $($ids.assistant)"
