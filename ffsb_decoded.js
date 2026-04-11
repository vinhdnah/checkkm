/**
 * FFSB REDESIGNED BY ANTIGRAVITY
 * Phiên bản đã được giải mã và cấu trúc lại từ ffsb.js gốc.
 * Chức năng: Tự động điền form, giải captcha, quản lý data người dùng.
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

    // --- XUẤT HÀM RA GLOBAL ĐỂ datadata.js GỌI TRỰC TIẾP ---
    window.__ffsb = {
        paste: loadDataFromClipboard,
        fill: autoFillForm,
        config: CONFIG
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
                showToast("📋 Đã nhận Data mới");
                autoFillForm();
            }
        } catch (e) {
            const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (saved) {
                currentUserData = JSON.parse(saved);
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

        // Bắt chước thao tác người dùng để vượt qua React/Vue/Angular
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
            const label = (el.placeholder || el.id || el.name || (el.labels && el.labels[0]?.innerText) || "").toLowerCase();

            // Ánh xạ dữ liệu
            if (/tên đăng nhập|username|user|account/i.test(label)) setInputValue(el, currentUserData.username);
            if (/mật khẩu(?! rút)|password|pass/i.test(label) && el.type === "password") setInputValue(el, currentUserData.pw);
            if (/mật khẩu rút|pin|withdraw/i.test(label)) setInputValue(el, currentUserData.wd);
            if (/họ\s*(?:và|&)\s*tên|full.?name|name/i.test(label)) setInputValue(el, currentUserData.name);
            if (/số điện thoại|phone|mobile|sdt/i.test(label)) setInputValue(el, currentUserData.phone);
            if (/số tài khoản|stk|bank.?number/i.test(label)) setInputValue(el, currentUserData.stk);
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
            </div>
            <div id="_ffsb_mini" style="display:none; cursor:pointer; background:#000; color:#fff; padding:10px 20px; border-radius:20px; font-weight:700; border:1px solid #333;">@vinhdnah1</div>
        `;
        document.body.appendChild(main);

        // Events
        document.getElementById('btn_paste').onclick = loadDataFromClipboard;
        document.getElementById('btn_game').onclick = autoFillForm;
        document.getElementById('btn_km').onclick = () => window.open('https://docs.google.com/spreadsheets/d/1p_XV4Oyapdtt1pjrf67_S2X9zaFiX2RnmY5fbD4BuXI/edit', '_blank');

        const content = document.getElementById('_ffsb_content');
        const mini = document.getElementById('_ffsb_mini');
        document.getElementById('btn_min').onclick = () => { content.style.display = 'none'; mini.style.display = 'block'; };
        mini.onclick = () => { content.style.display = 'block'; mini.style.display = 'none'; };

        fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => { document.getElementById('f_ip').innerText = "IP: " + d.ip; });
    }

    renderTool();
    solveCaptcha(); // Thử giải captcha khi load

})();
