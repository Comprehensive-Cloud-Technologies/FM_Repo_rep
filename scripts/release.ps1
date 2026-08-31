# Thin wrapper around scripts/release.mjs
# Usage:  pwsh scripts/release.ps1 1.2.0
param([Parameter(Mandatory = $true)][string]$Version)
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
node (Join-Path $scriptDir "release.mjs") $Version
