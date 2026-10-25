// Jelly Brain launcher: keeps the folder clean (one exe), starts the engine in its subfolder.
// v0.5.2: if the engine can't start, it says exactly why (run from inside the zip, engine folder missing,
// engine file removed by antivirus) and writes launcher.log next to itself.
#include <windows.h>

static void logLine(const wchar_t *dir, const wchar_t *msg) {
  wchar_t lp[MAX_PATH * 2]; wsprintfW(lp, L"%s\\launcher.log", dir);
  HANDLE f = CreateFileW(lp, FILE_APPEND_DATA, FILE_SHARE_READ, NULL, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
  if (f == INVALID_HANDLE_VALUE) return;
  SYSTEMTIME t; GetLocalTime(&t);
  char buf[2048]; int n = wsprintfA(buf, "%04d-%02d-%02d %02d:%02d:%02d  %ls\r\n", t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond, msg);
  DWORD w; WriteFile(f, buf, n, &w, NULL); CloseHandle(f);
}

int WINAPI wWinMain(HINSTANCE h, HINSTANCE p, PWSTR cmd, int show) {
  wchar_t path[MAX_PATH * 2], dir[MAX_PATH * 2];
  DWORD n = GetModuleFileNameW(NULL, path, MAX_PATH * 2);
  if (!n) return 1;
  wcscpy(dir, path);
  wchar_t *slash = wcsrchr(dir, L'\\'); if (slash) *slash = 0;
  wchar_t exeBare[MAX_PATH * 2], exe[MAX_PATH * 2], work[MAX_PATH * 2];
  wsprintfW(work, L"%s\\engine", dir);
  wsprintfW(exeBare, L"%s\\engine\\JellyBrain Engine.exe", dir);
  wsprintfW(exe, L"\"%s\"", exeBare);

  DWORD wa = GetFileAttributesW(work), ea = GetFileAttributesW(exeBare);
  if (ea == INVALID_FILE_ATTRIBUTES) {
    wchar_t tmp[MAX_PATH * 2]; GetTempPathW(MAX_PATH * 2, tmp);
    wchar_t low[MAX_PATH * 2], lowTmp[MAX_PATH * 2]; wcscpy(low, dir); wcscpy(lowTmp, tmp); CharLowerW(low); CharLowerW(lowTmp);
    const wchar_t *why;
    if (wcsstr(low, lowTmp) == low || wcsstr(low, L"\\temp\\") || wcsstr(low, L".zip")) {
      why = L"Chip Studio is being run from INSIDE the zip file, so Windows only pulled out this one small program.\n\n"
            L"Fix: close this, right-click the zip file, choose \"Extract All\", then open the new folder and run Jelly Brain.exe from there.";
      logLine(dir, L"FAIL: run from inside the zip (temp folder)");
    } else if (wa == INVALID_FILE_ATTRIBUTES) {
      why = L"The \"engine\" folder is not next to this program.\n\n"
            L"Fix: extract the WHOLE zip (right-click it, \"Extract All\") and run Jelly Brain.exe from the extracted folder, without moving it out on its own.";
      logLine(dir, L"FAIL: engine folder missing");
    } else {
      why = L"The engine folder is here, but the engine program inside it is missing.\n\n"
            L"Windows Defender or another antivirus most likely removed it, because it is a new program it hasn't seen before.\n\n"
            L"Fix: extract the zip again. If it disappears again, Windows Security > Protection history will show it, and you can allow it there.";
      logLine(dir, L"FAIL: engine exe missing inside the engine folder (antivirus?)");
    }
    MessageBoxW(NULL, why, L"Jelly Brain", MB_ICONERROR);
    return 2;
  }

  STARTUPINFOW si; PROCESS_INFORMATION pi; ZeroMemory(&si, sizeof si); si.cb = sizeof si; ZeroMemory(&pi, sizeof pi);
  if (!CreateProcessW(NULL, exe, NULL, NULL, FALSE, 0, NULL, work, &si, &pi)) {
    wchar_t m[256]; wsprintfW(m, L"FAIL: engine found but would not start, Windows error %lu", GetLastError());
    logLine(work, m);
    MessageBoxW(NULL, L"The engine is there but Windows would not start it (it may be blocked by antivirus). The details are in launcher.log inside the engine folder.", L"Jelly Brain", MB_ICONERROR);
    return 3;
  }
  logLine(work, L"OK: engine started");
  CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
  return 0;
}
