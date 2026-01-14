!include "MUI2.nsh"

!ifndef APP_NAME
!define APP_NAME "ParaImage"
!endif
!ifndef APP_VERSION
!define APP_VERSION "0.0.0"
!endif
!ifndef DIST_DIR
!define DIST_DIR "dist\\ParaImage"
!endif
!ifndef OUTPUT_FILE
!define OUTPUT_FILE "ParaImage-setup.exe"
!endif
!ifndef EXE_NAME
!define EXE_NAME "ParaImage.exe"
!endif
!ifndef WEBVIEW2_BOOTSTRAPPER
!define WEBVIEW2_BOOTSTRAPPER ""
!endif

Name "${APP_NAME}"
OutFile "${OUTPUT_FILE}"
InstallDir "$PROGRAMFILES64\\${APP_NAME}"
InstallDirRegKey HKLM "Software\\${APP_NAME}" "InstallDir"
RequestExecutionLevel admin
Unicode True

!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "${DIST_DIR}\\*"
  WriteRegStr HKLM "Software\\${APP_NAME}" "InstallDir" "$INSTDIR"
  WriteUninstaller "$INSTDIR\\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\\${APP_NAME}"
  CreateShortCut "$SMPROGRAMS\\${APP_NAME}\\${APP_NAME}.lnk" "$INSTDIR\\${EXE_NAME}"
  CreateShortCut "$DESKTOP\\${APP_NAME}.lnk" "$INSTDIR\\${EXE_NAME}"
!if "${WEBVIEW2_BOOTSTRAPPER}" != ""
  SetOutPath "$TEMP"
  File /oname=MicrosoftEdgeWebView2Setup.exe "${WEBVIEW2_BOOTSTRAPPER}"
  Call InstallWebView2IfNeeded
!endif
SectionEnd

Function InstallWebView2IfNeeded
  IfFileExists "$PROGRAMFILES64\\Microsoft\\EdgeWebView\\Application\\*" done
  IfFileExists "$PROGRAMFILES\\Microsoft\\EdgeWebView\\Application\\*" done
  IfFileExists "$LOCALAPPDATA\\Microsoft\\EdgeWebView\\Application\\*" done
  ExecWait '"$TEMP\\MicrosoftEdgeWebView2Setup.exe" /silent /install' $0
  Delete "$TEMP\\MicrosoftEdgeWebView2Setup.exe"
done:
FunctionEnd

Section "Uninstall"
  Delete "$DESKTOP\\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\\${APP_NAME}\\${APP_NAME}.lnk"
  RMDir "$SMPROGRAMS\\${APP_NAME}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKLM "Software\\${APP_NAME}"
SectionEnd
