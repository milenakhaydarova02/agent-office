# Prints "<idle seconds> <notification state> <execution state>" once a second.
#   idle seconds        - since the last mouse/keyboard input (GetLastInputInfo)
#   notification state  - SHQueryUserNotificationState: 2 = full-screen app, 3 = full-screen game (D3D),
#                         4 = presentation mode
#   execution state     - system execution flags; 0x2 = some app keeps the display on (video players)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class OfficeProbe {
  [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO p);
  [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);
  [DllImport("powrprof.dll")] static extern uint CallNtPowerInformation(int level, IntPtr inBuf, uint inLen, out uint outBuf, uint outLen);
  public static string Probe() {
    var li = new LASTINPUTINFO();
    li.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
    uint idle = 0;
    if (GetLastInputInfo(ref li)) idle = unchecked((uint)Environment.TickCount - li.dwTime) / 1000;
    int st = 0;
    try { SHQueryUserNotificationState(out st); } catch {}
    uint es = 0;
    try { CallNtPowerInformation(16, IntPtr.Zero, 0, out es, 4); } catch {}
    return idle + " " + st + " " + es;
  }
}
"@
while ($true) {
  [Console]::Out.WriteLine([OfficeProbe]::Probe())
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 1000
}
