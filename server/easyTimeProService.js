const fs = require('fs');
const path = require('path');
// Use global fetch (Node 18+) or fallback
const fetch = globalThis.fetch ?? require('node-fetch');

// Path to persistent configuration file
const CONFIG_FILE = path.join(__dirname, 'data', 'easytimepro_config.json');

/**
 * Service to manage connection, authentication, and continuous synchronization
 * with ZKTeco EasyTimePro server without affecting existing app operations.
 */
class EasyTimeProService {
  constructor() {
    this.config = this.loadConfig();
    this.token = null;
    this.tokenExpiresAt = 0;
    this.isSyncing = false;
    this.lastSyncTime = null;
    this.lastSyncCount = 0;
    this.lastError = null;
    this.lastSuccessTime = null;
    this.processRecordCallback = null;
    this.cronTask = null;
  }

  /**
   * Load configuration from file or fallback to environment variables
   */
  loadConfig() {
    let fileConfig = {};
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
        fileConfig = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[EasyTimePro] Could not read config file, falling back to env:', e.message);
    }

    return {
      url: (fileConfig.url || process.env.EASYTIMEPRO_URL || '').trim().replace(/\/+$/, ''),
      username: (fileConfig.username || process.env.EASYTIMEPRO_USER || '').trim(),
      password: (fileConfig.password || process.env.EASYTIMEPRO_PASSWORD || '').trim(),
      autoSync: fileConfig.autoSync !== undefined ? Boolean(fileConfig.autoSync) : (process.env.EASYTIMEPRO_AUTO_SYNC === 'true'),
      syncIntervalMinutes: Number(fileConfig.syncIntervalMinutes || process.env.EASYTIMEPRO_SYNC_INTERVAL || 1)
    };
  }

  /**
   * Save configuration to file and update active configuration
   */
  saveConfig(newConfig) {
    this.config = {
      ...this.config,
      ...newConfig,
      url: (newConfig.url !== undefined ? newConfig.url : this.config.url).trim().replace(/\/+$/, ''),
      username: (newConfig.username !== undefined ? newConfig.username : this.config.username).trim(),
      password: newConfig.password !== undefined ? newConfig.password.trim() : this.config.password,
      autoSync: newConfig.autoSync !== undefined ? Boolean(newConfig.autoSync) : this.config.autoSync,
      syncIntervalMinutes: Math.max(1, Number(newConfig.syncIntervalMinutes || this.config.syncIntervalMinutes || 1))
    };

    // Invalidate token if URL/credentials changed
    this.token = null;
    this.tokenExpiresAt = 0;

    try {
      const dataDir = path.dirname(CONFIG_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf8');
      console.log('[EasyTimePro] Configuration saved successfully.');
    } catch (e) {
      console.error('[EasyTimePro] Error saving config file:', e.message);
    }

    return this.getStatus();
  }

  /**
   * Helper to perform fetch with timeout to prevent hanging connections
   */
  async fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timer);
      return resp;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`Connection timed out after ${timeoutMs / 1000}s while reaching ${url}`);
      }
      throw err;
    }
  }

  /**
   * Authenticate with EasyTimePro and retrieve Bearer / JWT Token
   */
  async authenticate(overrideConfig = null) {
    const cfg = overrideConfig || this.config;
    if (!cfg.url || !cfg.username || !cfg.password) {
      throw new Error('EasyTimePro Server URL, Username, and Password are required.');
    }

    // Reuse valid token if available
    if (!overrideConfig && this.token && Date.now() < this.tokenExpiresAt) {
      return this.token;
    }

    const authUrl = `${cfg.url}/api/api-token-auth/`;
    let response;
    try {
      response = await this.fetchWithTimeout(authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cfg.username,
          password: cfg.password
        })
      }, 7000);
    } catch (err) {
      // If /api/api-token-auth/ fails, try /api/jwt-api-token-auth/
      const jwtUrl = `${cfg.url}/api/jwt-api-token-auth/`;
      try {
        response = await this.fetchWithTimeout(jwtUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: cfg.username,
            password: cfg.password
          })
        }, 7000);
      } catch (jwtErr) {
        throw new Error(`Unable to reach EasyTimePro server at ${cfg.url}. Check if the server is running and accessible.`);
      }
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Authentication failed (HTTP ${response.status}): ${text || 'Invalid username or password'}`);
    }

    const data = await response.json();
    const token = data.token || data.access;
    if (!token) {
      throw new Error('EasyTimePro response did not contain an authentication token.');
    }

    if (!overrideConfig) {
      this.token = token;
      // Cache token for 12 hours
      this.tokenExpiresAt = Date.now() + 12 * 60 * 60 * 1000;
      this.lastError = null;
    }

    return token;
  }

  /**
   * Test connection to EasyTimePro
   */
  async testConnection(testCfg = null) {
    try {
      const token = await this.authenticate(testCfg);
      const targetUrl = (testCfg?.url || this.config.url);
      
      // Attempt to ping the terminals list endpoint
      const termUrl = `${targetUrl}/iclock/api/terminals/?page=1&page_size=1`;
      let termCount = 0;
      try {
        const resp = await this.fetchWithTimeout(termUrl, {
          headers: {
            'Authorization': `Bearer-Token ${token}`,
            'Content-Type': 'application/json'
          }
        }, 6000);
        if (resp.ok) {
          const tData = await resp.json().catch(() => ({}));
          termCount = tData.count || (Array.isArray(tData.data) ? tData.data.length : 0);
        }
      } catch (e) {
        // Ping error is non-fatal if token succeeded
      }

      this.lastSuccessTime = new Date().toISOString();
      this.lastError = null;

      return {
        success: true,
        message: 'Successfully connected to EasyTimePro!',
        terminalsFound: termCount
      };
    } catch (err) {
      this.lastError = err.message;
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Sync transactions (attendance punches) from EasyTimePro
   */
  async syncTransactions() {
    if (this.isSyncing) {
      return { inProgress: true, message: 'Sync already in progress.' };
    }

    if (!this.config.url || !this.config.username || !this.config.password) {
      // Gracefully exit when not configured; no error thrown
      return { configured: false, message: 'EasyTimePro is not yet configured.' };
    }

    this.isSyncing = true;
    let syncedCount = 0;

    try {
      const token = await this.authenticate();

      // Look back 2 hours or since last sync
      let startTimeStr;
      if (this.lastSyncTime) {
        const lastDate = new Date(new Date(this.lastSyncTime).getTime() - 5 * 60 * 1000); // 5 min buffer
        startTimeStr = lastDate.toISOString().slice(0, 19);
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        startTimeStr = today.toISOString().slice(0, 19);
      }

      // ZKTeco transactions endpoint (Page 162-165 of manual)
      const fetchUrl = `${this.config.url}/iclock/api/transactions/?start_time=${encodeURIComponent(startTimeStr)}&ordering=-punch_time&page_size=200`;

      const response = await this.fetchWithTimeout(fetchUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer-Token ${token}`,
          'Content-Type': 'application/json'
        }
      }, 10000);

      // If token expired, clear token and retry once
      if (response.status === 401 || response.status === 403) {
        this.token = null;
        this.tokenExpiresAt = 0;
        const freshToken = await this.authenticate();
        const retryResp = await this.fetchWithTimeout(fetchUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer-Token ${freshToken}`,
            'Content-Type': 'application/json'
          }
        }, 10000);

        if (!retryResp.ok) {
          throw new Error(`Failed to fetch transactions: HTTP ${retryResp.status}`);
        }
        return await this.processTransactionResponse(retryResp);
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch transactions: HTTP ${response.status}`);
      }

      const result = await this.processTransactionResponse(response);
      return result;
    } catch (err) {
      this.lastError = err.message;
      console.warn('[EasyTimePro Sync] Handled non-fatal error:', err.message);
      return {
        success: false,
        error: err.message,
        syncedCount: 0
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Helper to parse and dispatch transaction punches
   */
  async processTransactionResponse(response) {
    const json = await response.json();
    const records = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);
    let processed = 0;

    if (this.processRecordCallback && records.length > 0) {
      // Process oldest to newest
      const sorted = [...records].reverse();
      for (const record of sorted) {
        const empCode = record.emp_code || record.pin || record.user_id;
        const punchTime = record.punch_time;
        const terminalSn = record.terminal_sn || record.sn || 'EasyTimePro';

        if (empCode && punchTime) {
          try {
            await this.processRecordCallback(empCode, punchTime, terminalSn);
            processed++;
          } catch (e) {
            console.error(`[EasyTimePro] Error processing punch for ${empCode}:`, e.message);
          }
        }
      }
    }

    this.lastSyncTime = new Date().toISOString();
    this.lastSyncCount = processed;
    this.lastSuccessTime = new Date().toISOString();
    this.lastError = null;

    return {
      success: true,
      recordsFound: records.length,
      recordsProcessed: processed,
      lastSyncTime: this.lastSyncTime
    };
  }

  /**
   * Remote unlock terminal (Page 193-196 of manual)
   */
  async unlockTerminal(sn) {
    if (!sn) throw new Error('Terminal Serial Number (sn) is required to unlock.');
    const token = await this.authenticate();
    const unlockUrl = `${this.config.url}/iclock/api/terminals/unlock_terminal/`;

    const response = await this.fetchWithTimeout(unlockUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer-Token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sn: String(sn).trim() })
    }, 6000);

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || data.detail || `Door unlock failed with HTTP ${response.status}`);
    }
    return { success: true, message: 'Unlock signal sent to terminal.', data };
  }

  /**
   * Provision or update client in EasyTimePro (Page 42-48 of manual)
   */
  async syncClientToDevice(client) {
    if (!this.config.url || !this.config.username || !this.config.password) {
      return { skipped: true, reason: 'EasyTimePro not configured' };
    }
    try {
      const token = await this.authenticate();
      const empCode = String(client.clientId || client.id).trim();
      const postUrl = `${this.config.url}/personnel/api/employees/`;

      const payload = {
        emp_code: empCode,
        first_name: client.name || 'Member',
        mobile: client.phone || '',
        validity_start: client.fromDate || new Date().toISOString().split('T')[0],
        validity_end: client.expiryDate || '2099-12-31',
        enable_att: true,
        app_status: 1
      };

      const res = await this.fetchWithTimeout(postUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer-Token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }, 7000);

      const data = await res.json().catch(() => ({}));
      return { success: res.ok, data };
    } catch (e) {
      console.warn(`[EasyTimePro] Non-blocking client sync notice for ${client.name}:`, e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * Setup background polling cron job
   */
  initScheduledSync(processRecordCallback, cronModule) {
    this.processRecordCallback = processRecordCallback;

    if (!cronModule) {
      console.warn('[EasyTimePro] node-cron not available; automated polling disabled.');
      return;
    }

    // Run safe scheduled sync every 1 minute
    this.cronTask = cronModule.schedule('*/1 * * * *', async () => {
      if (this.config.autoSync && this.config.url && this.config.username && this.config.password) {
        try {
          await this.syncTransactions();
        } catch (e) {
          // Never let background timer crash Node process
          console.warn('[EasyTimePro Cron] Handled error in periodic sync:', e.message);
        }
      }
    });

    console.log('[EasyTimePro] Service initialized. Background punch sync scheduler active.');
  }

  /**
   * Get safe status for frontend UI
   */
  getStatus() {
    return {
      configured: Boolean(this.config.url && this.config.username && this.config.password),
      url: this.config.url || '',
      username: this.config.username || '',
      hasPassword: Boolean(this.config.password),
      autoSync: Boolean(this.config.autoSync),
      syncIntervalMinutes: this.config.syncIntervalMinutes || 1,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      lastSyncCount: this.lastSyncCount,
      lastSuccessTime: this.lastSuccessTime,
      lastError: this.lastError
    };
  }
}

// Export singleton instance
const easyTimeProService = new EasyTimeProService();
module.exports = easyTimeProService;
