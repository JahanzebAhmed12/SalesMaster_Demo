// Print Helper - Direct Windows Print Spooler Integration
const { exec } = require('child_process');
const fs = require('fs');

class PrintHelper {
  static async printToQueue(filePath, printerName) {
    return new Promise((resolve, reject) => {
      console.log(`🖨️  Queuing print job to: ${printerName}`);
      
      // Method 1: Use Adobe Reader silent printing (most reliable for PDFs)
      const adobeCommand = `"C:\\Program Files\\Adobe\\Acrobat DC\\Acrobat\\Acrobat.exe" /t "${filePath}" "${printerName}"`;
      
      exec(adobeCommand, (adobeError) => {
        if (adobeError) {
          console.log(`⚠️  Adobe Reader not found, trying SumatraPDF: ${adobeError.message}`);
          
          // Method 2: Use SumatraPDF (lightweight and reliable)
          const sumatraCommand = `"C:\\Program Files\\SumatraPDF\\SumatraPDF.exe" -print-to "${printerName}" "${filePath}"`;
          
          exec(sumatraCommand, (sumatraError) => {
            if (sumatraError) {
              console.log(`⚠️  SumatraPDF not found, trying default PDF handler: ${sumatraError.message}`);
              
              // Method 3: Use default PDF application (same as double-clicking)
              const defaultCommand = `powershell -Command "& { $file = Get-Item '${filePath}'; $verb = $file.GetType().InvokeMember('Verbs', 'InvokeMethod', $null, $file, $null) | Where-Object { $_.Name -eq 'Print' }; if($verb) { $verb.DoIt(); Write-Host 'Print job sent via default PDF handler' } else { Write-Host 'Print verb not found' } }"`;
              
              exec(defaultCommand, (defaultError) => {
                if (defaultError) {
                  console.log(`⚠️  Default handler failed, trying direct file association: ${defaultError.message}`);
                  
                  // Method 4: Direct file association print (Windows shell)
                  const shellCommand = `powershell -Command "& { Start-Process -FilePath '${filePath}' -Verb Print -WindowStyle Hidden; Write-Host 'Print job sent via file association' }"`;
                  
                  exec(shellCommand, (shellError) => {
                    if (shellError) {
                      reject(new Error(`All print methods failed: ${shellError.message}`));
                    } else {
                      console.log('✅ Print job queued via file association');
                      setTimeout(resolve, 2000);
                    }
                  });
                } else {
                  console.log('✅ Print job queued via default PDF handler');
                  setTimeout(resolve, 2000);
                }
              });
            } else {
              console.log('✅ Print job queued via SumatraPDF');
              setTimeout(resolve, 2000);
            }
          });
        } else {
          console.log('✅ Print job queued via Adobe Reader');
          setTimeout(resolve, 2000);
        }
      });
    });
  }

  static async checkPrinterStatus(printerName) {
    return new Promise((resolve) => {
      const statusCommand = `powershell -Command "Get-WmiObject -Query \\"SELECT * FROM Win32_Printer WHERE Name='${printerName}'\\" | Select-Object Name, PrinterStatus, WorkOffline, PrinterState"`;
      
      exec(statusCommand, (error, stdout) => {
        if (error) {
          resolve({ available: false, error: error.message });
        } else if (stdout.trim()) {
          resolve({ available: true, status: stdout.trim() });
        } else {
          resolve({ available: false, error: 'Printer not found' });
        }
      });
    });
  }

  static async listAvailablePrinters() {
    return new Promise((resolve) => {
      const listCommand = `powershell -Command "Get-WmiObject -Query \\"SELECT * FROM Win32_Printer\\" | Select-Object Name, PrinterStatus | Format-Table -AutoSize"`;
      
      exec(listCommand, (error, stdout) => {
        if (error) {
          resolve([]);
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }
}

module.exports = PrintHelper;