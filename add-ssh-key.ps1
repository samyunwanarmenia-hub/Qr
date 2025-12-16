# Скрипт для добавления SSH ключа в GitHub через API
# Использование: .\add-ssh-key.ps1 -Token "YOUR_GITHUB_TOKEN"

param(
    [Parameter(Mandatory=$true)]
    [string]$Token
)

$pubKeyPath = "$env:USERPROFILE\.ssh\id_ed25519.pub"

if (-not (Test-Path $pubKeyPath)) {
    Write-Error "SSH ключ не найден: $pubKeyPath"
    exit 1
}

$pubKey = (Get-Content $pubKeyPath -Raw).Trim()
$keyTitle = "Qr-main-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

$headers = @{
    "Authorization" = "token $Token"
    "Accept" = "application/vnd.github.v3+json"
}

$body = @{
    title = $keyTitle
    key = $pubKey
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "https://api.github.com/user/keys" -Method Post -Headers $headers -Body $body
    Write-Host "✅ SSH ключ успешно добавлен в GitHub!" -ForegroundColor Green
    Write-Host "Ключ ID: $($response.id)" -ForegroundColor Green
    Write-Host "Название: $($response.title)" -ForegroundColor Green
} catch {
    Write-Host "❌ Ошибка при добавлении ключа:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    }
    exit 1
}

