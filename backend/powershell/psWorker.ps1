# psWorker.ps1
#
# FIX #3: LDAP-Injection-Escaping in allen LDAP-Filter-Strings
# FIX #3: Computer-Filter ebenfalls gesichert

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Import-Module ActiveDirectory -ErrorAction Stop

$DC = $env:AD_DC
if (-not $DC) { $DC = "dc1.company.internal" }

[Console]::Out.WriteLine("##READY##")
[Console]::Out.Flush()

# ─── FIX #3: LDAP-Sonderzeichen escapen ─────────────────────────────────────
# Escapet alle Zeichen die in LDAP-Filtern eine Sonderbedeutung haben.
# RFC 4515: ( ) * \ NUL und nicht-ASCII-Bytes
function Escape-LdapFilter {
    param([string]$Value)
    if ([string]::IsNullOrEmpty($Value)) { return "" }
    # Reihenfolge wichtig: \ zuerst escapen
    $escaped = $Value `
        -replace '\\', '\5c' `
        -replace '\*',  '\2a' `
        -replace '\(',  '\28' `
        -replace '\)',  '\29' `
        -replace '\x00','\00'
    return $escaped
}

# ─── Credential aus Payload ───────────────────────────────────────────────────
function Get-PayloadCredential {
    param([hashtable]$CredInfo)
    if (-not $CredInfo -or -not $CredInfo.username) { return $null }
    $secPwd = ConvertTo-SecureString $CredInfo.password -AsPlainText -Force
    return New-Object PSCredential ($CredInfo.username, $secPwd)
}

# ─── Ergebnis serialisieren ───────────────────────────────────────────────────
function Write-Result {
    param($Obj)
    $json = $Obj | ConvertTo-Json -Depth 6 -Compress
    [Console]::Out.WriteLine($json)
    [Console]::Out.WriteLine("##END##")
    [Console]::Out.Flush()
}

# ─── Dispatcher ───────────────────────────────────────────────────────────────
function Invoke-Command-Safe {
    param([string]$Cmd, [hashtable]$Params, [PSCredential]$Cred)

    $adArgs = @{ Server = $DC; ErrorAction = "Stop" }
    if ($Cred) { $adArgs.Credential = $Cred }

    switch ($Cmd) {

        "SearchUsers" {
            # FIX #3: Query escapen bevor er in LDAP-Filter eingesetzt wird
            $safeQuery = Escape-LdapFilter $Params.query
            $filter    = "(|(sAMAccountName=*${safeQuery}*)(displayName=*${safeQuery}*))"
            $allUsers  = @()
            foreach ($ou in $Params.ouList) {
                try {
                    $users = Get-ADUser -LDAPFilter $filter `
                        -SearchBase $ou -SearchScope Subtree `
                        -Properties DisplayName,Enabled,DistinguishedName `
                        @adArgs
                    $allUsers += $users
                } catch { }
            }
            return @{ ok = $true; data = @($allUsers | Select-Object SamAccountName, DisplayName, Enabled, DistinguishedName) }
        }

        "EnableUser" {
            $u = Get-ADUser -Identity $Params.sam -Properties DistinguishedName @adArgs
            Enable-ADAccount -Identity $u @adArgs
            if ($Params.targetOU) {
                Move-ADObject -Identity $u.DistinguishedName -TargetPath $Params.targetOU @adArgs
            }
            return @{ ok = $true; data = @{ sam = $Params.sam } }
        }

        "DisableUser" {
            $u = Get-ADUser -Identity $Params.sam -Properties DistinguishedName,Enabled @adArgs
            Set-ADObject -Identity $u.DistinguishedName -ProtectedFromAccidentalDeletion $false @adArgs
            if ($u.Enabled) { Disable-ADAccount -Identity $u @adArgs }
            $originalOU = $u.DistinguishedName -replace '^CN=[^,]+,', ''
            Move-ADObject -Identity $u.DistinguishedName -TargetPath $Params.targetOU @adArgs
            return @{ ok = $true; data = @{ sam = $Params.sam; originalOU = $originalOU } }
        }

        "UnlockUser" {
            Unlock-ADAccount -Identity $Params.sam @adArgs
            return @{ ok = $true; data = @{ sam = $Params.sam } }
        }

        "ResetPassword" {
            $secPwd = ConvertTo-SecureString $Params.newPassword -AsPlainText -Force
            Set-ADAccountPassword -Identity $Params.sam -Reset -NewPassword $secPwd @adArgs
            Set-ADUser -Identity $Params.sam `
                -ChangePasswordAtLogon ([bool]$Params.mustChange) `
                -CannotChangePassword  ([bool]$Params.cannotChange) `
                @adArgs
            return @{ ok = $true; data = @{ sam = $Params.sam } }
        }

        "EditUser" {
            $setArgs = @{ Identity = $Params.sam; Server = $DC; ErrorAction = "Stop" }
            if ($Cred) { $setArgs.Credential = $Cred }
            # changes ist PSCustomObject – in Hashtable konvertieren
            $changes = if ($Params.changes) { ConvertTo-Hashtable $Params.changes } else { @{} }
            $allowed = @("GivenName","Surname","DisplayName","Title","Department",
                         "Office","OfficePhone","MobilePhone","Description")
            foreach ($field in $allowed) {
                if ($changes.ContainsKey($field)) {
                    $setArgs[$field] = $changes[$field]
                }
            }
            Set-ADUser @setArgs
            if ($changes.ContainsKey("AccountExpires")) {
                $exp = $changes["AccountExpires"]
                if ($null -eq $exp -or $exp -eq "") {
                    Set-ADAccountExpiration -Identity $Params.sam -DateTime ([DateTime]::MaxValue) @adArgs
                } else {
                    Set-ADAccountExpiration -Identity $Params.sam -DateTime ([DateTime]$exp) @adArgs
                }
            }
            return @{ ok = $true; data = @{ sam = $Params.sam } }
        }

        "GetUserGroups" {
            $userObj = Get-ADUser -Identity $Params.sam -Properties memberOf @adArgs
            $groups  = @()
            if ($userObj.memberOf) {
                foreach ($dn in $userObj.memberOf) {
                    try {
                        $g = Get-ADGroup -Identity $dn -Properties Name,SamAccountName @adArgs
                        $groups += @{ Name = $g.Name; SamAccountName = $g.SamAccountName; DistinguishedName = $dn }
                    } catch { }
                }
            }
            return @{ ok = $true; data = $groups }
        }

        "GetUser" {
            $u = Get-ADUser -Identity $Params.sam `
                -Properties DisplayName,Enabled,DistinguishedName,Department,Title `
                @adArgs
            return @{ ok = $true; data = @{
                sam             = $u.SamAccountName
                displayName     = $u.DisplayName
                enabled         = $u.Enabled
                distinguishedName = $u.DistinguishedName
                department      = $u.Department
                title           = $u.Title
            }}
        }

        "AddGroupMember" {
            Add-ADGroupMember -Identity $Params.groupDn -Members $Params.sam @adArgs
            return @{ ok = $true; data = @{ sam = $Params.sam; groupDn = $Params.groupDn } }
        }

        "RemoveGroupMember" {
            Remove-ADGroupMember -Identity $Params.groupDn -Members $Params.sam -Confirm:$false @adArgs
            return @{ ok = $true; data = @{ sam = $Params.sam; groupDn = $Params.groupDn } }
        }

        "GetAllGroups" {
            $groups = @()
            foreach ($ou in $Params.ouList) {
                try {
                    $g = Get-ADGroup -Filter * -SearchBase $ou -Properties Name,SamAccountName @adArgs
                    $groups += $g | Select-Object Name, SamAccountName, DistinguishedName
                } catch { }
            }
            return @{ ok = $true; data = @($groups | Sort-Object Name -Unique) }
        }

        "SearchComputers" {
            # FIX #3: Computer-Query ebenfalls escapen
            $safeQuery = Escape-LdapFilter $Params.query
            $filter    = "(name=*${safeQuery}*)"
            $allComputers = @()
            foreach ($ou in $Params.ouList) {
                try {
                    $computers = Get-ADComputer -LDAPFilter $filter `
                        -SearchBase $ou -SearchScope Subtree `
                        -Properties Enabled,DistinguishedName `
                        @adArgs
                    $allComputers += $computers
                } catch { }
            }
            return @{ ok = $true; data = @($allComputers | Select-Object Name, Enabled, DistinguishedName) }
        }

        "DisableComputer" {
            $c = Get-ADComputer -Identity $Params.name -Properties DistinguishedName,Enabled @adArgs
            Set-ADObject -Identity $c.DistinguishedName -ProtectedFromAccidentalDeletion $false @adArgs
            if ($c.Enabled) { Disable-ADAccount -Identity $c @adArgs }
            $originalOU = $c.DistinguishedName -replace '^CN=[^,]+,', ''
            Move-ADObject -Identity $c.DistinguishedName -TargetPath $Params.targetOU @adArgs
            return @{ ok = $true; data = @{ name = $Params.name; originalOU = $originalOU } }
        }

        "EnableComputer" {
            $c = Get-ADComputer -Identity $Params.name -Properties DistinguishedName @adArgs
            Enable-ADAccount -Identity $c @adArgs
            if ($Params.targetOU) {
                Move-ADObject -Identity $c.DistinguishedName -TargetPath $Params.targetOU @adArgs
            }
            return @{ ok = $true; data = @{ name = $Params.name } }
        }

        "CreateUser" {
            $secPwd = ConvertTo-SecureString $Params.initialPassword -AsPlainText -Force
            New-ADUser `
                -SamAccountName   $Params.sam `
                -GivenName        $Params.firstName `
                -Surname          $Params.lastName `
                -DisplayName      $Params.displayName `
                -EmailAddress     $Params.email `
                -OfficePhone      $Params.phoneNumber `
                -Department       $Params.department `
                -Path             $Params.targetOU `
                -AccountPassword  $secPwd `
                -Enabled          ([bool]$Params.enabled) `
                -ChangePasswordAtLogon $true `
                @adArgs
            return @{ ok = $true; data = @{ sam = $Params.sam } }
        }

        "TestLogin" {
            # Get-ADUser mit Credential reicht zum Verifizieren – kein Get-ADDomain nötig
            $user = Get-ADUser -Identity $Params.sam `
                -Properties DisplayName,MemberOf `
                -Server $DC -Credential $Cred `
                -ErrorAction Stop
            return @{ ok = $true; data = @{
                sam         = $user.SamAccountName
                displayName = $user.DisplayName
                memberOf    = @($user.MemberOf)
            }}
        }

        default {
            return @{ ok = $false; error = "Unbekanntes Kommando: $Cmd" }
        }
    }
}

# ─── Haupt-Loop ───────────────────────────────────────────────────────────────

# Hilfsfunktion: PSCustomObject → Hashtable (ConvertFrom-Json liefert PSCustomObject)
function ConvertTo-Hashtable {
    param($obj)
    if ($null -eq $obj) { return @{} }
    $ht = @{}
    $obj.PSObject.Properties | ForEach-Object { $ht[$_.Name] = $_.Value }
    return $ht
}

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    $line = $line.Trim()
    if (-not $line) { continue }

    try {
        $payload = $line | ConvertFrom-Json
        $cmd     = $payload.cmd
        $params  = if ($payload.params) { ConvertTo-Hashtable $payload.params } else { @{} }
        $credRaw = if ($payload.credential) { ConvertTo-Hashtable $payload.credential } else { $null }
        $cred    = Get-PayloadCredential $credRaw

        $result = Invoke-Command-Safe -Cmd $cmd -Params $params -Cred $cred
        Write-Result $result

    } catch {
        Write-Result @{ ok = $false; error = $_.Exception.Message }
    }
}