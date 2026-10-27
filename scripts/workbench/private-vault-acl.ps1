function Protect-SynapseVaultFile {
    param([Parameter(Mandatory = $true)][string]$LiteralPath)
    $ownerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $privateAcl = New-Object Security.AccessControl.FileSecurity
    $privateAcl.SetAccessRuleProtection($true, $false)
    $privateAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($ownerSid, 'FullControl', 'Allow')))
    # Set only the modified DACL. PowerShell Set-Acl also attempts to persist
    # audit/owner sections and can require SeSecurityPrivilege on this machine.
    [IO.File]::SetAccessControl($LiteralPath, $privateAcl)
    $actual = [IO.File]::GetAccessControl($LiteralPath, [Security.AccessControl.AccessControlSections]::Access)
    if (-not $actual.AreAccessRulesProtected) { throw 'Vault permission inheritance is still enabled.' }
    $allowed = @($actual.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]) | Where-Object { $_.AccessControlType -eq 'Allow' })
    if ($allowed.Count -ne 1 -or $allowed[0].IdentityReference.Value -ne $ownerSid.Value -or $allowed[0].FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl) {
        throw 'Vault permissions could not be restricted to the current Windows user.'
    }
}
