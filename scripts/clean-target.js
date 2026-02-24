const { execSync } = require('child_process');
const { existsSync, rmSync } = require('fs');
const { join } = require('path');

const SRC_TAURI_DIR = join(__dirname, '..', 'src-tauri');
const TARGET_DIR = join(SRC_TAURI_DIR, 'target');
const DEBUG_DIR = join(TARGET_DIR, 'debug');

/**
 * Get the size of a directory in bytes (Windows-compatible)
 * @param {string} dirPath - Path to the directory
 * @returns {number|null} - Size in bytes or null if directory doesn't exist
 */
function getDirectorySize(dirPath) {
    if (!existsSync(dirPath)) {
        return null;
    }
    
    try {
        // Use du command on Unix-like systems, dir on Windows
        if (process.platform === 'win32') {
            // Windows: use PowerShell to get folder size
            const result = execSync(
                `powershell -NoProfile -Command "(Get-ChildItem -Path '${dirPath}' -Recurse -Force | Measure-Object -Property Length -Sum).Sum"`,
                { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
            );
            return parseInt(result.trim(), 10) || 0;
        } else {
            // Unix-like: use du command
            const result = execSync(`du -sb "${dirPath}"`, { encoding: 'utf8' });
            return parseInt(result.split('\t')[0], 10) || 0;
        }
    } catch (error) {
        console.warn('Could not determine directory size:', error.message);
        return null;
    }
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} - Human-readable size
 */
function formatBytes(bytes) {
    if (bytes === null || bytes === undefined) return 'N/A';
    if (bytes === 0) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Clean only the debug folder, preserving release builds
 */
function cleanTarget() {
    console.log('🧹 Cleaning src-tauri/target/debug folder (preserving release)...\n');
    
    // Check if debug directory exists
    if (!existsSync(DEBUG_DIR)) {
        console.log('✅ Debug folder does not exist. Nothing to clean.');
        return;
    }
    
    // Get size before cleaning
    const sizeBefore = getDirectorySize(DEBUG_DIR);
    if (sizeBefore !== null) {
        console.log(`📊 Debug folder size before: ${formatBytes(sizeBefore)}`);
    }
    
    try {
        // Delete the debug folder directly
        console.log('\n🔧 Removing debug folder...\n');
        rmSync(DEBUG_DIR, { recursive: true, force: true });
        
        console.log('✅ Successfully cleaned debug folder!');
        console.log('📦 Release folder preserved for faster builds.');
        
        if (sizeBefore !== null) {
            console.log(`💾 Freed approximately: ${formatBytes(sizeBefore)}`);
        }
    } catch (error) {
        console.error('\n❌ Failed to clean debug folder:');
        console.error(error.message);
        process.exit(1);
    }
}

// Main execution
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
    case 'help':
    case '--help':
    case '-h':
        console.log(`
mosu! Target Cleaner

Usage:
  npm run clean          Clean only the debug folder (preserves release builds)
  node clean-target.js help     Show this help message

Note:
  This script only cleans the debug folder to preserve release build artifacts.
  This speeds up subsequent production builds (npm run build).

Scheduling Options:
  
  Windows (Task Scheduler):
    1. Open Task Scheduler
    2. Create Basic Task
    3. Set trigger (e.g., Weekly)
    4. Action: Start a program
    5. Program: npm
    6. Arguments: run clean
    7. Start in: ${__dirname}
  
  macOS/Linux (cron):
    # Add to crontab (crontab -e)
    # Run every Sunday at 2 AM
    0 2 * * 0 cd "${__dirname}" && npm run clean >> /tmp/mosu-clean.log 2>&1
`);
        break;
    default:
        cleanTarget();
}
