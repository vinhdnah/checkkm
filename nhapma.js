// ==UserScript==
// @name         NhapMa Bypass Auto
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Tự động lụm mã NhapMa
// @author       You
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_openInTab
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    function log(...args) {
        console.log('🚀 [NhapMa Auto]', ...args);
    }

    // Giao diện thông báo
    function showBanner(text) {
        let banner = document.getElementById('nhapma-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'nhapma-banner';
            banner.style.cssText = 'position:fixed;top:10px;right:10px;background:#f39c12;color:#fff;padding:15px;z-index:999999;border-radius:5px;font-weight:bold;box-shadow:0 4px 6px rgba(0,0,0,0.1);font-family:sans-serif;transition:all 0.3s ease;';
            document.body.appendChild(banner);
        }
        banner.innerText = text;
    }

    // ==========================================
    // 1. TRANG NHAPMA.COM CHÍNH
    // ==========================================
    if (location.hostname.includes('nhapma.com')) {

        // Lắng nghe biến NHAPMA_CODE từ tab vệ tinh bắn về
        GM_addValueChangeListener('NHAPMA_CODE', (name, old_value, new_value, remote) => {
            if (new_value && new_value.length > 3) {
                log('🎉 Nhận được mã từ tab đối tác:', new_value);
                showBanner('✅ Đã lụm mã: ' + new_value + ' - Đang điền...');
                autoFillAndSubmit(new_value);
            }
        });

        // Tự động phân tích link và mở ngầm
        const match = location.pathname.match(/\/v\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
            const alias = match[1];
            log('Đã phát hiện alias:', alias);

            // Xóa mã cũ khỏi hệ thống
            GM_setValue('NHAPMA_CODE', '');

            window.addEventListener('DOMContentLoaded', async () => {
                showBanner('Đang khởi tạo và phân tích ID trang vệ tinh...');

                // THỬ GỌI API ĐỂ NHẬN DIỆN TRANG VỆ TINH
                let autoUrl = null;
                try {
                    let res = await fetch(`https://service.nhapma.com/api/links/${alias}/countdown`, { credentials: 'omit' });
                    let data = await res.json();
                    let targetUrl = data?.link?.url;

                    // Nếu API giấu URL nhưng để lộ ID
                    if (!targetUrl && data?.url?.id) {
                        const id = data.url.id;
                        if ([370, 371].includes(id)) targetUrl = "https://breve.cc/";
                        else if ([301, 278, 279].includes(id)) targetUrl = "https://www.kdbdw.com/";
                        else if ([326].includes(id)) targetUrl = "https://www.arenafootball.co/";
                        else if ([458].includes(id)) targetUrl = "https://www.basket31.tv/";
                    }
                    if (targetUrl) autoUrl = targetUrl;
                } catch (e) { }

                // 1. TẠO BẢNG ĐIỀU KHIỂN (UI)
                const panel = document.createElement('div');
                panel.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#2c3e50;color:#ecf0f1;padding:20px;border-radius:10px;box-shadow:0 10px 25px rgba(0,0,0,0.5);z-index:9999999;font-family:Arial,sans-serif;width:320px;border:1px solid #34495e;';
                panel.innerHTML = `
                    <h3 style="margin:0 0 15px 0;font-size:16px;text-align:center;color:#f1c40f;">🚀 AUTO NHAPMA BYPASS</h3>
                    <div style="margin-bottom:10px;">
                        <label style="display:block;margin-bottom:5px;font-size:12px;color:#bdc3c7;">Chọn trang vệ tinh để lấy mã ngầm:</label>
                        <select id="nm-site-selector" style="width:100%;padding:8px;border-radius:5px;border:none;background:#34495e;color:#fff;outline:none;cursor:pointer;">
                            <option value="https://www.kdbdw.com/">kdbdw.com (ID: 301, 278, 279)</option>
                            <option value="https://breve.cc/">breve.cc (ID: 370, 371)</option>
                            <option value="https://www.arenafootball.co/">arenafootball.co (ID: 326)</option>
                        </select>
                    </div>
                    <div style="margin-bottom:10px;">
                        <label style="display:block;margin-bottom:5px;font-size:12px;color:#bdc3c7;">🆕 Nhập domain thủ công (ID mới chưa có):</label>
                        <div style="display:flex;gap:6px;">
                            <input id="nm-domain-input" type="text" placeholder="vd: example.com" style="flex:1;padding:8px;border-radius:5px;border:none;background:#34495e;color:#fff;outline:none;font-size:12px;" />
                            <button id="nm-add-domain-btn" style="padding:8px 12px;background:#8e44ad;color:#fff;border:none;border-radius:5px;font-weight:bold;cursor:pointer;font-size:12px;white-space:nowrap;">Thêm</button>
                        </div>
                    </div>
                    <button id="nm-start-btn" style="width:100%;padding:10px;background:#e74c3c;color:#fff;border:none;border-radius:5px;font-weight:bold;cursor:pointer;transition:0.3s;font-size:14px;">▶ BẮT ĐẦU CHẠY NGẦM</button>
                    <div id="nm-status" style="margin-top:15px;text-align:center;font-size:14px;font-weight:bold;color:#2ecc71;"></div>
                `;
                document.body.appendChild(panel);

                const btn = document.getElementById('nm-start-btn');
                const select = document.getElementById('nm-site-selector');
                const status = document.getElementById('nm-status');
                const domainInput = document.getElementById('nm-domain-input');
                const addDomainBtn = document.getElementById('nm-add-domain-btn');

                // Xử lý nút Thêm domain thủ công
                addDomainBtn.addEventListener('click', () => {
                    let raw = domainInput.value.trim();
                    if (!raw) return;
                    // Tự động thêm https:// nếu chưa có
                    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
                    // Đảm bảo kết thúc bằng /
                    if (!raw.endsWith('/')) raw += '/';
                    try {
                        const urlObj = new URL(raw);
                        const exists = Array.from(select.options).some(o => o.value === urlObj.href);
                        if (!exists) {
                            const opt = document.createElement('option');
                            opt.value = urlObj.href;
                            opt.innerText = urlObj.hostname + ' (Thủ công)';
                            select.appendChild(opt);
                        }
                        select.value = urlObj.href;
                        domainInput.value = '';
                        domainInput.placeholder = '✅ Đã thêm: ' + urlObj.hostname;
                        status.innerHTML = `🟣 Đã thêm domain <b>${urlObj.hostname}</b> - Nhấn Start để chạy!`;
                    } catch (e) {
                        status.innerHTML = '❌ Domain không hợp lệ!';
                        status.style.color = '#e74c3c';
                    }
                });

                // Cho phép nhấn Enter trong input để thêm domain
                domainInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') addDomainBtn.click();
                });

                // Nếu nhận diện thành công, tự động chọn và chạy
                if (autoUrl) {
                    let exists = Array.from(select.options).some(o => o.value === autoUrl);
                    if (!exists) {
                        const opt = document.createElement('option');
                        opt.value = autoUrl;
                        opt.innerText = new URL(autoUrl).hostname + " (Auto Detected)";
                        select.appendChild(opt);
                    }
                    select.value = autoUrl;
                    status.innerHTML = `🟢 Đã tự động nhận diện Web!<br>Hệ thống tự động chạy sau 1s...`;

                    setTimeout(() => btn.click(), 1000);
                }

                // 2. XỬ LÝ KHI BẤM NÚT
                btn.addEventListener('click', () => {
                    const targetUrl = select.value;
                    btn.disabled = true;
                    btn.style.background = '#95a5a6';
                    btn.innerText = 'ĐANG CHẠY...';

                    // Mở tab ngầm
                    GM_setValue('NHAPMA_TARGET_URL', targetUrl);
                    GM_setValue('NHAPMA_CURRENT_TIME', -1); // Reset thời gian
                    GM_openInTab(targetUrl, { active: false, insert: true });

                    status.innerHTML = `⏳ Đang mở trang ngầm và tìm nút lấy mã...`;
                });

                // Đồng bộ đếm ngược từ tab vệ tinh
                GM_addValueChangeListener('NHAPMA_CURRENT_TIME', (name, old_value, new_value, remote) => {
                    if (typeof new_value === 'number' && new_value >= 0 && status.innerHTML.indexOf('HOÀN THÀNH') === -1) {
                        status.innerHTML = `⏳ Thời gian thực từ web: <span style="color:#e74c3c;font-size:18px;">${new_value}</span>s`;
                        if (new_value === 0) {
                            status.innerHTML = '🔄 Đang gửi lệnh lấy mã... (Sắp xong!)';
                        }
                    }
                });

                // Lắng nghe sự kiện lấy mã thành công để dừng đếm giờ
                GM_addValueChangeListener('NHAPMA_CODE', (name, old_value, new_value, remote) => {
                    if (new_value && new_value.length > 3) {
                        status.innerHTML = '✅ HOÀN THÀNH!';
                        status.style.color = '#f1c40f';
                        btn.innerText = 'ĐÃ LẤY XONG MÃ';
                    }
                });

            });
        }

        // Hàm tự động điền mã và nộp
        function autoFillAndSubmit(code) {
            const input = document.querySelector('input[name="code"], input[placeholder*="mã"], input[placeholder*="Mã"]');
            if (input) {
                input.value = code;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));

                const submitForm = () => {
                    const submitBtn = document.querySelector('button[type="submit"], button.btn-primary');
                    if (submitBtn) {
                        submitBtn.click();
                    } else {
                        // Cứ enter thử
                        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
                    }
                };

                // Kiểm tra xem trang có Turnstile không
                const cfInput = document.querySelector('input[name="cf-turnstile-response"]');
                if (cfInput) {
                    showBanner('⏳ Đang chờ Cloudflare Turnstile...');
                    let _cfCheck = setInterval(() => {
                        if (cfInput.value) {
                            clearInterval(_cfCheck);
                            showBanner('🟢 Turnstile hợp lệ! Đang nộp mã...');
                            submitForm();
                        }
                    }, 500);
                } else {
                    showBanner('🟢 Không có Captcha, nộp mã luôn!');
                    submitForm();
                }
            }
        }

        return; // Dừng, không chạy các đoạn code vệ tinh bên dưới
    }

    // ==========================================
    // 2. TRANG ĐỐI TÁC (VỆ TINH)
    // ==========================================

    // Luôn Inject các script làm mù hệ thống chống tool của Web
    try {
        // 1. Phù phép lịch sử truy cập (luôn báo đến từ Google)
        if (!document.referrer.includes('google.com')) {
            Object.defineProperty(document, 'referrer', { get: () => 'https://www.google.com/' });
        }

        // 2. Phù phép trạng thái màn hình cực mạnh (luôn giữ web ở trạng thái Active kể cả khi chạy ngầm)
        Object.defineProperty(document, 'hidden', { get: () => false });
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
        Object.defineProperty(document, 'hasFocus', { value: () => true });

        // Bịt mắt các sự kiện báo rời tab
        window.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);
        window.addEventListener('blur', e => e.stopImmediatePropagation(), true);
        document.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);

        // Hack requestAnimationFrame (Trình duyệt thường đóng băng hàm này khi chuyển tab)
        unsafeWindow.requestAnimationFrame = function (cb) {
            return unsafeWindow.setTimeout(function () { cb(unsafeWindow.performance.now()); }, 1000 / 60);
        };
        unsafeWindow.cancelAnimationFrame = function (id) {
            unsafeWindow.clearTimeout(id);
        };

        // 3. Phù phép biến thời gian của các loại tool cũ (như Traffic68)
        Object.defineProperty(window, 'traffic_wait_time', { get: () => 1, set: () => { } });
        Object.defineProperty(window, 'link123swait_time', { get: () => 1, set: () => { } });
    } catch (e) { }

    // ==========================================
    // CỖ MÁY THỜI GIAN ĐƯỢC CÀI ĐẶT TỪ SỚM (unsafeWindow Injection)
    // ==========================================

    unsafeWindow.__nmSpeedUpActive = false;
    unsafeWindow.__nmAllTimers = [];
    let __timeOffset = 0;

    // 1. Hack Date.now() và new Date()
    const OrigDate = unsafeWindow.Date;
    const DateProxy = new Proxy(OrigDate, {
        construct(target, args) {
            if (args.length === 0 && unsafeWindow.__nmSpeedUpActive) {
                __timeOffset += 1000; // Mỗi lần gọi tăng 1s ảo
                return new target(OrigDate.now() + __timeOffset);
            }
            return new target(...args);
        }
    });
    DateProxy.now = function () {
        if (unsafeWindow.__nmSpeedUpActive) __timeOffset += 1000;
        return OrigDate.now() + __timeOffset;
    };
    DateProxy.parse = OrigDate.parse;
    DateProxy.UTC = OrigDate.UTC;
    unsafeWindow.Date = DateProxy;

    // 2. Hack performance.now()
    const origPerfNow = unsafeWindow.performance.now;
    let __perfOffset = 0;
    unsafeWindow.performance.now = function () {
        if (unsafeWindow.__nmSpeedUpActive) __perfOffset += 1000;
        return origPerfNow.call(unsafeWindow.performance) + __perfOffset;
    };

    // 3. Bắt cóc các hàm đếm giờ
    const origSetInterval = unsafeWindow.setInterval;
    unsafeWindow.setInterval = function (fn, delay, ...args) {
        if (unsafeWindow.__nmSpeedUpActive && delay > 10) delay = 1;
        const id = origSetInterval.call(unsafeWindow, fn, delay, ...args);
        if (delay >= 800) unsafeWindow.__nmAllTimers.push({ id, fn, args }); // Lưu ID để xóa khi cần
        return id;
    };

    const origSetTimeout = unsafeWindow.setTimeout;
    unsafeWindow.setTimeout = function (fn, delay, ...args) {
        if (unsafeWindow.__nmSpeedUpActive && delay >= 800) delay = 1;
        const id = origSetTimeout.call(unsafeWindow, fn, delay, ...args);
        if (delay >= 800) unsafeWindow.__nmAllTimers.push({ id, fn, args });
        return id;
    };

    // Đón lõng hàm Hủy giờ để không chạy oan uổng những hàm đã bị hủy (Gây lỗi Loading mãi mãi)
    const origClearInterval = unsafeWindow.clearInterval;
    unsafeWindow.clearInterval = function (id) {
        const idx = unsafeWindow.__nmAllTimers.findIndex(t => t.id === id);
        if (idx !== -1) unsafeWindow.__nmAllTimers.splice(idx, 1);
        return origClearInterval.call(unsafeWindow, id);
    };

    const origClearTimeout = unsafeWindow.clearTimeout;
    unsafeWindow.clearTimeout = function (id) {
        const idx = unsafeWindow.__nmAllTimers.findIndex(t => t.id === id);
        if (idx !== -1) unsafeWindow.__nmAllTimers.splice(idx, 1);
        return origClearTimeout.call(unsafeWindow, id);
    };

    function activateTimeSpoofer() {
        if (unsafeWindow.__nmSpeedUpActive) return;
        unsafeWindow.__nmSpeedUpActive = true;
        log('⏳ Đã BẬT CÔNG TẮC! Đang thi triển Nhẫn Thuật Thời Gian (Rapid Fire)...');

        // 4. Tuyệt Chiêu Đấm Liên Hoàn (Rapid Fire)
        origSetInterval.call(unsafeWindow, () => {
            if (!unsafeWindow.__nmSpeedUpActive) return;
            for (const timer of unsafeWindow.__nmAllTimers) {
                try {
                    if (typeof timer.fn === 'function') timer.fn(...timer.args);
                    else if (typeof timer.fn === 'string') eval(timer.fn);
                } catch (e) { }
            }
        }, 15);
    }

    // 5. NGHE TRỘM DATA TỪ SERVER TRẢ VỀ (XHR & Fetch Interceptor qua unsafeWindow)

    // Intercept XHR
    const origOpen = unsafeWindow.XMLHttpRequest.prototype.open;
    const origSend = unsafeWindow.XMLHttpRequest.prototype.send;
    unsafeWindow.XMLHttpRequest.prototype.open = function (m, u, ...a) {
        this.__url = String(u || '');
        return origOpen.apply(this, [m, u, ...a]);
    };
    unsafeWindow.XMLHttpRequest.prototype.send = function (body) {
        if (this.__url.includes('/step') || this.__url.includes('nhapma') || this.__url.includes('continue')) {
            this.addEventListener('readystatechange', function () {
                if (this.readyState === 4) {
                    try {
                        const data = JSON.parse(this.responseText);
                        checkAndExtractCode(data, 'XHR');
                    } catch (e) { }
                }
            });
        }
        return origSend.apply(this, arguments);
    };

    // Intercept Fetch
    const origFetch = unsafeWindow.fetch;
    if (origFetch) {
        unsafeWindow.fetch = async function (...args) {
            const url = String(args[0] || '');
            const response = await origFetch.apply(this, args);

            if (url.includes('/step') || url.includes('nhapma') || url.includes('continue') || url.includes('api/links')) {
                try {
                    const clone = response.clone();
                    clone.json().then(data => {
                        checkAndExtractCode(data, 'Fetch');
                    }).catch(e => { });
                } catch (e) { }
            }
            return response;
        };
    }

    // Hàm dùng chung để dò tìm mã từ kết quả trả về của Server
    function checkAndExtractCode(data, source) {
        const fields = ['code', 'password', 'ma', 'data'];
        for (let f of fields) {
            let val = data[f] || data?.data?.[f];
            if (val && typeof val === 'string' && val.length >= 3 && !/true|false|error/.test(val)) {
                log(`✅ LỤM MÃ THÀNH CÔNG (${source}):`, val);

                // BẮN MÃ VỀ TAB GỐC QUA GM_STORAGE
                GM_setValue('NHAPMA_CODE', val);
                GM_setValue('NHAPMA_TARGET_URL', ''); // Reset dữ liệu rác

                // Tự sát (đóng tab vệ tinh) nếu được phép
                setTimeout(() => window.close(), 1000);
                return true;
            }
        }
        return false;
    }

    // Tự động tìm NÚT LẤY MÀ (NhapMa, Traffic68, Link123s, ...) và Click
    let clickCount = 0;
    let _pollBtn = setInterval(() => {
        let btn = null;

        // Các selector phổ biến của các trang rút gọn
        const selectors = [
            'img[src*="angular"]', 'img[src*="nhapma"]', 'button.btn-danger', // NhapMa
            '#traffic68-btn', '.traffic-btn', '[id*="traffic"]', '[class*="traffic"]', // Traffic68
            '#link123s-btn', '.link123s', // Link123s
            '#btn-get-code', '.btn-get-code'
        ];

        for (let sel of selectors) {
            let el = document.querySelector(sel);
            if (el) {
                btn = el.closest('button') || el.closest('a') || el;
                break;
            }
        }

        // Fallback: Tìm bằng chữ "Lấy Mã" hoặc "Get Code"
        if (!btn) {
            const elements = document.querySelectorAll('button, a, div.btn');
            for (let el of elements) {
                const text = el.innerText || '';
                if (/Lấy Mã|Get Code|Lấy link|Click để lấy/i.test(text) && el.offsetHeight > 0) {
                    btn = el;
                    break;
                }
            }
        }

        if (btn) {
            const wrapper = btn.closest('[data-time]') || btn.parentElement;

            if (clickCount === 0) {
                log('🖱️ Bấm khởi động...');
                btn.click();
                clickCount++;
            } else if (clickCount === 1) {
                log('🖱️ Bấm kích hoạt đếm giờ...');

                // KHÔNG DÙNG Time Spoofer cho NhapMa vì Server check thời gian rất gắt (90s).
                // Nếu tua nhanh, Server sẽ trả về {success: false} và Widget bị kẹt ở chữ "LOADING..." vĩnh viễn!
                // Thay vào đó, cứ để nó đếm ngầm 90s bình thường trong tab ẩn.
                // activateTimeSpoofer(); 

                btn.click();
                clickCount++;

                // Ép data-time trên giao diện cho đẹp, nhưng KHÔNG TUA NHANH Date.now()
                // Widget sẽ gọi API đúng thời điểm Server cho phép.
                setInterval(() => {
                    document.querySelectorAll('[data-time]').forEach(el => {
                        const t = parseInt(el.getAttribute('data-time') || '0');

                        // ĐỒNG BỘ THỜI GIAN THỰC TẾ VỀ BẢNG ĐIỀU KHIỂN
                        GM_setValue('NHAPMA_CURRENT_TIME', t);

                        if (t > 1) {
                            // Chỉ hiện thị thôi, không ép về 1 để tránh lỗi logic của widget
                            // el.setAttribute('data-time', '1');
                        }
                    });
                }, 500);
            } else if (clickCount >= 2) {
                // Kiểm tra xem đã đếm ngược xong chưa
                if (wrapper) {
                    const t = wrapper.getAttribute('data-time');
                    const isClickable = wrapper.getAttribute('data-click');

                    if (t === '0' && isClickable === 'true') {
                        log('🖱️ Đếm ngược xong, bấm phát cuối để lấy mã!');
                        btn.click();
                        wrapper.setAttribute('data-click', 'false'); // Chống spam
                    }
                }
            }
        }
    }, 500);

})();
