// server.js - FAST & STABLE (NO CLOUDFLARE) + Proxy protocol + WebRTC anti-leak + Queue timeout + Warmup
const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { HttpsProxyAgent } = require('https-proxy-agent');

const app = express();

app.use(cors({
  origin: ['https://checkkm.vercel.app'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.options(/.*/, cors());
app.use(bodyParser.json({ limit: '1mb' }));

// --- CONFIG ---
const PORT = process.env.PORT || 3000;

const SECRET_KEY = process.env.SECRET_KEY || 'codehunter_vip_secret_key_2024';
const PRICE_PER_CHECK = Number(process.env.PRICE_PER_CHECK || 80);
const CAPTCHA_API_URL = process.env.CAPTCHA_API_URL || 'https://autocaptcha.pro/apiv3/process';
const ADMIN_PASS = process.env.ADMIN_PASS || 'vinhdnah3608';

const MONGO_URI =
  process.env.MONGO_URI ||
  'mongodb+srv://admin:Vinhdnah1234@cluster0.sicvsav.mongodb.net/codehunter_db?retryWrites=true&w=majority&appName=Cluster0';

const MAX_CONCURRENT_BROWSERS = Number(process.env.MAX_CONCURRENT_BROWSERS || 2);
const REQUEST_QUEUE = [];
let ACTIVE_WORKERS = 0;

// ---- Mongo: fail-fast + pool ----
mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
})
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

mongoose.connection.on('disconnected', () => console.warn('⚠️ Mongo disconnected'));
mongoose.connection.on('reconnected', () => console.log('✅ Mongo reconnected'));

// --- Schemas ---
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true, index: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 0, index: true },
  history: [{ date: { type: Date, default: Date.now }, url: String, result: String }]
}, { timestamps: true });

const GiftcodeSchema = new mongoose.Schema({
  code: { type: String, unique: true, index: true },
  amount: Number,
  isUsed: { type: Boolean, default: false, index: true }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Giftcode = mongoose.model('Giftcode', GiftcodeSchema);

// --- Helpers ---
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function withTimeout(promise, ms, msg = 'Timeout') {
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(msg)), ms); });
  return Promise.race([promise.finally(() => clearTimeout(t)), timeout]);
}

async function speedUpPage(page) {
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(60000);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const t = req.resourceType();
    const u = req.url();

    if (['image', 'font', 'media'].includes(t)) return req.abort();
    if (u.includes('googletagmanager') || u.includes('google-analytics')) return req.abort();

    req.continue();
  });
}

async function safeClick(page, selector, timeout = 6000) {
  try {
    await page.waitForSelector(selector, { visible: true, timeout });
    await page.click(selector);
    return true;
  } catch (_) {
    return false;
  }
}

function normalizeProxy(proxy) {
  const p = String(proxy || '').split(':').map(s => s.trim());
  if (p.length !== 4) return null;
  const [host, port, user, pass] = p;
  if (!host || !port || !user || !pass) return null;
  return { host, port, user, pass };
}

async function solveAudioCaptcha(audioUrl, apiKey) {
  try {
    const response = await axios.post(
      CAPTCHA_API_URL,
      { key: apiKey, type: 'speechtotext', body: audioUrl },
      { timeout: 30000, validateStatus: () => true }
    );
    return (response.data && response.data.success) ? response.data.captcha : null;
  } catch (_) {
    return null;
  }
}

// ✅ AUTH: không crash nếu thiếu header
const auth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) throw new Error('missing token');

    const decoded = jwt.verify(token, SECRET_KEY);
    const user = await User.findById(decoded._id).select('username balance');
    if (!user) throw new Error('no user');

    req.user = user;
    next();
  } catch (_) {
    res.status(401).send({ success: false, message: 'Vui lòng đăng nhập lại!' });
  }
};

// --- Browser args: anti-leak + ổn định container ---
const getBrowserArgs = (ip, port) => [
  `--proxy-server=http://${ip}:${port}`,
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--no-zygote',
  '--disable-gpu',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-features=TranslateUI',

  '--disable-webrtc',
  '--disable-features=WebRtcHideLocalIpsWithMdns',
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
];

// --- HEALTH + WARMUP (giảm sleep/cold start) ---
app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// Set SELF_URL = https://<your-backend-domain>
const SELF_URL = process.env.SELF_URL;
if (SELF_URL) {
  setInterval(() => {
    axios.get(`${SELF_URL}/health`).catch(() => {});
  }, 5 * 60 * 1000);
}

// --- AUTH ROUTES (NO CLOUDFLARE) ---
app.post('/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Thiếu username/password" });
    }
    if (await User.findOne({ username })) {
      return res.status(400).json({ success: false, message: "User đã tồn tại" });
    }

    const hashedPassword = await bcrypt.hash(password, 8);
    await new User({ username, password: hashedPassword }).save();

    return res.status(201).json({ success: true, message: "Đăng ký thành công!" });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) throw new Error("Thiếu username/password");

    const user = await User.findOne({ username }).select('username password balance');
    if (!user || !(await bcrypt.compare(password, user.password))) throw new Error("Sai tài khoản/mật khẩu");

    const token = jwt.sign({ _id: user._id.toString() }, SECRET_KEY);
    return res.json({ success: true, token, username: user.username, balance: user.balance });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

app.get('/user/me', auth, async (req, res) => {
  return res.json({ username: req.user.username, balance: req.user.balance });
});

// --- Giftcode ---
app.post('/user/giftcode', auth, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: "Thiếu code" });

    const gift = await Giftcode.findOneAndUpdate(
      { code, isUsed: false },
      { isUsed: true },
      { new: true }
    );
    if (!gift) return res.status(400).json({ success: false, message: "Code lỗi/đã dùng!" });

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $inc: { balance: gift.amount } },
      { new: true, select: 'balance' }
    );

    return res.json({ success: true, message: `Nạp +${gift.amount.toLocaleString()}đ`, balance: updated.balance });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/admin/generate-giftcode', async (req, res) => {
  try {
    const { adminPass, amount, quantity } = req.body;
    if (adminPass !== ADMIN_PASS) return res.status(403).json({ success: false, message: "Sai mật khẩu Admin!" });

    const a = parseInt(amount);
    const q = parseInt(quantity);
    if (!a || !q || q <= 0) return res.status(400).json({ success: false, message: "amount/quantity không hợp lệ" });

    const codes = [];
    for (let i = 0; i < q; i++) {
      codes.push({
        code: `VIP-${a / 1000}K-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        amount: a,
        isUsed: false
      });
    }

    await Giftcode.insertMany(codes, { ordered: false });
    return res.json({ success: true, message: `Đã tạo ${q} mã`, codes: codes.map(c => c.code) });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// --- CHECK PROXY (FAST: không dùng puppeteer) ---
app.post('/check-proxy', async (req, res) => {
  const { proxy } = req.body;
  try {
    const pr = normalizeProxy(proxy);
    if (!pr) throw new Error("Sai format IP:PORT:USER:PASS");

    const proxyUrl = `http://${encodeURIComponent(pr.user)}:${encodeURIComponent(pr.pass)}@${pr.host}:${pr.port}`;
    const agent = new HttpsProxyAgent(proxyUrl);

    const r = await axios.get('https://api.ipify.org?format=json', {
      httpsAgent: agent,
      timeout: 15000,
      validateStatus: () => true,
    });

    if (r.status !== 200 || !r.data?.ip) throw new Error(`Proxy lỗi (HTTP ${r.status})`);
    return res.json({ success: true, data: r.data });
  } catch (e) {
    return res.json({ success: false, message: "Lỗi Proxy: " + e.message });
  }
});

// --- QUEUE ---
async function processQueue() {
  while (ACTIVE_WORKERS < MAX_CONCURRENT_BROWSERS && REQUEST_QUEUE.length > 0) {
    const task = REQUEST_QUEUE.shift();
    ACTIVE_WORKERS++;
    task.execute()
      .catch(console.error)
      .finally(() => {
        ACTIVE_WORKERS--;
        processQueue();
      });
  }
}

// --- CHECK GAME ---
app.post('/check-game', auth, async (req, res) => {
  const { url, username, proxy, apiKey } = req.body;

  // ✅ Validate trước khi trừ tiền
  if (!url || !username || !proxy || !apiKey) {
    return res.json({ success: false, message: "Thiếu url/username/proxy/apiKey", balance: req.user.balance });
  }
  const pr = normalizeProxy(proxy);
  if (!pr) {
    return res.json({ success: false, message: "Proxy sai format (IP:PORT:USER:PASS)", balance: req.user.balance });
  }

  // ✅ Trừ tiền 1 lần (atomic)
  const userAfterCharge = await User.findOneAndUpdate(
    { _id: req.user._id, balance: { $gte: PRICE_PER_CHECK } },
    { $inc: { balance: -PRICE_PER_CHECK } },
    { new: true, select: 'balance' }
  );

  if (!userAfterCharge) {
    return res.json({ success: false, message: `❌ Hết tiền (${PRICE_PER_CHECK}đ)!`, balance: req.user.balance });
  }
  const currentBalance = userAfterCharge.balance;

  const task = {
    execute: async () => {
      let browser = null;
      let finalResult = "Lỗi không xác định";

      return await withTimeout((async () => {
        try {
          browser = await puppeteer.launch({
            headless: "new",
            executablePath: puppeteer.executablePath(),
            args: getBrowserArgs(pr.host, pr.port)
          });

          const page = await browser.newPage();
          await page.authenticate({ username: pr.user, password: pr.pass });

          await speedUpPage(page);

          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

          await page.waitForSelector('#ten_tai_khoan', { visible: true, timeout: 20000 });

          await page.evaluate((u) => {
            const i = document.querySelector('#ten_tai_khoan');
            if (i) {
              i.value = u;
              i.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }, username);

          // Popup
          try {
            await safeClick(page, '#kmBtn', 5000);
            await delay(500);
            await page.evaluate(() => {
              const el = document.querySelector('tr[data-ma="TAIAPP"], tr[data-ma="TAI APP"]');
              if (el) el.click();
            });
            await delay(500);
            await safeClick(page, '#kmClose', 4000);
          } catch (_) {}

          await page.evaluate(() => document.querySelector('#xacThucTaiDay')?.click());
          await delay(500);

          await page.evaluate(() => {
            const b = document.querySelector('#showAudioCaptcha');
            if (b && getComputedStyle(b).display !== 'none') b.click();
          });

          await safeClick(page, '#generateAudioCaptcha', 8000);

          // Lấy mp3 (cleanup listener)
          const audioUrl = await new Promise((resolve) => {
            const handler = (r) => {
              const u = r.url();
              if (u && u.includes('.mp3')) {
                page.off('response', handler);
                resolve(u);
              }
            };
            page.on('response', handler);

            setTimeout(() => {
              page.off('response', handler);
              resolve(null);
            }, 12000);
          });

          if (!audioUrl) throw new Error("Lỗi lấy MP3 (Có thể do mạng)");

          const code = await solveAudioCaptcha(audioUrl, apiKey);
          if (!code) throw new Error("Giải Captcha thất bại");

          await page.evaluate((v) => {
            const i = document.querySelector('#audioCaptchaInput');
            if (i) {
              i.value = v;
              i.dispatchEvent(new Event('input', { bubbles: true }));
              i.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, code);

          await delay(250);
          await safeClick(page, '#verifyAudioCaptcha', 8000);
          await delay(900);

          await safeClick(page, '#casinoSubmit', 8000);

          try {
            await page.waitForSelector('#formErrorPopup', { visible: true, timeout: 10000 });
            finalResult = await page.evaluate(() => document.querySelector('#formErrorMsg')?.innerText || "Có popup nhưng không đọc được msg");
          } catch (_) {
            finalResult = "Đã submit (Không thấy thông báo)";
          }

        } catch (err) {
          finalResult = err?.message || "Lỗi không xác định";
        } finally {
          if (browser) {
            try { await withTimeout(browser.close(), 8000, 'Close browser timeout'); } catch (_) {}
          }
        }
        return finalResult;
      })(), 90000, 'Timeout tổng check-game');
    }
  };

  const queuePromise = new Promise((resolve) => {
    REQUEST_QUEUE.push({ execute: async () => resolve(await task.execute()) });
  });

  processQueue();

  try {
    const resultMsg = await queuePromise;

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $push: { history: { url, result: resultMsg } } },
      { new: true, select: 'balance' }
    );

    return res.json({ success: true, message: resultMsg, balance: updated.balance });
  } catch (_) {
    return res.json({ success: false, message: "Lỗi xử lý", balance: currentBalance });
  }
});

app.listen(PORT, () => console.log(`🚀 Server chạy tại http://localhost:${PORT}`));
