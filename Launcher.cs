using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

internal static class Launcher
{
    [STAThread]
    private static int Main()
    {
        try
        {
            string script;
            using (var source = Assembly.GetExecutingAssembly().GetManifestResourceStream("Launch-Outline.ps1"))
            using (var reader = new StreamReader(source))
                script = reader.ReadToEnd();

            string root = AppDomain.CurrentDomain.BaseDirectory;
            string engine = Path.Combine(Environment.SystemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe");
            string command = Convert.ToBase64String(Encoding.Unicode.GetBytes(script));
            var info = new ProcessStartInfo(engine)
            {
                Arguments = "-NoLogo -NoProfile -NonInteractive -OutputFormat Text -EncodedCommand " + command,
                WorkingDirectory = root,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardError = true
            };
            info.EnvironmentVariables["CODEX_CHAT_OUTLINE_ASSETS"] = root;
#if STOP_LAUNCHER
            info.EnvironmentVariables["CODEX_CHAT_OUTLINE_ACTION"] = "stop";
#else
            info.EnvironmentVariables["CODEX_CHAT_OUTLINE_ACTION"] = "start";
#endif

            using (var process = Process.Start(info))
            {
                var errorOutput = process.StandardError.ReadToEndAsync();
                process.WaitForExit();
                if (process.ExitCode != 0)
                {
                    string error = errorOutput.Wait(500) ? errorOutput.Result.Trim() : string.Empty;
                    ShowError(string.IsNullOrWhiteSpace(error) ? "Chat Outline could not complete this action." : error);
                }
                return process.ExitCode;
            }
        }
        catch (Exception error)
        {
            ShowError(error.Message);
            return 1;
        }
    }

    private static void ShowError(string text)
    {
        MessageBox.Show(text, "Codex Chat Outline", MessageBoxButtons.OK, MessageBoxIcon.Warning);
    }
}
