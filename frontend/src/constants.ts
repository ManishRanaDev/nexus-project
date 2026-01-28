export const BACKEND_URL = 'https://nexubacksend.shop';
export const CONTACT_ID = '918299515901@c.us';
export const STORAGE_KEY = 'nexus-chat-918299515901';
export const THEME_STORAGE_KEY = 'nexus-theme';
export const LABEL = 'Stealth_Command';
export const AUTO_LOCK_MS = 120_000; // 2 minutes
export const SYNC_INTERVAL_MS = 300_000; // 5 minutes
export const PIN_FAKE = '1331';
export const PIN_REAL = '4387';

export const TERMINAL_SUGGESTIONS = [
  'system status',
  'network scan',
  'list files',
  'help',
  'whoami',
  'uptime',
  'ping gateway',
  'check logs',
  'disk usage',
  'process list',
  'security audit',
  'backup status',
];

export const TERMINAL_RESPONSES: Record<string, string> = {
  help: 'Available commands:\n\u2022 system status - Check system health\n\u2022 network scan - Scan network devices\n\u2022 list files - Show directory contents\n\u2022 whoami - Display current user\n\u2022 uptime - Show system uptime\n\u2022 ping gateway - Test network connectivity\n\u2022 check logs - View recent system logs\n\u2022 disk usage - Show storage information\n\u2022 process list - Display running processes\n\u2022 security audit - Run security checks\n\u2022 backup status - Check backup systems\n\u2022 clear - Clear terminal',
  'system status':
    '\u2713 CPU: 23% (Normal)\n\u2713 Memory: 4.2GB / 16GB (26% used)\n\u2713 Disk: 234GB free of 512GB\n\u2713 Network: Connected (98ms latency)\n\u2713 Security: All systems operational\n\u2713 Last check: Just now',
  'network scan':
    'Scanning network 172.16.0.0/24...\n\n[172.16.0.1] Gateway - Online (2ms)\n[172.16.0.45] analytics-node - Online (5ms)\n[172.16.0.89] backup-server - Online (8ms)\n[172.16.0.102] database-01 - Online (3ms)\n[172.16.0.156] cache-server - Online (6ms)\n\n5 devices detected. Network stable.',
  'list files':
    '/nexus/secure/\n  \u251C\u2500\u2500 config.json (4.2KB)\n  \u251C\u2500\u2500 credentials.enc (8.1KB)\n  \u251C\u2500\u2500 logs/\n  \u2502   \u251C\u2500\u2500 system.log (156KB)\n  \u2502   \u251C\u2500\u2500 access.log (89KB)\n  \u2502   \u2514\u2500\u2500 error.log (12KB)\n  \u251C\u2500\u2500 data/\n  \u2502   \u251C\u2500\u2500 cache/ (234MB)\n  \u2502   \u2514\u2500\u2500 temp/ (45MB)\n  \u2514\u2500\u2500 scripts/\n      \u251C\u2500\u2500 backup.sh\n      \u251C\u2500\u2500 monitor.py\n      \u2514\u2500\u2500 cleanup.sh',
  whoami:
    'Current user: admin@nexus-terminal\nPermission level: Root access\nSession ID: NX-7A4B-9C2D\nIP Address: 172.16.0.100\nAuthenticated: Yes',
  uptime:
    'System uptime: 47 days, 13 hours, 24 minutes\nLast reboot: 2024-11-20 03:15:42\nLoad average: 0.45, 0.52, 0.48\nActive sessions: 3',
  'ping gateway':
    'PING 172.16.0.1 (172.16.0.1) 56 bytes\n\n64 bytes from 172.16.0.1: icmp_seq=1 time=2.1ms\n64 bytes from 172.16.0.1: icmp_seq=2 time=1.8ms\n64 bytes from 172.16.0.1: icmp_seq=3 time=2.3ms\n64 bytes from 172.16.0.1: icmp_seq=4 time=1.9ms\n\n--- ping statistics ---\n4 packets transmitted, 4 received, 0% packet loss\navg/min/max = 2.0/1.8/2.3 ms',
  'check logs':
    'Recent system logs:\n\n[2025-01-06 14:23:15] [INFO] System health check passed\n[2025-01-06 14:18:42] [INFO] Backup completed successfully\n[2025-01-06 14:12:09] [WARN] High memory usage detected\n[2025-01-06 14:05:31] [INFO] Security scan completed\n[2025-01-06 13:58:17] [INFO] Database optimization finished\n\nShowing last 5 entries. Use "check logs -all" for full history.',
  'disk usage':
    'Filesystem analysis:\n\n/ (root)        278GB / 512GB (54% used)\n/home          156GB / 256GB (61% used)\n/var/log        12GB / 50GB  (24% used)\n/tmp             4GB / 20GB  (20% used)\n\nTotal: 450GB used of 838GB\nLargest directories:\n  /var/cache     45GB\n  /home/data     89GB\n  /backup        67GB',
  'process list':
    'Active processes:\n\nPID    CPU%   MEM%   COMMAND\n1247   12.3   4.2    nexus-core\n2891    8.1   2.7    analytics-engine\n3456    5.2   1.9    backup-daemon\n4123    3.8   3.1    monitoring-agent\n5678    2.1   1.2    cache-manager\n6234    1.5   0.8    log-processor\n\n6 processes shown. System load: Normal',
  'security audit':
    'Running security audit...\n\n\u2713 Firewall: Active and configured\n\u2713 SSL Certificates: Valid (expires in 234 days)\n\u2713 Password policies: Enforced\n\u2713 Failed login attempts: 0 in last 24h\n\u2713 Open ports: Only authorized (22, 80, 443)\n\u2713 Malware scan: Clean\n\u2713 Intrusion detection: Active\n\u2713 Encryption: AES-256 enabled\n\nSecurity score: 98/100\nLast full audit: 3 days ago',
  'backup status':
    'Backup system status:\n\n\u2713 Last backup: Today at 03:00 AM\n\u2713 Status: Successful\n\u2713 Data transferred: 45.7GB\n\u2713 Duration: 18 minutes\n\u2713 Next scheduled: Tomorrow at 03:00 AM\n\nBackup history (last 7 days):\n  Mon: \u2713 Success\n  Tue: \u2713 Success\n  Wed: \u2713 Success\n  Thu: \u2713 Success\n  Fri: \u2713 Success\n  Sat: \u2713 Success\n  Sun: \u2713 Success\n\nRetention: 30 days\nStorage location: /backup/archive',
  clear: '__CLEAR__',
};

export const RANDOM_RESPONSES = [
  'Processing request...\nOperation completed successfully.\n\u2713 All systems nominal',
  'Analyzing input...\n[OK] Command executed\nStatus: Operational',
  'Connecting to secure node...\n\u2713 Connection established\n\u2713 Data synchronized',
  'Initializing subsystem...\n[INFO] Module loaded successfully\nReady for next command',
  'Executing background task...\n\u2713 Task completed\n\u2713 No errors detected',
  'Scanning environment...\n[SCAN] 3 items processed\n\u2713 Scan complete',
  'Validating credentials...\n\u2713 Authentication successful\n\u2713 Access granted',
  'Fetching remote data...\n[SYNC] 127 bytes transferred\n\u2713 Operation successful',
  'Running diagnostics...\n\u2713 All checks passed\n\u2713 System healthy',
  'Compiling metadata...\n[BUILD] Compilation successful\n\u2713 Output generated',
  'Encrypting transmission...\n\u2713 Encryption applied\n\u2713 Secure channel active',
  'Loading configuration...\n[CONFIG] Settings applied\n\u2713 Ready',
  'Analyzing network traffic...\n\u2713 Traffic normal\n\u2713 No anomalies detected',
  'Optimizing performance...\n[PERF] Optimization complete\n+15% efficiency gain',
  'Verifying integrity...\n\u2713 Hash verified\n\u2713 No corruption detected',
];

export function getTerminalResponse(cmd: string): string {
  const lower = cmd.toLowerCase().trim();
  if (lower === 'clear') return '__CLEAR__';
  if (TERMINAL_RESPONSES[lower]) return TERMINAL_RESPONSES[lower];
  return RANDOM_RESPONSES[Math.floor(Math.random() * RANDOM_RESPONSES.length)];
}
