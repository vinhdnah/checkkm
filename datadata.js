// ==UserScript==
// @name         AUTO FILL FFSB (IPHONE - FINAL)
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Tool tự động điền + Auto Thu nhỏ + Giao diện @vinhdnah1
// @author       Vinhdnah1
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @connect      cdn.jsdelivr.net
// ==/UserScript==

(function () {
    'use strict';

    window.__START_MINIMIZED = true;

    const SCRIPT_UI_URL = "https://raw.githubusercontent.com/vinhdnah/checkkm/refs/heads/main/ffsb_decoded.js?v=" + Date.now();


    let savedBase64 = GM_getValue('vinhdnah1_base64_data', '');
    let hasPasted = false;
    let hookActive = false;
    let hookReadCount = 0;

    function toLocalVNPhone(val) {
        let v = String(val).trim().replace(/[\s\-\.]/g, '');
        if (/^\+84/.test(v)) return v.substring(3);
        if (/^84\d{9}$/.test(v)) return v.substring(2);
        if (/^0\d{9,10}$/.test(v)) return v.substring(1);
        return v;
    }


    function fixPhoneForPage(val) {
        let local = toLocalVNPhone(val);
        // Nếu là react-tel-input → điền số đầy đủ dạng +84XXXXXXXXX
        let isReactTel = document.querySelector('.react-tel-input .selected-flag, .react-tel-input input[type="tel"]');
        if (isReactTel) return '+84' + local;
        // Nếu là lobby area-code fixed → điền số local thưần
        let isLobby = document.querySelector('.lobby-form-item--areaCode, [data-item-name="areaCode"], .phone-area-code, .area-code-fixed-one');
        if (isLobby) return local;
        // Mặc định: không đổi gì
        return val;
    }

    // Hook clipboard để nhả data base64 đã decode cho nút "GAME KHÁC" (id 'bup')
    const originalClipboardRead = navigator.clipboard.readText;
    navigator.clipboard.readText = async function () {
        if (hookActive && savedBase64) {
            hookReadCount++;
            if (hookReadCount >= 5) { hookActive = false; hookReadCount = 0; }

            let finalBase64 = savedBase64;
            try {
                // Thử fix SDT nếu cần
                let decoded = decodeURIComponent(escape(window.atob(savedBase64.trim())));
                let parsedObj = JSON.parse(decoded);
                let changed = false;

                // Fix phone for page
                for (let key in parsedObj) {
                    let k = key.toLowerCase();
                    if (k.includes('sdt') || k.includes('phone') || k.includes('thoai') || k.includes('tel') || k.includes('mobile')) {
                        let val = String(parsedObj[key]).trim();
                        let fixed = fixPhoneForPage(val);
                        if (fixed !== val) { parsedObj[key] = fixed; changed = true; }
                    }
                }

                if (changed) {
                    // Trả về dạng Base64 mà ffsb.js có thể đọc được (Unicode fix)
                    finalBase64 = window.btoa(unescape(encodeURIComponent(JSON.stringify(parsedObj))));
                }
            } catch (err) {
                console.error("Hook fix error:", err);
            }
            return finalBase64;
        }
        return originalClipboardRead ? originalClipboardRead.apply(this, arguments) : "";
    };

    // Ẩn UI gốc vĩnh viễn (avatar cũ, menu cũ có nohu 58k & web km)
    const hideCss = document.createElement('style');
    hideCss.innerHTML = `
        #_ffsb, #_ffsb_mini, #_ffsb_content {
            display: none !important;
            opacity: 0 !important;
            pointer-events: none !important;
            z-index: -9999 !important;
        }
    `;
    document.head.appendChild(hideCss);

    // Build UI OKVIP style
    function buildCustomUI() {
        if (document.getElementById('vinhdnah1_ui')) return;

        const cyberCss = document.createElement('style');
        cyberCss.innerHTML = `
            @keyframes cyberPulse {
                0% { box-shadow: 0 0 10px #00ffaa, 0 0 20px #00ffaa; }
                50% { box-shadow: 0 0 20px #00ffaa, 0 0 35px #00ffaa; transform: scale(1.02); }
                100% { box-shadow: 0 0 10px #00ffaa, 0 0 20px #00ffaa; transform: scale(1); }
            }
            @keyframes slideInGlass {
                0% { opacity: 0; transform: translateY(-20px) scale(0.95); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            
            .cyber-avatar {
                border: 2px solid #00ffaa !important;
                animation: cyberPulse 3s infinite;
                transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                border-radius: 50%;
                background-size: cover;
                background-position: center;
                cursor: pointer;
                user-select: none;
            }
            .cyber-avatar:hover {
                transform: scale(1.1) rotate(5deg);
                animation: none;
            }
            
            .cyber-menu {
                background: linear-gradient(135deg, rgba(10, 14, 23, 0.85) 0%, rgba(20, 25, 40, 0.95) 100%) !important;
                backdrop-filter: blur(15px) saturate(180%) !important;
                -webkit-backdrop-filter: blur(15px) saturate(180%) !important;
                border: 1px solid rgba(0, 255, 170, 0.3) !important;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8), inset 0 0 10px rgba(0, 255, 170, 0.1) !important;
                border-radius: 16px !important;
                transition: opacity 0.3s ease, transform 0.3s ease !important;
            }
            .cyber-menu.open {
                opacity: 1 !important;
                pointer-events: auto !important;
                animation: slideInGlass 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            .cyber-menu.closed {
                opacity: 0 !important;
                pointer-events: none !important;
                transform: translateY(-15px) scale(0.98) !important;
            }

            .cyber-input {
                background: rgba(0, 0, 0, 0.6) !important;
                border: 1px solid rgba(255, 255, 255, 0.15) !important;
                color: #00ffaa !important;
                font-family: 'Courier New', monospace;
                letter-spacing: 1px;
                transition: all 0.3s ease !important;
            }
            .cyber-input:focus {
                outline: none !important;
                border-color: #00ffaa !important;
                box-shadow: 0 0 15px rgba(0, 255, 170, 0.3) !important;
                background: rgba(0, 20, 10, 0.8) !important;
            }

            .cyber-btn-save {
                background: linear-gradient(45deg, #ff9900, #ff5500) !important;
                box-shadow: 0 4px 15px rgba(255, 153, 0, 0.4) !important;
                border: none !important;
                transition: all 0.3s ease !important;
                text-transform: uppercase;
                letter-spacing: 1px;
                color: #000 !important;
            }
            .cyber-btn-save:hover {
                transform: translateY(-2px) !important;
                box-shadow: 0 6px 20px rgba(255, 153, 0, 0.6) !important;
                filter: brightness(1.1);
            }
            .cyber-btn-save:active {
                transform: translateY(1px) !important;
            }

            .cyber-btn-paste {
                background: linear-gradient(45deg, #00f2fe, #4facfe) !important;
                box-shadow: 0 4px 15px rgba(0, 242, 254, 0.4) !important;
                border: none !important;
                transition: all 0.3s ease !important;
                text-transform: uppercase;
                letter-spacing: 1px;
                color: #000 !important;
            }
            .cyber-btn-paste:hover {
                transform: translateY(-2px) !important;
                box-shadow: 0 6px 20px rgba(0, 242, 254, 0.6) !important;
                filter: brightness(1.1);
            }
            .cyber-btn-paste:active {
                transform: translateY(1px) !important;
            }

            .cyber-title {
                background: linear-gradient(to right, #00ffaa, #00d2ff);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                text-shadow: 0 0 20px rgba(0, 255, 170, 0.4);
                letter-spacing: 1px;
            }
        `;
        document.head.appendChild(cyberCss);

        const uiContainer = document.createElement("div");
        uiContainer.id = "vinhdnah1_ui";
        uiContainer.className = "cyber-avatar";
        uiContainer.style.position = "fixed";
        uiContainer.style.top = "50px";
        uiContainer.style.right = "10px";
        uiContainer.style.width = "60px";
        uiContainer.style.height = "60px";
        uiContainer.style.backgroundImage = "url('https://sloganhay.com/wp-content/uploads/2026/03/avatar-anime-nam-ngau-10.jpg')";
        uiContainer.style.zIndex = "999999";

        const statusText = document.createElement("div");
        statusText.style.position = "absolute";
        statusText.style.bottom = "-25px";
        statusText.style.left = "50%";
        statusText.style.transform = "translateX(-50%)";
        statusText.style.color = "#00ffaa";
        statusText.style.fontSize = "12px";
        statusText.style.fontWeight = "bold";
        statusText.style.textShadow = "1px 1px 3px #000, -1px -1px 3px #000";
        statusText.style.whiteSpace = "nowrap";
        statusText.style.pointerEvents = "none";
        statusText.style.transition = "color 0.3s ease";
        statusText.innerText = "Sẵn sàng";
        uiContainer.appendChild(statusText);

        const menuContainer = document.createElement("div");
        menuContainer.className = "cyber-menu closed";
        menuContainer.style.position = "absolute";
        menuContainer.style.top = "70px";
        menuContainer.style.right = "0px";
        menuContainer.style.padding = "10px";
        menuContainer.style.color = "#E0E0E0";
        menuContainer.style.fontFamily = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
        menuContainer.style.width = "180px";

        const titleText = document.createElement("div");
        titleText.className = "cyber-title";
        titleText.innerText = "@vinhdnah1 Tool";
        titleText.style.textAlign = "center";
        titleText.style.fontWeight = "900";
        titleText.style.marginBottom = "10px";
        titleText.style.fontSize = "14px";
        menuContainer.appendChild(titleText);

        const label = document.createElement("div");
        label.innerText = "Mã Base64:";
        label.style.fontSize = "10px";
        label.style.marginBottom = "4px";
        label.style.color = "#00ffaa";
        label.style.letterSpacing = "0.5px";
        label.style.fontWeight = "bold";
        label.style.textTransform = "uppercase";
        menuContainer.appendChild(label);

        const inputBase64 = document.createElement("input");
        inputBase64.type = "text";
        inputBase64.className = "cyber-input";
        inputBase64.style.width = "100%";
        inputBase64.style.height = "30px";
        inputBase64.style.borderRadius = "6px";
        inputBase64.style.padding = "0 8px";
        inputBase64.style.boxSizing = "border-box";
        inputBase64.value = savedBase64;
        inputBase64.placeholder = "Dán mã...";
        menuContainer.appendChild(inputBase64);

        const saveBtn = document.createElement("button");
        saveBtn.className = "cyber-btn-save";
        saveBtn.innerText = "lưu data";
        saveBtn.style.marginTop = "8px";
        saveBtn.style.width = "100%";
        saveBtn.style.padding = "8px";
        saveBtn.style.borderRadius = "6px";
        saveBtn.style.fontWeight = "bold";
        saveBtn.style.cursor = "pointer";
        saveBtn.addEventListener("click", (e) => {
            savedBase64 = inputBase64.value.trim();
            GM_setValue('vinhdnah1_base64_data', savedBase64);
            hasPasted = false;
            statusText.innerText = "Đã Lưu Data!";
            statusText.style.color = "#ff9900";
            setTimeout(() => { statusText.innerText = "Sẵn sàng"; statusText.style.color = "#00ffaa"; }, 2000);
        });
        menuContainer.appendChild(saveBtn);

        const pasteBtn = document.createElement("button");
        pasteBtn.className = "cyber-btn-paste";
        pasteBtn.innerText = "Paste";
        pasteBtn.style.marginTop = "8px";
        pasteBtn.style.width = "100%";
        pasteBtn.style.padding = "8px";
        pasteBtn.style.borderRadius = "6px";
        pasteBtn.style.fontWeight = "bold";
        pasteBtn.style.cursor = "pointer";
        pasteBtn.addEventListener("click", async (e) => {
            if (!hasPasted && savedBase64) {
                statusText.innerText = "⏳ Đang xử lý data...";
                statusText.style.color = "#ffcc00";

                let base64ToWrite = savedBase64.trim();
                try {
                    let hasPhonePage = document.querySelector(
                        '.react-tel-input .selected-flag, .react-tel-input input[type="tel"], ' +
                        '.lobby-form-item--areaCode, [data-item-name="areaCode"], ' +
                        '.phone-area-code, .area-code-fixed-one'
                    );
                    if (hasPhonePage) {
                        let decoded = decodeURIComponent(escape(window.atob(base64ToWrite)));
                        let parsedObj = JSON.parse(decoded);
                        let changed = false;
                        for (let key in parsedObj) {
                            let k = key.toLowerCase();
                            if (k.includes('sdt') || k.includes('phone') || k.includes('thoai') || k.includes('tel') || k.includes('mobile')) {
                                let val = String(parsedObj[key]).trim();
                                let fixed = fixPhoneForPage(val);
                                if (fixed !== val) {
                                    parsedObj[key] = fixed;
                                    changed = true;
                                }
                            }
                        }
                        if (changed) {
                            base64ToWrite = window.btoa(unescape(encodeURIComponent(JSON.stringify(parsedObj))));
                        }
                    }
                } catch (sdtErr) { }

                // Ghi trước vào clipboard và fallback localStorage
                try {
                    await navigator.clipboard.writeText(base64ToWrite);
                } catch (e) { }
                try {
                    localStorage.setItem('__ffsb_data__', base64ToWrite);
                } catch (e) { }

                // GỌI TRỰC TIẾP HÀM PASTE TỪ CORE (TỐI ƯU TỐC ĐỘ, CÓ THỬ LẠI)
                let retryCount = 0;
                let tryPaste = () => {
                    if (window.__ffsb && typeof window.__ffsb.paste === 'function') {
                        hookActive = true;
                        hookReadCount = 0;
                        hasPasted = true;
                        window.__ffsb.paste();
                        statusText.innerText = "✅ Paste Thành Công!";
                        statusText.style.color = "#00ff88";
                        setTimeout(() => { statusText.innerText = "Sẵn sàng"; statusText.style.color = "#aaa"; }, 2000);
                        return true;
                    }
                    return false;
                };

                if (!tryPaste()) {
                    let pasteTimer = setInterval(() => {
                        retryCount++;
                        if (tryPaste() || retryCount >= 10) {
                            if (retryCount >= 10 && !window.__ffsb) {
                                // Thử fallback cuối cùng: tìm nút
                                let bCore = document.getElementById('btn_paste');
                                if (bCore) {
                                    bCore.click();
                                    statusText.innerText = "✅ Paste Thành Công!";
                                } else {
                                    statusText.innerText = "Lỗi: Không tìm thấy Tool";
                                    statusText.style.color = "#ff4d4d";
                                }
                            }
                            clearInterval(pasteTimer);
                        }
                    }, 200);
                }

            } else if (!savedBase64) {
                statusText.innerText = "Chưa có data!";
                statusText.style.color = "red";
                setTimeout(() => { statusText.innerText = "Sẵn sàng"; statusText.style.color = "#00ffaa"; }, 1500);
            } else if (hasPasted) {
                statusText.innerText = "Đã paste rồi!";
                setTimeout(() => { if (hasPasted) statusText.innerText = "✅ Paste Thành Công!"; }, 1500);
            }
        });
        menuContainer.appendChild(pasteBtn);

        uiContainer.appendChild(menuContainer);
        document.body.appendChild(uiContainer);

        // Kéo thả & Menu
        let isDragging = false, moved = false;
        let startX = 0, startY = 0, startRect;

        const dragStart = (e) => {
            if (e.target === inputBase64 || e.target === saveBtn || e.target === pasteBtn) return;
            isDragging = true; moved = false;
            let c = e.touches ? e.touches[0] : e;
            startX = c.clientX; startY = c.clientY;
            startRect = uiContainer.getBoundingClientRect();
            // KHÔNG đổi style ở đây — chờ kéo thật sự mới đổi
        };
        const drag = (e) => {
            if (!isDragging) return;
            let c = e.touches ? e.touches[0] : e;
            let mx = c.clientX - startX, my = c.clientY - startY;
            if (Math.abs(mx) > 15 || Math.abs(my) > 15) {
                if (!moved) {
                    // Lần đầu vượt ngưỡng: mới chuyển sang left/top để kéo
                    moved = true;
                    uiContainer.style.right = 'auto'; uiContainer.style.bottom = 'auto';
                    uiContainer.style.left = startRect.left + 'px'; uiContainer.style.top = startRect.top + 'px';
                }
                if (e.cancelable) e.preventDefault();
                uiContainer.style.left = (startRect.left + mx) + 'px';
                uiContainer.style.top = (startRect.top + my) + 'px';
            }
        };
        const dragEnd = () => { isDragging = false; };

        uiContainer.addEventListener("mousedown", dragStart);
        document.addEventListener("mousemove", drag, { passive: false });
        document.addEventListener("mouseup", dragEnd);
        uiContainer.addEventListener("touchstart", dragStart, { passive: false });
        document.addEventListener("touchmove", drag, { passive: false });
        document.addEventListener("touchend", dragEnd);

        // Ngăn chặn nổi sự kiện ở vùng menu
        menuContainer.addEventListener("mousedown", e => e.stopPropagation());
        menuContainer.addEventListener("touchstart", e => e.stopPropagation());
        menuContainer.addEventListener("click", e => e.stopPropagation());

        uiContainer.addEventListener("click", (e) => {
            if (!moved && e.target !== inputBase64 && e.target !== saveBtn && e.target !== pasteBtn) {
                // --- LUÔN MỞ MENU KHI CLICK AVATAR ---
                if (menuContainer.classList.contains("closed")) {
                    menuContainer.classList.remove("closed");
                    menuContainer.classList.add("open");
                } else {
                    menuContainer.classList.remove("open");
                    menuContainer.classList.add("closed");
                }
            }
        });
    }

    // --- LOGIC NẠP TOOL ---
    function initTool() {
        if (document.getElementById('ffsb_core_script')) return;

        // Vượt rào tải Script qua GM_xmlhttpRequest thay vì src (tránh lỗi CSP và MIME-type Github)
        if (typeof GM_xmlhttpRequest !== "undefined") {
            console.log("📡 Đang tải core ffsb.js từ GitHub...");
            GM_xmlhttpRequest({
                method: "GET",
                url: SCRIPT_UI_URL,
                onload: function (res) {
                    if (res.status !== 200) {
                        console.error("❌ Không thể tải ffsb.js. Status: " + res.status);
                        return;
                    }
                    console.log("✅ Đã tải xong core code (" + res.responseText.length + " bytes)");
                    try {
                        // Kích hoạt load event nhiều lần để đảm bảo ffsb.js khởi tạo thành công
                        let triggerLogic = `
                            (function() {
                                console.log("⚙️ Đang kích hoạt ffsb core pulse...");
                                let attempts = 0;
                                let ffsbInitTimer = setInterval(() => {
                                    if(document.readyState === 'complete' || attempts > 5) {
                                        window.dispatchEvent(new Event('load'));
                                        if (typeof window.onload === 'function') {
                                            try { window.onload(new Event('load')); } catch(e) {}
                                        }
                                    }
                                    if(document.getElementById('_ffsb') || document.getElementById('btn_paste') || attempts >= 40) {
                                        if (document.getElementById('btn_paste')) console.log("🎯 Core UI (Decoded) FOUND!");
                                        clearInterval(ffsbInitTimer);
                                    }
                                    attempts++;
                                }, 500);
                            })();
                        `;

                        let fullCode = res.responseText + "\n" + triggerLogic;
                        
                        // Sử dụng textContent thay vì Blob để đảm bảo chạy CÙNG môi trường
                        // Giúp datadata.js nhìn thấy biến window.__ffsb
                        let script = document.createElement('script');
                        script.textContent = fullCode;
                        script.id = 'ffsb_core_script';
                        document.documentElement.appendChild(script);

                        console.log("🚀 Đã nhúng Core Script qua thẻ Script (Global Scope)");

                        // Hiện UI tùy chỉnh của chúng ta
                        buildCustomUI();
                    } catch (e) {
                        console.error("Lỗi khi nhúng ffsb.js", e);
                    }
                },
                onerror: function (err) {
                    console.error("❌ Lỗi mạng khi tải script:", err);
                }
            });
        } else {
            console.log("⚠️ GM_xmlhttpRequest không khả dụng, dùng fallback script tag...");
            // Dự phòng jsdelivr tránh trường hợp thẻ raw.github chặn script
            var s = document.createElement('script');
            s.id = 'ffsb_core_script';
            // Đưa link CDN
            s.src = "https://cdn.jsdelivr.net/gh/vinhdnah/checkkm@main/ffsb.js?v=" + Date.now();
            s.onload = () => {
                if (document.readyState === 'complete') window.dispatchEvent(new Event('load'));
                buildCustomUI();
            };
            document.head.appendChild(s);
        }
    }

    // Chờ web load xong thì hiện tool
    window.addEventListener('load', function () {
        setTimeout(initTool, 1000);
        setTimeout(buildCustomUI, 2000);
    });

    // Fallback dự phòng
    setTimeout(initTool, 2000);
    setTimeout(buildCustomUI, 3000);

})();