// ==UserScript==
// @name         AIO OkVip - Auto Fill & OTP
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Tích hợp thuê sim tự động điền form Codesim.net riêng cho OkVip (Base FFSB)
// @author       Vinhdnah1
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @connect      cdn.jsdelivr.net
// @connect      hupsms.com
// ==/UserScript==

(function () {
    'use strict';

    // Ngăn chặn việc tự động chạy khi F5 (Reset cờ chạy ngầm từ phiên trước)
    GM_setValue('aio_running', false);

    window.__START_MINIMIZED = true;
    const SCRIPT_UI_URL = "https://raw.githubusercontent.com/vinhdnah/checkkm/refs/heads/main/ffsb_decoded.js?v=" + Date.now();

    const API_URL = "https://hupsms.com";
    let currentSimId = GM_getValue('aio_currentSimId', null);
    let currentOtpId = GM_getValue('aio_currentOtpId', null);
    let rentedPhone = GM_getValue('aio_rentedPhone', null);
    let aioStep = GM_getValue('aio_step', '');
    let otpCheckInterval = null;

    let savedBase64 = GM_getValue('vinhdnah1_base64_data_aio', '');
    let hookActive = false;
    let hookReadCount = 0;

    // ──────────────────────────────────────────────
    // 1. HELPERS DATA (TỪ BẢN ALL.JS GỐC)
    // ──────────────────────────────────────────────
    function toLocalVNPhone(val) {
        let v = String(val).trim().replace(/[\s\-\.]/g, '');
        if (/^\+84/.test(v)) return v.substring(3);
        if (/^84\d{9}$/.test(v)) return v.substring(2);
        if (/^0\d{9,10}$/.test(v)) return v.substring(1);
        return v;
    }

    function decodeData(b64) {
        try { return JSON.parse(decodeURIComponent(escape(window.atob(b64.trim())))); }
        catch (e) { return null; }
    }

    function findFieldSafe(obj, excludeSubstrings, ...keywords) {
        for (let key of Object.keys(obj)) {
            if (keywords.includes(key.toLowerCase())) return String(obj[key] || '').trim();
        }
        for (let key of Object.keys(obj)) {
            let lk = key.toLowerCase();
            if (excludeSubstrings.some(ex => lk.includes(ex))) continue;
            if (keywords.some(kw => lk.includes(kw))) return String(obj[key] || '').trim();
        }
        return '';
    }

    // Hook clipboard để truyền dữ liệu chuẩn cho ffsb gốc 
    const originalClipboardRead = navigator.clipboard.readText;
    navigator.clipboard.readText = async function () {
        if (hookActive && savedBase64) {
            hookReadCount++;
            if (hookReadCount >= 5) { hookActive = false; hookReadCount = 0; }
            return savedBase64; // savedBase64 này sẽ được cập nhật SĐT mới trước khi gọi
        }
        return originalClipboardRead ? originalClipboardRead.apply(this, arguments) : "";
    };

    // Ẩn UI gốc của ffsb
    const hideCss = document.createElement('style');
    hideCss.innerHTML = `#_ffsb, #_ffsb_mini, #_ffsb_content { display: none !important; opacity: 0 !important; pointer-events: none !important; z-index: -9999 !important; }`;
    document.head.appendChild(hideCss);

    function showBubble(msg, isError = false) {
        let bubble = document.getElementById('aio_speech_bubble');
        let textNode = document.getElementById('aio_speech_text');
        if (bubble && textNode) {
            textNode.innerText = msg;
            bubble.style.color = isError ? '#ff4d4d' : '#0cebeb';
            bubble.style.borderColor = isError ? '#ff4d4d' : '#0cebeb';
            bubble.style.boxShadow = isError ? '0 0 10px rgba(255,77,77,0.5)' : '0 0 10px rgba(12,235,235,0.5)';
            bubble.querySelector('.bubble-arrow-border').style.borderLeftColor = isError ? '#ff4d4d' : '#0cebeb';

            bubble.style.display = 'block';
            bubble.style.opacity = '1';
            bubble.style.transform = 'translateY(0) scale(1)';

            clearTimeout(window._aio_bubble_timeout);
            window._aio_bubble_timeout = setTimeout(() => {
                bubble.style.opacity = '0';
                bubble.style.transform = 'translateY(-10px) scale(0.9)';
                setTimeout(() => bubble.style.display = 'none', 300);
            }, 3000);
        } else {
            console.log("AIO Message:", msg);
        }
    }

    function setNativeValue(el, value) {
        if (!el) return;
        const nativeSetter = Object.getOwnPropertyDescriptor(
            el.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype, 'value'
        ).set;

        el.focus();
        nativeSetter.call(el, value);

        let kbOpts = { bubbles: true, cancelable: true, key: 'a', code: 'KeyA' };
        el.dispatchEvent(new KeyboardEvent('keydown', kbOpts));
        el.dispatchEvent(new KeyboardEvent('keypress', kbOpts));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', kbOpts));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        el.blur();
    }

    function safeClick(el) {
        if (!el) return;
        try {
            let r = el.getBoundingClientRect();
            let o = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
            ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(t => el.dispatchEvent(new MouseEvent(t, o)));
            el.click();
        } catch (e) { }
    }

    // Inject code vào page context (bypass Tampermonkey sandbox) để access Vue internals
    function runInPage(code) {
        let s = document.createElement('script');
        s.textContent = '(function(){' + code + '})()';
        document.documentElement.appendChild(s);
        s.remove();
    }

    // Bấm nút Back mỗi 250ms cho đến khi URL chứa targetPath, rồi chạy callback
    function navigateBackTo(targetPath, callback) {
        if (window.location.pathname.includes(targetPath)) {
            setTimeout(callback, 200);
            return;
        }
        showBubble('Đang quay về ' + targetPath + '...');
        let maxTries = 40, tries = 0;
        let iv = setInterval(() => {
            if (window.location.pathname.includes(targetPath)) {
                clearInterval(iv);
                setTimeout(callback, 400);
                return;
            }
            if (++tries > maxTries) {
                clearInterval(iv);
                showBubble('Không thể quay về ' + targetPath, true);
                return;
            }
            runInPage(`
                var back = document.querySelector('.lobby-base-header__back') || document.querySelector('.ui-arrow--left');
                if (back) {
                    var evOpts = {bubbles:true, cancelable:true};
                    back.dispatchEvent(new Event('touchstart', evOpts));
                    back.dispatchEvent(new PointerEvent('pointerdown', evOpts));
                    back.dispatchEvent(new MouseEvent('mousedown', evOpts));
                    back.dispatchEvent(new Event('touchend', evOpts));
                    back.dispatchEvent(new PointerEvent('pointerup', evOpts));
                    back.dispatchEvent(new MouseEvent('mouseup', evOpts));
                    back.dispatchEvent(new MouseEvent('click', evOpts));
                    back.click();
                }
            `);
        }, 250);
    }

    async function typeCharByChar(inputEl, text) {
        if (!inputEl) return;
        inputEl.focus();
        let currentVal = '';
        for (let i = 0; i < text.length; i++) {
            currentVal += text[i];
            setNativeValue(inputEl, currentVal);
            await new Promise(r => setTimeout(r, 60)); // gõ từng chữ độ trễ 60ms
        }
        inputEl.blur();
    }

    // ──────────────────────────────────────────────
    // 2. FILL OKVIP LOGIC
    // ──────────────────────────────────────────────
    async function fillOkVip(dataObj, rentedPhone) {
        let accInput = document.querySelector('input[data-input-name="account"]');
        let passInput = document.querySelector('input[data-input-name="userpass"]');
        let realNameInput = document.querySelector('input[data-input-name="realName"]');
        let phoneInput = document.querySelector('input[data-input-name="phone"]');

        let username = findFieldSafe(dataObj, [], 'user', 'account', 'login', 'playerid', 'username', 'tk');
        let password = findFieldSafe(dataObj, [], 'pass', 'password', 'pwd', 'matkhau', 'mk', 'pw');
        let fullname = findFieldSafe(dataObj, ['user', 'account', 'login', 'pass', 'pwd', 'phone', 'mail'],
            'name', 'hoten', 'ho_ten', 'hovaten', 'fullname', 'realname', 'ten');

        if (accInput && username) setNativeValue(accInput, username);
        if (passInput && password) setNativeValue(passInput, password);

        if (phoneInput && rentedPhone) {
            let localPhone = rentedPhone.replace(/^0+/, ''); // bỏ số 0 ở đầu
            setNativeValue(phoneInput, localPhone);
        }

        if (realNameInput && fullname) {
            showBubble("Đang gõ tay từng ký tự: " + fullname);
            await typeCharByChar(realNameInput, fullname);
        }

        showBubble("Hoạt động điền Form OkVip hoàn tất! Đang gửi biểu mẫu...");
        await new Promise(r => setTimeout(r, 500));

        runInPage(`
            var btn = document.getElementById('insideRegisterSubmitClick');
            if (!btn) {
                var spans = document.querySelectorAll('.ui-button__text');
                for (var i = 0; i < spans.length; i++) {
                    var txt = spans[i].innerText.trim().toUpperCase();
                    if (txt === 'ĐĂNG KÝ' || txt === 'ĐĂNG KÍ') {
                        btn = spans[i].closest('button');
                        break;
                    }
                }
            }
            if (btn) {
                var evOpts = {bubbles:true, cancelable:true};
                btn.dispatchEvent(new Event('touchstart', evOpts));
                btn.dispatchEvent(new PointerEvent('pointerdown', evOpts));
                btn.dispatchEvent(new MouseEvent('mousedown', evOpts));
                btn.dispatchEvent(new Event('touchend', evOpts));
                btn.dispatchEvent(new PointerEvent('pointerup', evOpts));
                btn.dispatchEvent(new MouseEvent('mouseup', evOpts));
                btn.dispatchEvent(new MouseEvent('click', evOpts));
                btn.click();
            }
        `);
    }

    // ──────────────────────────────────────────────
    // 3. API CALL LOGICS (HupSMS)
    // ──────────────────────────────────────────────
    function requestBalance(apiKey, cb) {
        // HupSMS rent trả về balance trong respond, tạm pass bước check số dư đầu để ưu tiên speed
        cb(null, 99999);
    }

    function requestPhone(apiKey, networkId, cb) {
        let url = `https://hupsms.com/api/v1/rent?api_key=${apiKey}&serviceId=2288`;
        GM_xmlhttpRequest({
            method: "GET",
            url: url,
            onload: function (res) {
                try {
                    let data = JSON.parse(res.responseText);
                    if (data.status === "success" && data.data) {
                        cb(null, {
                            id: data.data.orderId,
                            simId: data.data.orderId,
                            idOtp: data.data.orderId,
                            phone: data.data.phone
                        });
                    } else {
                        cb(data.message || 'Lỗi thuê sim HupSMS', null);
                    }
                } catch (e) { cb('Lỗi mạng lưới HupSMS', null); }
            }
        });
    }

    function requestOtp(apiKey, otpId, cb) {
        GM_xmlhttpRequest({
            method: "GET",
            url: `https://hupsms.com/api/v1/check/${otpId}?api_key=${apiKey}`,
            onload: function (res) {
                try {
                    let data = JSON.parse(res.responseText);
                    if (data.status === "success" && data.data) {
                        if (data.data.status === "success" && data.data.otp) {
                            cb(null, data.data.otp);
                        } else {
                            cb('Đang chờ', null);
                        }
                    } else { cb('Đang chờ', null); }
                } catch (e) { cb('Lỗi kiểm tra OTP', null); }
            }
        });
    }

    function cancelSim(apiKey, simId, cb) {
        GM_xmlhttpRequest({
            method: "GET",
            url: `https://hupsms.com/api/v1/cancel/${simId}?api_key=${apiKey}`,
            onload: function (res) { cb(); }
        });
    }

    // ──────────────────────────────────────────────
    // 4. GIAO DIỆN UI NỔI 
    // ──────────────────────────────────────────────
    function buildCustomUI() {
        if (document.getElementById('vinhdnah1_aio_ui')) return;

        // ... Các phần CSS ...
        const cyberCss = document.createElement('style');
        cyberCss.innerHTML = `
            .cyber-avatar-aio { border: 2px solid #00f3ff!important; border-radius: 50%; background-size: cover; background-position: center; cursor: pointer; user-select: none; transition: transform 0.2s; box-shadow: 0 0 10px rgba(0,243,255,0.5); }
            .cyber-avatar-aio:hover { transform: scale(1.05); }
            .cyber-menu-aio { background: rgba(15, 23, 42, 0.98)!important; border: 1px solid rgba(255, 255, 255, 0.1)!important; box-shadow: 0 4px 15px rgba(0,0,0,0.5)!important; border-radius: 10px!important; transition: opacity 0.2s ease!important; }
            .cyber-menu-aio.open { opacity: 1!important; pointer-events: auto!important; }
            .cyber-menu-aio.closed { opacity: 0!important; pointer-events: none!important; transform: translateY(-10px) scale(0.98)!important; }
            .cyber-input-aio { background: #1e293b!important; border: 1px solid #334155!important; color: #fff!important; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11px; padding: 6px 8px; box-sizing: border-box; outline: none; transition: border-color 0.2s!important; width: 100%; border-radius: 4px; margin-top:5px; }
            .cyber-input-aio:focus { border-color: #38bdf8!important; }
            .cyber-btn-aio { width: 100%; padding: 8px; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; transition: background 0.2s!important; margin-top: 8px; font-size: 11px; text-transform: uppercase; color:#fff; }
            .cyber-btn-aio:hover { filter: brightness(1.1); }
            .cyber-title-aio { color: #38bdf8; font-size: 13px; font-weight: bold; text-align: center; margin-bottom: 10px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;}
        `;
        document.head.appendChild(cyberCss);

        const uiContainer = document.createElement("div");
        uiContainer.id = "vinhdnah1_aio_ui";
        uiContainer.className = "cyber-avatar-aio";
        uiContainer.style.position = "fixed";
        uiContainer.style.top = "140px"; // Đặt dưới icon ALL IN ONE cũ
        uiContainer.style.right = "12px";
        uiContainer.style.width = "58px";
        uiContainer.style.height = "58px";
        uiContainer.style.backgroundImage = "url('https://sloganhay.com/wp-content/uploads/2026/03/avatar-anime-nam-ngau-10.jpg')";
        uiContainer.style.zIndex = "999999";
        uiContainer.style.filter = "drop-shadow(0 0 5px #00f3ff)";

        const badge = document.createElement("div");
        badge.style = "position:absolute; bottom:-22px; left:50%; transform:translateX(-50%); color:#00f3ff; font-size:11px; font-weight:bold; white-space:nowrap; text-shadow:0 1px 4px #000; pointer-events:none; transition:color 0.3s;";
        badge.innerText = "AIO OKVIP";
        uiContainer.appendChild(badge);

        // --- BONG BÓNG CHAT ---
        const speechBubble = document.createElement("div");
        speechBubble.id = "aio_speech_bubble";
        speechBubble.style.cssText = "position: absolute; right: 70px; top: 10px; background: rgba(15, 23, 42, 0.95); border: 2px solid #0cebeb; color: #0cebeb; padding: 10px 15px; border-radius: 12px; font-size: 13px; font-weight: bold; white-space: nowrap; display: none; text-shadow: none; box-shadow: 0 0 10px rgba(12,235,235,0.5); pointer-events: none; transition: all 0.3s ease; opacity: 0; transform: translateY(-10px) scale(0.9); z-index: 9999999; font-family: 'Segoe UI', Tahoma, sans-serif;";

        // Mũi tên chĩa về Avatar
        const arrow = document.createElement("div");
        arrow.style.cssText = "position: absolute; top: 12px; right: -8px; width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 8px solid rgb(15, 23, 42);";

        const arrowBorder = document.createElement("div");
        arrowBorder.className = "bubble-arrow-border";
        arrowBorder.style.cssText = "position: absolute; top: 10px; right: -11px; width: 0; height: 0; border-top: 8px solid transparent; border-bottom: 8px solid transparent; border-left: 10px solid #0cebeb;";

        const speechText = document.createElement("span");
        speechText.id = "aio_speech_text";

        speechBubble.appendChild(arrowBorder);
        speechBubble.appendChild(arrow);
        speechBubble.appendChild(speechText);
        uiContainer.appendChild(speechBubble);

        const menuContainer = document.createElement("div");
        menuContainer.className = "cyber-menu-aio closed";
        menuContainer.style.position = "absolute";
        menuContainer.style.top = "70px";
        menuContainer.style.right = "0px";
        menuContainer.style.padding = "14px 12px";
        menuContainer.style.color = "#E0E0E0";
        menuContainer.style.width = "210px";

        const HUP_DEFAULT_KEY = 'hup_MKn84wNDFj3oNxHoVE8mXARUrIFqaiA_1Zl-T3E5diU67QGs';
        let savedApi = GM_getValue('vinhdnah1_codesim_apikey', HUP_DEFAULT_KEY);
        // Tự động reset key cũ của CodeSim (JWT format) sang HupSMS
        if (!savedApi || savedApi.startsWith('eyJ')) {
            savedApi = HUP_DEFAULT_KEY;
            GM_setValue('vinhdnah1_codesim_apikey', HUP_DEFAULT_KEY);
        }

        menuContainer.innerHTML = `
            <div class="cyber-title-aio">@vinhdnah1</div>
            <div style="font-size:10px; color:#00f3ff; font-weight:bold;">DATA BASE64 (Của ffsb):</div>
        `;

        const b64input = document.createElement("input");
        b64input.className = "cyber-input-aio";
        b64input.type = "text";
        b64input.placeholder = "Dán mã Base64 (Có tài khoản/Pass)...";
        b64input.value = savedBase64;
        menuContainer.appendChild(b64input);

        const fillBtn = document.createElement("button");
        fillBtn.className = "cyber-btn-aio";
        fillBtn.style.background = "linear-gradient(45deg, #00f2fe, #4facfe)";
        fillBtn.innerText = "🚀 BẮT ĐẦU (THUÊ & GO)";
        menuContainer.appendChild(fillBtn);

        const shortcutContainer = document.createElement("div");
        shortcutContainer.style.display = "flex";
        shortcutContainer.style.gap = "5px";
        shortcutContainer.style.marginTop = "10px";

        const btnReg = document.createElement("button");
        btnReg.className = "cyber-btn-aio";
        btnReg.style.cssText = "flex: 1; padding: 8px 0; font-size: 11px; font-weight: bold; color: #000; background: linear-gradient(45deg, #0cebeb, #20e3b2); border: none; border-radius: 4px; cursor: pointer; text-align: center; white-space: nowrap; box-shadow: 0 0 5px rgba(32, 227, 178, 0.4); text-transform: uppercase;";
        btnReg.innerText = "FORM";
        btnReg.onclick = () => {
            let d = decodeData(b64input.value.trim());
            if (d) fillOkVip(d, rentedPhone || ("03" + Math.floor(Math.random() * 100000000))).then(() => showBubble('Đã điền form đăng ký!'));
            else showBubble('Lỗi Data Base64', true);
        };

        const btnSdt = document.createElement("button");
        btnSdt.className = "cyber-btn-aio";
        btnSdt.style.cssText = "flex: 1; padding: 8px 0; font-size: 11px; font-weight: bold; color: #fff; background: linear-gradient(45deg, #ff416c, #ff4b2b); border: none; border-radius: 4px; cursor: pointer; text-align: center; white-space: nowrap; box-shadow: 0 0 5px rgba(255, 75, 43, 0.4); text-transform: uppercase;";
        btnSdt.innerText = "LK SĐT";
        btnSdt.onclick = () => {
            GM_setValue('aio_step', 'linking');
            GM_setValue('aio_running', true);
            let path = window.location.pathname;
            let search = window.location.search;
            // Đang trên trang LK SĐT rồi -> làm ngay
            if (search.includes('active=0')) {
                GM_setValue('aio_running', false);
                setTimeout(handleLinkingStep, 500);
            } else if (path.includes('/home/security') && !search.includes('active=')) {
                GM_setValue('aio_running', false);
                setTimeout(onSecurityListPage, 500);
            } else if (path === '/' || path === '/home' || path === '/home/') {
                // Trên sảnh -> navigate tự nhiên qua checkNavigationState
                checkNavigationState();
            } else {
                navigateBackTo('/home/mine', () => checkNavigationState());
            }
        };

        const btnBank = document.createElement("button");
        btnBank.className = "cyber-btn-aio";
        btnBank.style.cssText = "flex: 1; padding: 8px 0; font-size: 11px; font-weight: bold; color: #fff; background: linear-gradient(45deg, #f12711, #f5af19); border: none; border-radius: 4px; cursor: pointer; text-align: center; white-space: nowrap; box-shadow: 0 0 5px rgba(245, 175, 25, 0.4); text-transform: uppercase;";
        btnBank.innerText = "Bank";
        btnBank.onclick = () => {
            let search = window.location.search;
            let path = window.location.pathname;

            // Đang ở đúng trang -> gọi thẳng không cần navigate
            if (search.includes('active=10')) {
                GM_setValue('aio_step', 'withdraw_bank_2');
                GM_setValue('aio_running', false);
                setTimeout(onWithdrawBankStep2, 500);
            } else if (search.includes('active=20')) {
                GM_setValue('aio_step', 'withdraw_bank_1');
                GM_setValue('aio_running', false);
                setTimeout(onWithdrawBankStep1, 500);
            } else if (search.includes('active=5') || document.querySelector('.lobby-form-item--withdrawPass')) {
                GM_setValue('aio_step', 'withdraw');
                GM_setValue('aio_running', false);
                setTimeout(onWithdrawPassPage, 500);
            } else {
                // Chưa ở đúng trang -> set step rồi navigate qua sảnh để bot tự đi
                GM_setValue('aio_step', 'withdraw');
                GM_setValue('aio_running', true);
                if (path === '/' || path === '/home' || path === '/home/') {
                    checkNavigationState();
                } else {
                    navigateBackTo('/home/mine', () => checkNavigationState());
                }
            }
        };

        shortcutContainer.appendChild(btnReg);
        shortcutContainer.appendChild(btnSdt);
        shortcutContainer.appendChild(btnBank);


        menuContainer.appendChild(shortcutContainer);

        const otpPanel = document.createElement("div");
        otpPanel.style.marginTop = "10px";
        otpPanel.style.padding = "10px";
        otpPanel.style.background = "rgba(0,0,0,0.5)";
        otpPanel.style.borderRadius = "5px";
        otpPanel.style.display = currentSimId ? "block" : "none";
        otpPanel.style.border = "1px dashed rgba(0,243,255,0.5)";
        menuContainer.appendChild(otpPanel);

        const phoneInfo = document.createElement("div");
        phoneInfo.style.color = "#00d2ff";
        phoneInfo.style.fontWeight = "bold";
        phoneInfo.style.fontSize = "12px";
        if (rentedPhone) phoneInfo.innerText = "SĐT: " + rentedPhone;
        otpPanel.appendChild(phoneInfo);

        const otpInfo = document.createElement("div");
        otpInfo.style.color = "#fff";
        otpInfo.style.fontWeight = "bold";
        otpInfo.style.fontSize = "16px";
        otpInfo.style.marginTop = "6px";
        otpInfo.style.marginBottom = "6px";
        otpInfo.innerText = currentSimId ? "OTP: Phiên khôi phục..." : "OTP: Đang đợi...";
        otpPanel.appendChild(otpInfo);

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "cyber-btn-aio";
        cancelBtn.style.background = "linear-gradient(45deg, #ff0000, #990000)";
        cancelBtn.innerText = "❌ HỦY SĐT NÀY";
        otpPanel.appendChild(cancelBtn);

        function fillOtpAndSubmit(code) {
            let otpInput = document.querySelector('input[data-input-name="phoneCode"]') || document.querySelector('input[data-input-name="code"]');
            if (otpInput) {
                setNativeValue(otpInput, code);
                setTimeout(() => {
                    let btn = document.getElementById('insideRegisterSubmitClick');
                    if (!btn) {
                        let buttons = document.querySelectorAll('button.ui-button');
                        for (let b of buttons) {
                            let txt = b.innerText.trim().toUpperCase();
                            if (txt.includes("XÁC NHẬN") || txt === "ĐĂNG KÝ" || txt === "ĐĂNG KÍ" || txt === "TIẾP THEO") {
                                btn = b.querySelector('span') || b;
                                break;
                            }
                        }
                    }
                    if (btn) {
                        var parentBtn = btn.closest('button') || btn;
                        var evOpts = { bubbles: true, cancelable: true };
                        parentBtn.dispatchEvent(new Event('touchstart', evOpts));
                        parentBtn.dispatchEvent(new PointerEvent('pointerdown', evOpts));
                        parentBtn.dispatchEvent(new MouseEvent('mousedown', evOpts));
                        parentBtn.dispatchEvent(new Event('touchend', evOpts));
                        parentBtn.dispatchEvent(new PointerEvent('pointerup', evOpts));
                        parentBtn.dispatchEvent(new MouseEvent('mouseup', evOpts));
                        parentBtn.dispatchEvent(new MouseEvent('click', evOpts));
                        safeClick(btn);
                        safeClick(parentBtn);
                        showBubble("Đã tự động điền OTP và Submit!");
                        GM_setValue('aio_step', 'done');
                    }
                }, 1000);
            }
        }

        function startOtpPolling() {
            if (otpCheckInterval) clearInterval(otpCheckInterval);
            otpCheckInterval = setInterval(() => {
                if (!currentOtpId) return;
                requestOtp(savedApi, currentOtpId, (errOtp, code) => {
                    if (code) {
                        clearInterval(otpCheckInterval);
                        otpInfo.innerText = "OTP: " + code;
                        otpInfo.style.color = "#00f3ff";
                        showBubble("✅ Đã nhận được OTP: " + code);

                        fillOtpAndSubmit(code);
                    }
                });
            }, 5000);
        }

        if (currentSimId) startOtpPolling();

        // Sự kiện
        b64input.addEventListener("input", () => {
            savedBase64 = b64input.value.trim();
            GM_setValue('vinhdnah1_base64_data_aio', savedBase64);
        });

        function startRentalProcess() {
            let b64 = b64input.value.trim() || savedBase64;

            let currentPath = window.location.pathname;
            let currentSearch = window.location.search;
            if (GM_getValue('aio_step', '') === 'linking' && (currentPath.includes('/home/security') || currentSearch.includes('active=0'))) {
                handleLinkingStep();
                return;
            }
            if (!b64) return showBubble("Vui lòng paste Data Base64!", true);
            if (!savedApi) return showBubble("Vui lòng lưu API Key trước!", true);

            let dataObj = decodeData(b64);
            if (!dataObj) return showBubble("Data Base64 không đúng định dạng!", true);

            fillBtn.innerText = "⏳ ĐANG XỬ LÝ...";
            fillBtn.style.pointerEvents = "none";

            // Bước 1: Check số dư trước
            requestBalance(savedApi, (err, bal) => {
                if (err || bal < 2500) {
                    fillBtn.innerText = "🚀 THUÊ SĐT & GO (AUTO FILL)";
                    fillBtn.style.pointerEvents = "auto";
                    let msgError = err ? ("Lỗi: " + err) : "Tài khoản hết vốn! Không đủ 2500đ.";
                    return showBubble(msgError, true);
                }

                // Tiền đủ, tiến hành thuê số (service id 49)
                let netVal = "";

                requestPhone(savedApi, netVal, (errPhone, dataSim) => {
                    fillBtn.innerText = "🚀 THUÊ SĐT & GO (AUTO FILL)";
                    fillBtn.style.pointerEvents = "auto";

                    if (errPhone || !dataSim || !dataSim.phone) {
                        return showBubble("Thuê SĐT Thất bại: " + errPhone, true);
                    }

                    currentSimId = dataSim.simId || dataSim.id;
                    currentOtpId = dataSim.idOtp || dataSim.simId || dataSim.id;
                    let phoneStr = dataSim.phone;
                    rentedPhone = phoneStr;

                    GM_setValue('aio_currentSimId', currentSimId);
                    GM_setValue('aio_currentOtpId', currentOtpId);
                    GM_setValue('aio_rentedPhone', phoneStr);
                    GM_setValue('aio_step', 'registering');

                    // Hiển thị UI OTP Panel
                    otpPanel.style.display = "block";
                    phoneInfo.innerText = "SĐT: " + phoneStr;
                    otpInfo.innerText = "OTP: Đang đợi code...";
                    otpInfo.style.color = "#ffaa00";

                    // Chèn số điện thoại mới này vào dataObj
                    let hasPhoneKey = false;
                    for (let key in dataObj) {
                        let k = key.toLowerCase();
                        if (k.includes('sdt') || k.includes('phone') || k.includes('thoai') || k.includes('tel') || k.includes('mobile')) {
                            dataObj[key] = phoneStr;
                            hasPhoneKey = true;
                        }
                    }
                    if (!hasPhoneKey) dataObj['sdt_new'] = phoneStr;

                    // Update clipboard / hook base64
                    let base64ToWrite = window.btoa(unescape(encodeURIComponent(JSON.stringify(dataObj))));
                    savedBase64 = base64ToWrite;

                    try { navigator.clipboard.writeText(base64ToWrite); } catch (e) { }
                    try { localStorage.setItem('__ffsb_data__', base64ToWrite); } catch (e) { }

                    // Chạy ffsb Gốc
                    if (window.__ffsb && typeof window.__ffsb.paste === 'function') {
                        hookActive = true; hookReadCount = 0;
                        window.__ffsb.paste();
                    } else {
                        let bCore = document.getElementById('btn_paste');
                        if (bCore) bCore.click();
                    }

                    // Fill xong thì chạy OTP polling, user tự ấn Đăng Ký
                    setTimeout(() => {
                        fillOkVip(dataObj, phoneStr).then(() => {
                            showBubble("Đã điền xong! Vui lòng tự giải captcha.");
                        });
                    }, 200);

                    // Khởi chạy vòng lặp tìm OTP
                    startOtpPolling();
                });
            });
        }

        fillBtn.addEventListener("click", startRentalProcess);

        // Vòng lặp giám sát lỗi trùng SĐT
        setInterval(() => {
            if (!currentSimId) return; // Chỉ check khi đang trong quá trình thuê 1 SĐT

            let messageEl = document.querySelector('.ui-dialog__message');
            if (messageEl && messageEl.innerText.includes('Số điện thoại di động đã được liên kết với tài khoản khác')) {
                // Đóng popup
                let closeBtn = document.querySelector('.ui-dialog-close-box__icon');
                if (closeBtn) closeBtn.click();

                showBubble("🚨 Số bị trùng! Tự động hủy và đổi số mới...");

                let simToCancel = currentSimId;
                currentSimId = null; currentOtpId = null; rentedPhone = null;
                GM_setValue('aio_currentSimId', null); GM_setValue('aio_currentOtpId', null);
                GM_setValue('aio_rentedPhone', null); GM_setValue('aio_step', '');
                if (otpCheckInterval) clearInterval(otpCheckInterval);
                otpInfo.innerText = "OTP: Bị trùng số, đang hủy...";

                // Gọi API hủy
                cancelSim(savedApi, simToCancel, () => {
                    // Cấp lại lệnh thuê sau 1 giây
                    setTimeout(startRentalProcess, 1000);
                });
            }
        }, 1000);

        cancelBtn.addEventListener("click", () => {
            if (!currentSimId || !savedApi) return;
            cancelBtn.innerText = "...";
            cancelSim(savedApi, currentSimId, () => {
                showBubble("Đã hủy thành công số chờ!");
                if (otpCheckInterval) clearInterval(otpCheckInterval);
                otpPanel.style.display = "none";
                currentSimId = null; currentOtpId = null; rentedPhone = null;
                GM_setValue('aio_currentSimId', null); GM_setValue('aio_currentOtpId', null);
                GM_setValue('aio_rentedPhone', null); GM_setValue('aio_step', '');
                cancelBtn.innerText = "❌ HỦY SĐT NÀY";
            });
        });

        uiContainer.appendChild(menuContainer);
        document.body.appendChild(uiContainer);

        let isDragging = false, moved = false;
        let startX = 0, startY = 0, startRect;
        const dragStart = (e) => { if (['INPUT', 'BUTTON', 'SELECT'].includes(e.target.tagName)) return; isDragging = true; moved = false; let c = e.touches ? e.touches[0] : e; startX = c.clientX; startY = c.clientY; startRect = uiContainer.getBoundingClientRect(); };
        const drag = (e) => { if (!isDragging) return; let c = e.touches ? e.touches[0] : e; let mx = c.clientX - startX, my = c.clientY - startY; if (Math.abs(mx) > 15 || Math.abs(my) > 15) { if (!moved) { moved = true; uiContainer.style.right = 'auto'; uiContainer.style.bottom = 'auto'; uiContainer.style.left = startRect.left + 'px'; uiContainer.style.top = startRect.top + 'px'; } if (e.cancelable) e.preventDefault(); uiContainer.style.left = (startRect.left + mx) + 'px'; uiContainer.style.top = (startRect.top + my) + 'px'; } };
        const dragEnd = () => { isDragging = false; };
        uiContainer.addEventListener("mousedown", dragStart); document.addEventListener("mousemove", drag, { passive: false }); document.addEventListener("mouseup", dragEnd); uiContainer.addEventListener("touchstart", dragStart, { passive: false }); document.addEventListener("touchmove", drag, { passive: false }); document.addEventListener("touchend", dragEnd);
        menuContainer.addEventListener("mousedown", e => e.stopPropagation()); menuContainer.addEventListener("touchstart", e => e.stopPropagation()); menuContainer.addEventListener("click", e => e.stopPropagation());
        uiContainer.addEventListener("click", (e) => { if (!moved && !['INPUT', 'BUTTON', 'SELECT'].includes(e.target.tagName) && e.target !== menuContainer && !menuContainer.contains(e.target)) { menuContainer.classList.toggle("closed"); menuContainer.classList.toggle("open"); } });
    }

    // ──────────────────────────────────────────────
    // 5. KHỞI CHẠY CORE FFSB
    // ──────────────────────────────────────────────
    function initTool() {
        if (document.getElementById('ffsb_core_script')) return;

        if (typeof GM_xmlhttpRequest !== "undefined") {
            GM_xmlhttpRequest({
                method: "GET",
                url: SCRIPT_UI_URL,
                onload: function (res) {
                    if (res.status === 200) {
                        try {
                            let triggerLogic = `
                                (function() {
                                    let attempts = 0;
                                    let ffsbInitTimer = setInterval(() => {
                                        if(document.readyState === 'complete' || attempts > 5) {
                                            window.dispatchEvent(new Event('load'));
                                            if (typeof window.onload === 'function') { try { window.onload(new Event('load')); } catch(e) {} }
                                        }
                                        if(document.getElementById('_ffsb') || document.getElementById('btn_paste') || attempts >= 40) {
                                            clearInterval(ffsbInitTimer);
                                        }
                                        attempts++;
                                    }, 500);
                                })();
                            `;
                            let script = document.createElement('script');
                            script.textContent = res.responseText + "\n" + triggerLogic;
                            script.id = 'ffsb_core_script';
                            document.documentElement.appendChild(script);
                            buildCustomUI();
                        } catch (e) { }
                    }
                }
            });
        } else {
            var s = document.createElement('script');
            s.id = 'ffsb_core_script';
            s.src = "https://cdn.jsdelivr.net/gh/vinhdnah/checkkm@main/ffsb.js?v=" + Date.now();
            s.onload = () => {
                if (document.readyState === 'complete') window.dispatchEvent(new Event('load'));
                buildCustomUI();
            };
            document.head.appendChild(s);
        }
    }

    let autoResendInterval = null;
    let lastGetCodeTime = 0;

    function clickGetCode(isRetry = false) {
        lastGetCodeTime = Date.now();
        if (isRetry) showBubble("Quá 60s chưa có mã, tự động Lấy Mã Lại!");

        runInPage(`
            var bnt = document.querySelector('span._sendButton_1oy7l_69') || document.querySelector('._send_1oy7l_60');
            if (!bnt) {
                var spans = document.querySelectorAll('span');
                for (var i = 0; i < spans.length; i++) {
                    if (spans[i].innerText.includes('L\\u1ea5y m\\u00e3 x\\u00e1c minh') || spans[i].innerText.includes('Lấy mã xác minh')) {
                        bnt = spans[i]; break;
                    }
                }
            }
            if (bnt && !bnt.className.includes('disabled')) {
                bnt.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true}));
                bnt.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true}));
                bnt.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
                bnt.click();
            }
        `);
    }

    async function handleLinkingStep() {
        let phoneInput = document.querySelector('input[data-input-name="phone"]');
        if (phoneInput && rentedPhone) {
            let localPhone = rentedPhone.replace(/^0+/, '');
            setNativeValue(phoneInput, localPhone);

            setTimeout(() => {
                if (Date.now() - lastGetCodeTime > 65000) {
                    clickGetCode(false);
                    showBubble("Đã điền SĐT. Vui lòng tự giải Captcha nếu có!");
                }
            }, 800);
        }

        if (!autoResendInterval) {
            autoResendInterval = setInterval(() => {
                if (GM_getValue('aio_step', '') === 'done') {
                    clearInterval(autoResendInterval);
                    return;
                }
                let bnt = document.querySelector('span._sendButton_1oy7l_69') || document.querySelector('._send_1oy7l_60') || Array.from(document.querySelectorAll('span')).find(el => el && el.innerText && el.innerText.trim() === 'Lấy mã xác minh');
                if (bnt && bnt.innerText.includes('Lấy mã xác minh') && !bnt.classList.contains('_disabled_1oy7l_85')) {
                    // Chờ kiên nhẫn 65 giây trước khi ấn lại, tránh spam lúc bị dính Captcha
                    if (Date.now() - lastGetCodeTime > 65000) {
                        clickGetCode(true);
                    }
                }
            }, 5000);
        }
    }

    // ─────────────────────────────────────────────
    // Tự động đóng popup (nút X) khi xuất hiện
    // ─────────────────────────────────────────────
    // Tự động đóng popup (nút X) khi xuất hiện (CHỈ Ở ROOT TRANG CHỦ)
    // ─────────────────────────────────────────────
    setInterval(() => {
        let path = window.location.pathname;
        let search = window.location.search;
        let isRoot = (path === '/' || path === '/home' || path === '/home/') && !search;
        if (!isRoot) return;

        let dlg = document.querySelector('.ui-dialog__main');
        if (!dlg) return;
        // Không tự đóng popup trùng SĐT (đã xử lý riêng)
        let msg = dlg.querySelector('.ui-dialog__message');
        if (msg && msg.innerText.includes('Số điện thoại di động đã được liên kết')) return;

        let closeBtn = document.querySelector('i.ui-dialog-close-box__icon');
        if (closeBtn) {
            runInPage(`
                var btn = document.querySelector('i.ui-dialog-close-box__icon');
                if (btn) {
                    btn.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true}));
                    btn.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true}));
                    btn.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
                    btn.click();
                }
            `);
        }
    }, 800);

    // ─── Các handler riêng cho từng trang ───────────────
    function onRootPage() {
        if (GM_getValue('aio_step', '') === 'registering') GM_setValue('aio_step', 'linking');
        showBubble('Đang chuyển sang tab TK...');
        setTimeout(() => {
            runInPage(`
                var tabs = document.querySelectorAll('div[role="tab"]');
                for (var i = 0; i < tabs.length; i++) {
                    var txt = tabs[i].innerText.trim();
                    if (txt.includes('Tôi') || txt.includes('T\\u00f4i') || txt.includes('Tài Khoản') || txt.includes('T\\u00e0i Kho\\u1ea3n')) {
                        tabs[i].dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true}));
                        tabs[i].dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true}));
                        tabs[i].dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
                        tabs[i].click();
                        break;
                    }
                }
            `);
        }, 1000);
    }

    function onMinePage() {
        let step = GM_getValue('aio_step', '');



        if (step === 'withdraw') {
            showBubble('Đang tìm Rút Tiền...');
            setTimeout(() => {
                runInPage(`
                    var elements = document.querySelectorAll('span, p');
                    for (var i = 0; i < elements.length; i++) {
                        var txt = elements[i].innerText.trim();
                        if (txt === 'Rút Tiền' || txt === 'R\\u00fat Ti\\u1ec1n') {
                            var item = elements[i].closest('div[class*="_navItem_"]') || elements[i].closest('div[class*="_nav_"]') || elements[i].closest('.ui-badge__wrapper') || elements[i].parentElement;
                            if (item) {
                                item.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true}));
                                item.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true}));
                                item.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
                                item.click();
                                break;
                            }
                        }
                    }
                `);
                showBubble('Đã click Rút Tiền, đợi phản hồi...');
            }, 1000);
        } else {
            showBubble('Đang tìm Bảo Mật...');
            setTimeout(() => {
                runInPage(`
                    var elements = document.querySelectorAll('span, p');
                    for (var i = 0; i < elements.length; i++) {
                        var txt = elements[i].innerText.trim();
                        if (txt === 'B\u1ea3o M\u1eadt' || txt === 'Bảo Mật') {
                            var item = elements[i].closest('li');
                            if (item) {
                                item.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true}));
                                item.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true}));
                                item.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
                                item.click();
                                break;
                            }
                        }
                    }
                `);
                showBubble('Đã click Bảo Mật, đợi...');
            }, 1000);
        }
    }

    function onSecurityListPage() {
        showBubble('Đang tìm Số Điện Thoại chưa xác minh...');
        // Đặt vòng lặp tìm nút trong 10s vì data tải có thể bị trễ
        let attempts = 0;
        let intv = setInterval(() => {
            attempts++;
            if (attempts > 10 || window.location.search.includes('active=0')) {
                clearInterval(intv);
                return;
            }

            let isVerified = Array.from(document.querySelectorAll('span')).some(el => el.innerText.includes('Đã Xác Minh Thành Công'));
            if (isVerified) {
                clearInterval(intv);
                GM_setValue('aio_step', 'withdraw');
                showBubble('Xác minh thành công! Đang quay lại trang trước...');
                runInPage(`
                    var backBtn = document.querySelector('.lobby-base-header__back i') || document.querySelector('.lobby-base-header__back');
                    if (backBtn) {
                        backBtn.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true}));
                        backBtn.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true}));
                        backBtn.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
                        backBtn.click();
                    }
                `);
                return;
            }

            runInPage(`
                var item = null;
                var spans = document.querySelectorAll('span');
                for (var i = 0; i < spans.length; i++) {
                    var txt = spans[i].innerText.trim();
                    if (txt === 'Số Điện Thoại' || txt === 'S\\u1ed1 \\u0110i\\u1ec7n Tho\\u1ea1i' || txt === 'S\u1ed1 \u0110i\u1ec7n Tho\u1ea1i') {
                        item = spans[i].closest('li');
                        break;
                    }
                }
                
                if (item) {
                    item.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true}));
                    item.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true}));
                    item.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
                    item.click();
                }
            `);
        }, 1000);
    }





    function onWithdrawPassPage() {
        if (GM_getValue('aio_step', '') !== 'withdraw') return;
        if (window.__aio_withdraw_running) return;
        window.__aio_withdraw_running = true;

        const PASS = ['1', '2', '3', '1', '2', '3'];

        const delay = ms => new Promise(res => setTimeout(res, ms));

        // Đợi đến khi ô có class --focus (bàn phím đã mở)
        const waitForFocus = () => new Promise(res => {
            let tries = 0;
            let t = setInterval(() => {
                tries++;
                let focused = document.querySelector('.ui-password-input__item--focus');
                if (focused || tries > 20) { clearInterval(t); res(); }
            }, 100);
        });

        // Click 1 phím trên bàn phím ảo
        const clickKey = (char) => {
            runInPage(`
                var kbds = document.querySelectorAll('.ui-number-keyboard');
                var activeKbd = null;
                for (var j = 0; j < kbds.length; j++) {
                    // Position: fixed làm cho offsetParent = null trên một số trình duyệt, dùng getComputedStyle cho chắc
                    if (window.getComputedStyle(kbds[j]).display !== 'none') {
                        activeKbd = kbds[j];
                        break;
                    }
                }
                if (!activeKbd) return;

                var keys = activeKbd.querySelectorAll('.ui-number-keyboard-key');
                for (var i = 0; i < keys.length; i++) {
                    var k = keys[i];
                    if (k.innerText.trim() === '${char}'
                        && !k.classList.contains('ui-number-keyboard-key--extra')
                        && !k.classList.contains('ui-number-keyboard-key--delete')) {
                        
                        k.dispatchEvent(new Event('touchstart',{bubbles:true,cancelable:true}));
                        k.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));
                        k.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));
                        
                        k.dispatchEvent(new Event('touchend',{bubbles:true,cancelable:true}));
                        k.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true}));
                        k.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true}));
                        
                        k.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
                        k.click();
                        break;
                    }
                }
            `);
        };

        // Click vào ô li để focus và gọi bàn phím lên
        const focusField = (selector) => {
            runInPage(`
                var p = document.querySelector('${selector}');
                var li = p ? p.querySelector('li.ui-password-input__item') : null;
                if (li) {
                    li.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));
                    li.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));
                    li.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true}));
                    li.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true}));
                    li.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
                    li.click();
                }
            `);
        };

        (async () => {
            try {
                showBubble('Đang nhập MK Rút Tiền (123123)...');

                // Bước 1: Click vào ô để gọi bàn phím lên, đợi --focus xuất hiện
                focusField('.lobby-form-item--withdrawPass');
                await waitForFocus(); // Chờ ô có class --focus mới gõ

                // Bước 2: Gõ 123123 (ô 1) - sau 6 số UI tự chuyển sang ô 2 + mở bàn phím luôn
                for (let char of PASS) {
                    clickKey(char);
                    await delay(500);
                }

                // Bước 3: Gõ 123123 (ô 2) - UI đã tự focus sang ô xác nhận
                for (let char of PASS) {
                    clickKey(char);
                    await delay(500);
                }

                await delay(500);

                // Bước 4: Xác Nhận
                runInPage(`
                    var btn = Array.from(document.querySelectorAll('.ui-button__text')).find(function(el){ return el.innerText.trim() === 'Xác Nhận'; });
                    if (btn) { var b = btn.closest('button'); if (b) { b.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true})); b.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true})); b.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})); b.click(); } }
                `);

                GM_setValue('aio_step', 'withdraw_bank_1');
                GM_setValue('aio_running', true);
                showBubble('Đã setup MK Rút Tiền xong! Đợi vào form thêm thẻ...');
            } finally {
                window.__aio_withdraw_running = false;
            }
        })();
    }

    function onWithdrawBankStep1() {
        showBubble('Đang click nút Thêm Tài Khoản...');
        runInPage(`
            var btn = document.querySelector('._addAccountInputBtn_6knd3_45') || document.querySelector('._addAccountInputBtnWrap_6knd3_72');
            if (!btn) {
                var spans = document.querySelectorAll('span');
                for(var i=0; i<spans.length; i++) {
                    if(spans[i].innerText.trim() === 'Thêm Tài Khoản') {
                        var wrap = spans[i].closest('div');
                        if (wrap) btn = wrap;
                        break;
                    }
                }
            }
            if (btn) {
                btn.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true}));
                btn.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true}));
                btn.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
                btn.click();
            }
        `);
        GM_setValue('aio_step', 'withdraw_bank_2');
        GM_setValue('aio_running', true);
    }

    function onWithdrawBankStep2() {
        showBubble('Đang xử lý popup Thêm Ngân Hàng...');
        runInPage(`
            var btn = document.getElementById('addAccountClick');
            if (!btn) {
                var txts = document.querySelectorAll('span');
                for(var i=0; i<txts.length; i++) {
                    if(txts[i].innerText.trim() === 'Thêm Vào') {
                        var c = txts[i].closest('div[data-sensors-click="true"]') || txts[i].closest('div');
                        if (c) btn = c;
                        break;
                    }
                }
            }
            if (btn) {
                btn.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true}));
                btn.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true}));
                btn.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
                btn.click();
            }
        `);

        setTimeout(async () => {
            const PASS = ['1', '2', '3', '1', '2', '3'];
            const delay = ms => new Promise(res => setTimeout(res, ms));

            const waitForFocus = () => new Promise(res => {
                let tries = 0;
                let t = setInterval(() => {
                    tries++;
                    let focused = document.querySelector('.ui-password-input__item--focus');
                    if (focused || tries > 20) { clearInterval(t); res(); }
                }, 100);
            });

            const clickKey = (char) => {
                runInPage(`
                    var kbds = document.querySelectorAll('.ui-number-keyboard');
                    var activeKbd = null;
                    for (var j = 0; j < kbds.length; j++) {
                        if (window.getComputedStyle(kbds[j]).display !== 'none') {
                            activeKbd = kbds[j];
                            break;
                        }
                    }
                    if (!activeKbd) return;
                    var keys = activeKbd.querySelectorAll('.ui-number-keyboard-key');
                    for (var i = 0; i < keys.length; i++) {
                        var k = keys[i];
                        if (k.innerText.trim() === '${char}'
                            && !k.classList.contains('ui-number-keyboard-key--extra')
                            && !k.classList.contains('ui-number-keyboard-key--delete')) {
                            k.dispatchEvent(new Event('touchstart',{bubbles:true,cancelable:true}));
                            k.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));
                            k.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));
                            k.dispatchEvent(new Event('touchend',{bubbles:true,cancelable:true}));
                            k.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true}));
                            k.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true}));
                            k.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
                            k.click();
                            break;
                        }
                    }
                `);
            };

            await waitForFocus();
            for (let char of PASS) {
                clickKey(char);
                await delay(300);
            }

            await delay(500);
            showBubble('Đang ấn Tiếp Theo...');
            runInPage(`
                var btn = Array.from(document.querySelectorAll('.ui-button__text')).find(function(el){ return el.innerText.trim() === 'Tiếp Theo'; });
                if (btn) { var b = btn.closest('button'); if (b) { b.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true})); b.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true})); b.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})); b.click(); } }
            `);

            await delay(800);

            let d = decodeData(savedBase64);
            if (d) {
                let bnkAccount = findFieldSafe(d, ['user', 'account', 'login', 'sdt', 'phone', 'pass', 'pwd'], 'stk', 'sotk', 'sotaikhoan', 'accountnumber', 'bankaccount');
                let bnkName = findFieldSafe(d, ['user', 'account', 'login', 'sdt', 'phone', 'pass', 'pwd'], 'bank', 'nganhang', 'tennganhang', 'bankname', 'ngân hàng', 'ngân', 'tên ngân hàng', 'ngân hàng thụ hưởng');

                // BƯỚC 1: Gõ STK trước
                if (bnkAccount) {
                    showBubble('Đang gõ Số Tài Khoản: ' + bnkAccount);
                    let accInput = document.querySelector('input[placeholder*="tài khoản ngân hàng"]');
                    if (accInput) {
                        accInput.focus();
                        let evOpts = { bubbles: true };
                        let nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                        nativeSetter.call(accInput, "");
                        accInput.dispatchEvent(new Event('input', evOpts));
                        await delay(50);
                        let tmpStr = "";
                        for (let i = 0; i < bnkAccount.length; i++) {
                            tmpStr += bnkAccount[i];
                            nativeSetter.call(accInput, tmpStr);
                            accInput.dispatchEvent(new Event('input', evOpts));
                            await delay(40 + Math.random() * 60);
                        }
                        accInput.dispatchEvent(new Event('change', evOpts));
                        accInput.dispatchEvent(new Event('blur', evOpts));
                        accInput.blur();
                    }
                    await delay(300);
                }

                // BƯỚC 2: Click mở dropdown Ngân Hàng (click vào div container, không phải input)
                if (bnkName) {
                    showBubble('Đang chọn Ngân Hàng...');
                    runInPage(`
                        var bnkSelect = document.querySelector('input[placeholder="Chọn ngân hàng phát hành"]');
                        if (bnkSelect) {
                            bnkSelect.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));
                            bnkSelect.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true}));
                            bnkSelect.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
                            bnkSelect.focus();
                        }
                    `);

                    await delay(800);

                    // BƯỚC 3: Click thẳng vào thẻ <span> chứa tên ngân hàng
                    showBubble('Đang chọn Ngân Hàng: ' + bnkName + '...');
                    runInPage(`
                        function norm(s) {
                            return (s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]/g,'');
                        }
                        var target = norm("` + (bnkName || '') + `");
                        var spans = document.querySelectorAll('.ui-options__option-content span');
                        var found = null;
                        for(var i = 0; i < spans.length; i++) {
                            var t = norm(spans[i].innerText);
                            if(t && (t.includes(target) || target.includes(t))) {
                                found = spans[i];
                                break;
                            }
                        }
                        if (found) {
                            found.scrollIntoView({block:'center'});
                            var wrapper = found.closest('.ui-options__option') || found;
                            
                            var evOpts = {bubbles:true, cancelable:true};
                            wrapper.dispatchEvent(new Event('touchstart', evOpts));
                            wrapper.dispatchEvent(new PointerEvent('pointerdown', evOpts));
                            wrapper.dispatchEvent(new MouseEvent('mousedown', evOpts));
                            wrapper.dispatchEvent(new Event('touchend', evOpts));
                            wrapper.dispatchEvent(new PointerEvent('pointerup', evOpts));
                            wrapper.dispatchEvent(new MouseEvent('mouseup', evOpts));
                            wrapper.dispatchEvent(new MouseEvent('click', evOpts));
                            found.click();
                        }
                    `);
                    await delay(500);
                }
            }

            await delay(1000);

            // BƯỚC 4: Ấn nút Xác Nhận
            showBubble('Đang ấn Xác Nhận...');
            runInPage(`
                var btn = document.getElementById('bindWithdrawAccountNextClick');
                if (!btn) {
                    btn = Array.from(document.querySelectorAll('.ui-button__text')).find(function(el){ return el.innerText.trim() === 'Xác Nhận'; });
                    if (btn) btn = btn.closest('button');
                }
                if (btn) {
                    var evOpts = {bubbles:true, cancelable:true};
                    btn.dispatchEvent(new Event('touchstart', evOpts));
                    btn.dispatchEvent(new PointerEvent('pointerdown', evOpts));
                    btn.dispatchEvent(new MouseEvent('mousedown', evOpts));
                    btn.dispatchEvent(new Event('touchend', evOpts));
                    btn.dispatchEvent(new PointerEvent('pointerup', evOpts));
                    btn.dispatchEvent(new MouseEvent('mouseup', evOpts));
                    btn.dispatchEvent(new MouseEvent('click', evOpts));
                    btn.click();
                }
            `);

            showBubble('✅ Đã điền xong và Xác Nhận! Done sếp!');
            GM_setValue('aio_step', 'done');
        }, 1000);
    }

    function checkNavigationState() {
        let isRunning = GM_getValue('aio_running', false);
        // KHÓA MÕM AUTO: Ko bấm nút trên Menu -> Ko cho làm gì hết!
        if (!isRunning) return;

        let path = window.location.pathname;
        let search = window.location.search;
        let isWithdrawPassPage = search.includes('active=5') || document.querySelector('.lobby-form-item--withdrawPass') !== null;
        let isWithdraw20 = search.includes('active=20');
        let isWithdraw10 = search.includes('active=10');

        if (search.includes('active=0') && step.includes('linking')) {
            GM_setValue('aio_running', false);
            setTimeout(handleLinkingStep, 1500);
        } else if (isWithdrawPassPage) {
            GM_setValue('aio_running', false);
            setTimeout(onWithdrawPassPage, 800); // Đợi DOM render xong
        } else if (isWithdraw20 && GM_getValue('aio_step', '').includes('withdraw')) {
            GM_setValue('aio_running', false);
            setTimeout(onWithdrawBankStep1, 800);
        } else if (isWithdraw10 && GM_getValue('aio_step', '') === 'withdraw_bank_2') {
            GM_setValue('aio_running', false);
            setTimeout(onWithdrawBankStep2, 800);
        } else if ((path === '/' || path === '/home' || path === '/home/') && !search) {
            onRootPage();
        } else if ((path === '/' || path === '/home' || path === '/home/') && search) {
            // Có params ở sảnh nhưng đang chạy auto -> Mặc định click "Tôi" để vào Mine
            onRootPage();
        } else if (path.includes('/home/mine')) {
            onMinePage();
        } else if (path.includes('/home/security') && !search.includes('active=')) {
            onSecurityListPage();
        }
    }

    // SPA URL watcher
    let _lastUrl = location.href;
    setInterval(() => {
        if (location.href !== _lastUrl) {
            _lastUrl = location.href;
            setTimeout(checkNavigationState, 800);
        }
    }, 500);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { setTimeout(initTool, 800); setTimeout(checkNavigationState, 1500); });
    } else {
        setTimeout(initTool, 800);
        setTimeout(checkNavigationState, 1500);
    }
    window.addEventListener('load', () => { setTimeout(buildCustomUI, 1000); });

})();
;
