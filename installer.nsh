!macro customInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "Do you want to create a NeumoRemind shortcut on your Desktop?" IDNO skipDesktopShortcut
    CreateShortCut "$DESKTOP\NeumoRemind.lnk" "$INSTDIR\NeumoRemind.exe" "" "$INSTDIR\NeumoRemind.exe" 0
  skipDesktopShortcut:
!macroend

!macro customUnInstall
  Delete "$DESKTOP\NeumoRemind.lnk"
!macroend
