// server.js - FINAL FIX: PROXY PROTOCOL & WEBRTC LEAK
const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

app.use(cors({
  origin: ['https://checkkm.vercel.app'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Fix cho Express 5 (không dùng '*')
app.options(/.*/, cors());


app.use(bodyParser.json());

// --- CẤU HÌNH ---
const PORT = process.env.PORT || 3000;

const SECRET_KEY = 'codehunter_vip_secret_key_2024'; 
const PRICE_PER_CHECK = 80;
const CAPTCHA_API_URL = 'https://autocaptcha.pro/apiv3/process';
const ADMIN_PASS = "vinhdnah3608"; 

// Database & Cloudflare
const MONGO_URI = 'mongodb+srv://admin:Vinhdnah1234@cluster0.sicvsav.mongodb.net/codehunter_db?retryWrites=true&w=majority&appName=Cluster0';
const CF_SECRET_KEY = '0x4AAAAAACKI1MYfHe8xvnyQ0rLl7axANsI'; 

const MAX_CONCURRENT_BROWSERS = 2;
const REQUEST_QUEUE = [];
let ACTIVE_WORKERS = 0;

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Đã kết nối MongoDB Cloud'))
    .catch(err => console.error('❌ Lỗi DB:', err));

// --- SCHEMAS ---
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0 },
    history: [{ date: { type: Date, default: Date.now }, url: String, result: String }]
});
const GiftcodeSchema = new mongoose.Schema({
    code: { type: String, unique: true },
    amount: Number,
    isUsed: { type: Boolean, default: false }
});

const User = mongoose.model('User', UserSchema);
const Giftcode = mongoose.model('Giftcode', GiftcodeSchema);

// --- HELPER ---
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function solveAudioCaptcha(audioUrl, apiKey) {
    try {
        const response = await axios.post(CAPTCHA_API_URL, { key: apiKey, type: 'speechtotext', body: audioUrl });
        return (response.data && response.data.success) ? response.data.captcha : null;
    } catch (e) { return null; }
}

async function verifyCloudflare(token) {
    if (!token) return false;
    try {
        const formData = new URLSearchParams();
        formData.append('secret', CF_SECRET_KEY);
        formData.append('response', token);
        const res = await axios.post('https://challenges.cloudflare.com/turnstile/v0/siteverify', formData);
        return res.data.success;
    } catch (e) { return false; }
}

const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization').replace('Bearer ', '');
        const decoded = jwt.verify(token, SECRET_KEY);
        const user = await User.findById(decoded._id);
        if (!user) throw new Error();
        req.user = user;
        next();
    } catch (e) { res.status(401).send({ success: false, message: 'Vui lòng đăng nhập lại!' }); }
};

// --- CONFIG BROWSER CHUẨN ĐỂ KHÔNG LEAK IP ---
const getBrowserArgs = (ip, port) => [
    `--proxy-server=http://${ip}:${port}`, // [QUAN TRỌNG] Thêm http://
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    // --- CHẶN LEAK IP QUA WEBRTC ---
    '--disable-webrtc', 
    '--disable-features=WebRtcHideLocalIpsWithMdns',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'
];

// --- ROUTES AUTH & USER ---
app.post('/auth/register', async (req, res) => {
    try {
        const { username, password, cfToken } = req.body;
        if (!await verifyCloudflare(cfToken)) return res.status(400).json({ success: false, message: "❌ Xác thực Cloudflare thất bại!" });
        if (await User.findOne({ username })) return res.status(400).json({ success: false, message: "User đã tồn tại" });
        const hashedPassword = await bcrypt.hash(password, 8);
        await new User({ username, password: hashedPassword }).save();
        res.status(201).json({ success: true, message: "Đăng ký thành công!" });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

app.post('/auth/login', async (req, res) => {
    try {
        const { username, password, cfToken } = req.body;
        if (!await verifyCloudflare(cfToken)) return res.status(400).json({ success: false, message: "❌ Xác thực Cloudflare thất bại!" });
        const user = await User.findOne({ username });
        if (!user || !(await bcrypt.compare(password, user.password))) throw new Error("Sai tài khoản/mật khẩu");
        const token = jwt.sign({ _id: user._id.toString() }, SECRET_KEY);
        res.json({ success: true, token, username: user.username, balance: user.balance });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

app.get('/user/me', auth, async (req, res) => { res.json({ username: req.user.username, balance: req.user.balance }); });

app.post('/user/giftcode', auth, async (req, res) => {
    try {
        const { code } = req.body;
        const gift = await Giftcode.findOneAndUpdate(
            { code: code, isUsed: false },
            { isUsed: true },
            { new: true }
        );
        if (!gift) return res.status(400).json({ success: false, message: "Code lỗi/đã dùng!" });
        
        req.user.balance += gift.amount;
        await req.user.save();
        res.json({ success: true, message: `Nạp +${gift.amount.toLocaleString()}đ`, balance: req.user.balance });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/admin/generate-giftcode', async (req, res) => {
    try {
        const { adminPass, amount, quantity } = req.body;
        if (adminPass !== ADMIN_PASS) return res.status(403).json({ success: false, message: "Sai mật khẩu Admin!" });
        
        const codes = [];
        for (let i = 0; i < quantity; i++) {
            codes.push({
                code: `VIP-${amount/1000}K-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
                amount: parseInt(amount),
                isUsed: false
            });
        }
        await Giftcode.insertMany(codes);
        res.json({ success: true, message: `Đã tạo ${quantity} mã`, codes: codes.map(c => c.code) });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// --- API CHECK PROXY (ĐÃ FIX) ---
app.post('/check-proxy', async (req, res) => {
    const { proxy } = req.body;
    let browser = null;
    try {
        // Cắt chuỗi và xóa khoảng trắng thừa
        const p = proxy.split(':').map(str => str.trim()); 
        if (p.length !== 4) throw new Error("Sai format IP:PORT:USER:PASS");

        // Sử dụng cấu hình chuẩn
        browser = await puppeteer.launch({ 
            headless: "new", 
            args: getBrowserArgs(p[0], p[1])
        });

        const page = await browser.newPage();
        await page.authenticate({ username: p[2], password: p[3] });
        
        // Tăng timeout lên 30s để kịp load proxy
        await page.goto('http://ip-api.com/json', { timeout: 30000 });
        const content = await page.evaluate(() => document.body.innerText);
        await browser.close();
        res.json({ success: true, data: JSON.parse(content) });
    } catch (e) {
        if(browser) await browser.close();
        res.json({ success: false, message: "Lỗi Proxy: " + e.message });
    }
});

// --- QUEUE & GAME LOGIC (ĐÃ FIX) ---
const processQueue = async () => {
    if (ACTIVE_WORKERS >= MAX_CONCURRENT_BROWSERS || REQUEST_QUEUE.length === 0) return;
    const task = REQUEST_QUEUE.shift();
    ACTIVE_WORKERS++;
    try { await task.execute(); } catch (e) { console.error(e); } finally { ACTIVE_WORKERS--; processQueue(); }
};

app.post('/check-game', auth, async (req, res) => {
    if (req.user.balance < PRICE_PER_CHECK) return res.json({ success: false, message: "❌ Hết tiền (80đ)!", balance: req.user.balance });
    
    // Lấy dữ liệu ngay lập tức
    const { url, username, proxy, apiKey } = req.body;

    req.user.balance -= PRICE_PER_CHECK;
    await req.user.save();
    const currentBalance = req.user.balance;

    const task = {
        execute: async () => {
            let browser = null, finalResult = "Lỗi không xác định";
            try {
                // Xử lý chuỗi proxy
                const p = proxy.split(':').map(str => str.trim());
                
                // Khởi tạo browser với cấu hình chặn leak IP
                browser = await puppeteer.launch({ 
                    headless: "new", 
                    args: getBrowserArgs(p[0], p[1])
                });

                const page = await browser.newPage();
                await page.authenticate({ username: p[2], password: p[3] });
                page.setDefaultNavigationTimeout(60000);

                // --- BẮT ĐẦU VÀO GAME ---
                await page.goto(url, { waitUntil: 'domcontentloaded' });
                await delay(2000);
                
                await page.waitForSelector('#ten_tai_khoan', {timeout: 10000});
                await page.evaluate((u) => {
                    const i = document.querySelector('#ten_tai_khoan');
                    if(i){ i.value = u; i.dispatchEvent(new Event('input')); }
                }, username);

                // Popup Logic
                try {
                    await page.waitForSelector('#kmBtn', {timeout: 5000, visible:true});
                    await page.evaluate(()=>document.querySelector('#kmBtn').click());
                    await delay(1000);
                    await page.evaluate(()=> { const el = document.querySelector('tr[data-ma="TAIAPP"], tr[data-ma="TAI APP"]'); if(el) el.click(); });
                    await delay(1000);
                    await page.evaluate(()=>document.querySelector('#kmClose')?.click());
                } catch(e){}

                await page.evaluate(()=>document.querySelector('#xacThucTaiDay')?.click());
                await delay(1000);

                await page.evaluate(()=> { const b = document.querySelector('#showAudioCaptcha'); if(b && getComputedStyle(b).display!=='none') b.click(); });
                await page.waitForSelector('#generateAudioCaptcha', {visible:true, timeout:5000});
                await page.evaluate(()=>document.querySelector('#generateAudioCaptcha').click());

                // Lấy Audio
                let audioUrl = null;
                const mp3Promise = new Promise(r => {
                    const l = res => { if (res.url().includes('.mp3')) { page.off('response', l); r(res.url()); }};
                    page.on('response', l);
                });
                audioUrl = await Promise.race([mp3Promise, new Promise(r => setTimeout(() => r(null), 10000))]);
                if (!audioUrl) throw new Error("Lỗi lấy MP3 (Có thể do mạng)");

                // Giải Captcha
                const code = await solveAudioCaptcha(audioUrl, apiKey);
                if (!code) throw new Error("Giải Captcha thất bại");

                await page.evaluate((v) => {
                    const i = document.querySelector('#audioCaptchaInput');
                    if(i){ i.value = v; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); }
                }, code);
                await delay(500);
                await page.evaluate(()=>document.querySelector('#verifyAudioCaptcha')?.click());
                await delay(2000);

                // Submit
                await page.evaluate(()=>document.querySelector('#casinoSubmit')?.click());
                try {
                    await page.waitForSelector('#formErrorPopup', {visible:true, timeout:10000});
                    finalResult = await page.evaluate(()=>document.querySelector('#formErrorMsg').innerText);
                } catch(e) { finalResult = "Đã submit (Không thấy thông báo)"; }

            } catch (err) { finalResult = err.message; }
            finally { if (browser) await browser.close(); }
            return finalResult;
        }
    };

    const queuePromise = new Promise((resolve) => {
        REQUEST_QUEUE.push({ execute: async () => { resolve(await task.execute()); } });
    });
    processQueue();

    try {
        const resultMsg = await queuePromise;
        const freshUser = await User.findById(req.user._id);
        freshUser.history.push({ url: req.body.url, result: resultMsg });
        await freshUser.save();
        res.json({ success: true, message: resultMsg, balance: freshUser.balance });
    } catch (e) {
        res.json({ success: false, message: "Lỗi xử lý", balance: currentBalance });
    }
});

app.listen(PORT, () => console.log(`🚀 Server chạy tại http://localhost:${PORT}`));