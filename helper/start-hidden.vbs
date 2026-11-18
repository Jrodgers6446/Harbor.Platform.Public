Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
logDir = sh.ExpandEnvironmentStrings("%USERPROFILE%") & "\.harbor-helper"
If Not fso.FolderExists(logDir) Then fso.CreateFolder(logDir)
sh.CurrentDirectory = dir
sh.Run "cmd /c """ & dir & "\run-loop.bat""", 0, False
