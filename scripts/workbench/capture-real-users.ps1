$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'private-vault-acl.ps1')
# Interactive owner input only. Passwords never enter arguments, stdout or Git.
$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$approvedOfficers = Get-Content -LiteralPath (Join-Path $workspaceRoot '.local/phase2/approved-accounts.json') -Raw | ConvertFrom-Json
$approvedAdmin = Get-Content -LiteralPath (Join-Path $workspaceRoot '.local/phase2/approved-admin.json') -Raw | ConvertFrom-Json
if (-not $approvedOfficers.approved -or $approvedAdmin.environment -ne 'DEVELOPMENT_ONLY') { throw 'Approved development identity plans required.' }
$approvedEmails = @($approvedOfficers.accounts | ForEach-Object { $_.email }) + @($approvedAdmin.email)
$records = @()
foreach ($approvedEmail in $approvedEmails) {
    Write-Host ('Approved development account: ' + $approvedEmail)
    $secureInput = Read-Host 'Current password (Enter to skip an account that is not ready)' -AsSecureString
    if ($secureInput.Length -eq 0) { continue }
    $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureInput)
    try { $records += @{ email = $approvedEmail; password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer) } }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer); $secureInput.Dispose() }
}
if ($records.Count -eq 0) { throw 'No credentials saved.' }
Add-Type -AssemblyName System.Security
$privateDirectory = Join-Path $workspaceRoot '.local/acceptance'
[IO.Directory]::CreateDirectory($privateDirectory) | Out-Null
$vaultFile = Join-Path $privateDirectory 'real-users.vault'
$payloadBytes = [Text.Encoding]::UTF8.GetBytes((@{ environment = 'DEVELOPMENT_REAL_AUTH'; accounts = $records } | ConvertTo-Json -Depth 5))
try {
    $encrypted = [Security.Cryptography.ProtectedData]::Protect($payloadBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    [IO.File]::WriteAllText($vaultFile, [Convert]::ToBase64String($encrypted))
    Protect-SynapseVaultFile -LiteralPath $vaultFile
} finally { [Array]::Clear($payloadBytes, 0, $payloadBytes.Length); $records = $null }
Write-Host 'Encrypted development credentials saved privately for real browser checks. No account or authority was changed.'
