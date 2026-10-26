import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
const assembly = `[void][Reflection.Assembly]::Load('System.Security, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a');`;
const encode = assembly + `$v=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd()); [Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($v,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))`;
const decode = assembly + `$v=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($v,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))`;
function protect(input, script) {
  if (process.platform !== "win32")
    throw Error(
      "This operator vault requires Windows DPAPI. Do not replace it with plaintext storage.",
    );
  try {
    return execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        input,
        encoding: "utf8",
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    ).trim();
  } catch {
    throw Error("DPAPI operation failed; no credentials were printed.");
  }
}
export async function saveVault(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file+'.pending', protect(JSON.stringify(value), encode), {
    mode: 0o600,
  });
  await rename(file+'.pending',file);
}
export async function loadVault(file) {
  return JSON.parse(protect(await readFile(file, "utf8"), decode));
}
