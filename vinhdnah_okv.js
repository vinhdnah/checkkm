/**
 * VINHDNAH OKV - Based on ffsb_decoded.js
 * Phiên bản mở rộng: đọc api_otp từ data Base64 để kết nối nguồn thuê OTP của riêng bạn.
 * Thêm trường "api_otp" vào data là tool sẽ tự dùng để nhận OTP.
 */

(function () {
    'use strict';

    // --- CẤU HÌNH & HẰNG SỐ ---
    const CONFIG = {
        STORAGE_KEY: 'ffsb_v1',
        CAPTCHA_API_KEY: '88eaa33337d0e9e99f7e99491b743bd0',
        CAPTCHA_ENDPOINT: 'https://autocaptcha.pro/apiv3/process',
        MINI_AVATAR: '@vinhdnah1'
    };

    let currentUserData = null;
    let otpApiKey = null; // Sẽ được đọc từ trường api_otp trong Base64

    // --- XUẤT HÀM RA GLOBAL NGAY LẬP TỨC ---
    window.__ffsb = {
        paste: loadDataFromClipboard,
        fill: autoFillForm,
        config: CONFIG,
        getOtpApiKey: () => otpApiKey
    };

    // --- 1. HỆ THỐNG THÔNG BÁO (TOAST) ---
    function showToast(message, type = 'success') {
        let toast = document.getElementById('_ffsb_toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = '_ffsb_toast';
            document.body.appendChild(toast);
        }

        const icon = type === 'success' ? '⚡' : '❌';
        const color = type === 'success' ? '#00ff88' : '#ff4d4d';

        toast.style = `
            position:fixed; top:20px; right:20px; 
            background:rgba(25, 25, 35, 0.95); backdrop-filter: blur(12px); 
            color:#fff; padding:12px 20px; border-radius:16px; 
            z-index:99999999; font-weight:700; font-family:sans-serif; 
            transition: all 0.3s; border: 1px solid ${color};
            display: flex; align-items: center; gap: 10px; font-size: 13px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.4);
            transform: translateY(-50px); opacity: 0;
        `;

        toast.innerHTML = `<span style="font-size:18px">${icon}</span> <span>${message}</span>`;

        setTimeout(() => { toast.style.transform = 'translateY(0)'; toast.style.opacity = '1'; }, 10);
        setTimeout(() => {
            toast.style.transform = 'translateY(-50px)';
            toast.style.opacity = '0';
        }, 3000);
    }

    // --- 2. XỬ LÝ DỮ LIỆU (CLIPBOARD & STORAGE) ---
    async function loadDataFromClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            if (!text) {
                showToast("Clipboard trống!", "error");
                return;
            }

            // Giải mã Base64 (Xử lý Unicode tiếng Việt)
            const decoded = decodeURIComponent(escape(window.atob(text.trim())));
            const data = JSON.parse(decoded);

            if (data.username || data.name) {
                currentUserData = data;
                localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));

                // ── ĐỌC API OTP TỪ DATA ──────────────────────────────
                // Thêm trường "api_otp" vào data Base64 là tool sẽ tự dùng
                if (data.api_otp && data.api_otp.trim()) {
                    otpApiKey = data.api_otp.trim();
                    showToast("📋 Đã nhận Data + API OTP");
                    // Ghi ra global để AIO.js hoặc các script khác dùng
                    window.__aio_otp_api_key = otpApiKey;
                } else {
                    otpApiKey = null;
                    window.__aio_otp_api_key = null;
                    showToast("📋 Đã nhận Data mới (không có API OTP)");
                }

                autoFillForm();
            }
        } catch (e) {
            const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (saved) {
                currentUserData = JSON.parse(saved);
                // Khôi phục api_otp nếu có
                if (currentUserData.api_otp) {
                    otpApiKey = currentUserData.api_otp;
                    window.__aio_otp_api_key = otpApiKey;
                }
                showToast("📂 Dùng Data cũ");
                autoFillForm();
            } else {
                showToast("Dữ liệu không hợp lệ", "error");
            }
        }
    }

    // --- 3. CÔNG CỤ TỰ ĐỘNG ĐIỀN FORM ---
    function setInputValue(input, value) {
        if (!input || value === undefined || value === null) return;

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(input, value);
        } else {
            input.value = value;
        }

        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.blur();
    }

    function autoFillForm() {
        if (!currentUserData) return;

        const inputs = document.querySelectorAll('input, textarea, select');
        inputs.forEach(el => {
            const labelStr = `${el.placeholder || ""} ${el.id || ""} ${el.name || ""} ${(el.labels && el.labels[0]?.innerText) || ""}`.toLowerCase();
            const type = (el.type || "").toLowerCase();

            // 1. Tên đăng nhập
            if (/tên đăng nhập|tên người dùng|username|user|account/i.test(labelStr)) {
                setInputValue(el, currentUserData.username);
            }
            // 2. Mật khẩu
            else if (/mật khẩu(?! rút)|password|pass/i.test(labelStr)) {
                if (type === "password" || type === "text") {
                    setInputValue(el, currentUserData.pw);
                }
            }
            // 3. Mật khẩu rút
            else if (/mật khẩu rút|pin|withdraw/i.test(labelStr)) {
                setInputValue(el, currentUserData.wd);
            }
            // 4. Họ và tên
            else if (/họ\s*(?:và|&)\s*tên|full.?name|name|payeename/i.test(labelStr)) {
                setInputValue(el, currentUserData.name);
            }
            // 5. Số điện thoại
            else if (/số điện thoại|phone|mobile|sdt|sđt|mobilenum/i.test(labelStr)) {
                let phoneVal = String(currentUserData.phone || "").trim();
                if (phoneVal.startsWith('+84')) phoneVal = '0' + phoneVal.slice(3);
                else if (phoneVal.startsWith('84') && phoneVal.length >= 11) phoneVal = '0' + phoneVal.slice(2);

                let p = el.parentElement;
                let hasCountryCode = false;
                for (let i = 0; i < 3; i++) {
                    if (p) {
                        let text = p.textContent || p.innerText || "";
                        if (text.includes('+84') || text.match(/\b84\b/)) { hasCountryCode = true; break; }
                        p = p.parentElement;
                    }
                }
                if (hasCountryCode && phoneVal.startsWith('0')) phoneVal = phoneVal.substring(1);
                setInputValue(el, phoneVal);
            }
            // 6. Số tài khoản
            else if (/số tài khoản|stk|bank.?number/i.test(labelStr)) {
                setInputValue(el, currentUserData.stk);
            }
        });

        showToast("✅ Auto-Fill Xong!");
    }

    // --- 4. GIẢI CAPTCHA ---
    async function solveCaptcha() {
        const captchaImg = document.querySelector('img[src*="captcha"], img[id*="captcha"]');
        const captchaInput = document.querySelector('input[placeholder*="mã"], input[name*="captcha"]');
        if (!captchaImg || !captchaInput) return;
        showToast("⏳ Đang giải Captcha...");
        try {
            const canvas = document.createElement('canvas');
            canvas.width = captchaImg.naturalWidth;
            canvas.height = captchaImg.naturalHeight;
            canvas.getContext('2d').drawImage(captchaImg, 0, 0);
            const base64 = canvas.toDataURL('image/jpeg').split(',')[1];
            const res = await fetch(CONFIG.CAPTCHA_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: CONFIG.CAPTCHA_API_KEY, type: "imagetotext", body: base64 })
            });
            const result = await res.json();
            if (result.success) {
                setInputValue(captchaInput, result.captcha);
                showToast("✅ Giải Captcha xong!");
            }
        } catch (e) {
            showToast("Lỗi giải captcha", "error");
        }
    }

    // --- 5. GIAO DIỆN ---
    function renderTool() {
        if (document.getElementById('_ffsb')) return;

        const main = document.createElement('div');
        main.id = '_ffsb';
        main.style = `position:fixed; top:10px; left:50%; transform:translateX(-50%); z-index:9999999;`;

        const style = document.createElement('style');
        style.textContent = `
            #_ffsb_content { 
                background:rgba(15, 15, 25, 0.9); backdrop-filter:blur(15px); 
                border:1px solid rgba(255,255,255,0.1); padding:15px; border-radius:15px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.5); min-width:320px;
            }
            .f-btn { 
                width:100%; padding:12px; margin:5px 0; border:none; border-radius:8px; 
                cursor:pointer; font-weight:700; color:#fff; transition:0.2s;
            }
            .f-btn:active { transform: scale(0.95); }
            .bg-green { background: #2ecc71; }
            .bg-red { background: #e74c3c; }
            .bg-blue { background: #3498db; }
            .bg-gray { background: #555; }
            #_ffsb_otp_status {
                margin-top: 6px; font-size: 11px; text-align: center;
                color: #aaa; font-family: monospace;
            }
        `;
        document.head.appendChild(style);

        main.innerHTML = `
            <div id="_ffsb_content">
                <div style="display:flex; gap:10px;">
                    <button id="btn_game" class="f-btn bg-green">GAME</button>
                    <button id="btn_paste" class="f-btn bg-red">PASTE</button>
                </div>
                <button id="btn_km" class="f-btn bg-blue">🌐 TRANG KM</button>
                <button id="btn_min" class="f-btn bg-gray">Thu Nhỏ</button>
                <div id="f_ip" style="text-align:center; font-size:10px; color:#aaa; margin-top:5px;">IP: ...</div>
                <div id="_ffsb_otp_status">API OTP: chưa có</div>
            </div>
            <div id="_ffsb_mini" style="display:none; cursor:pointer; background:#000; color:#fff; padding:10px 20px; border-radius:20px; font-weight:700; border:1px solid #333;">@vinhdnah1</div>
        `;
        document.body.appendChild(main);

        // Events
        document.getElementById('btn_paste').onclick = async () => {
            await loadDataFromClipboard();
            // Cập nhật trạng thái API OTP sau khi paste
            const statusEl = document.getElementById('_ffsb_otp_status');
            if (statusEl) {
                statusEl.innerText = otpApiKey
                    ? `API OTP: ✅ ${otpApiKey.substring(0, 12)}...`
                    : 'API OTP: chưa có';
                statusEl.style.color = otpApiKey ? '#00ff88' : '#aaa';
            }
        };
        document.getElementById('btn_game').onclick = autoFillForm;
        document.getElementById('btn_km').onclick = () => window.open('https://docs.google.com/spreadsheets/d/1p_XV4Oyapdtt1pjrf67_S2X9zaFiX2RnmY5fbD4BuXI/edit', '_blank');

        const content = document.getElementById('_ffsb_content');
        const mini = document.getElementById('_ffsb_mini');
        document.getElementById('btn_min').onclick = () => { content.style.display = 'none'; mini.style.display = 'block'; };
        mini.onclick = () => { content.style.display = 'block'; mini.style.display = 'none'; };

        fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => { document.getElementById('f_ip').innerText = "IP: " + d.ip; });
    }

    // --- KHỞI CHẠY ---
    function init() {
        renderTool();
        solveCaptcha();
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
        window.addEventListener('load', init);
    }

})();
