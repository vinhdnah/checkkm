// ==UserScript==
// @name         AUTO REG PRO
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Auto đăng ký, liên kết bank, mở trang code cho từng game
// @author       Vinhdnah
// @match        https://m.mmoo.team/*
// @match        https://m.789p1.vip/*
// @match        https://m.8nohu.vip/*
// @match        https://m.1go99.vip/*
// @match        https://m.1tt88.vip/*
// @match        https://m.3333win.cc/*
// @match        https://m.888vvv.bet/*
// ---- THÊM MATCH CHO SITE CODE ----
 // code MMOO
// @match        https://mmoocode.shop/*
// // code 789P
// @match        https://33wincode.com/*
// @match        https://789pcode.store/*
// // code GO99
// @match        https://go99code.store/*
// // code NOHU
// @match        https://nohucode.shop/*
// // code TT88
// @match        https://tt88code.win/*
// @match        https://88vvcode.com/*
// ----------------------------------
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @connect      ocr.space
// @connect      api.telegram.org
// @connect      autocaptcha.pro
// @connect      api.autocaptcha.pro
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@11
// ==/UserScript==
const GLOBAL_USERNAME = 'TAI_KHOAN';
(function () {
    'use strict';
    const USER_CONFIG = {
        USERNAME: GLOBAL_USERNAME,        
        PASSWORD: 'MAT_KHAU',               
        BANK_ACCOUNT: 'SO_TAI_KHOAN',         
        WITHDRAW_PASS: 'MK_RUT',     
        FULL_NAME: 'HO_TEN',  



        // CAPTCHA & Tele
        OCR_SPACE_API_KEY: 'K84534198888957',
        TELEGRAM_BOT_TOKEN: '8323903026:AAGS1nPTlqb58PzM9O-lfXrlgEJeJ4BPRXM',
        TELEGRAM_CHAT_ID: '5497327155',

        AUTO_START: true,
        DELAY_SHORT: 1500,
        DELAY_MEDIUM: 3500,
        DELAY_LONG: 6000,
        DEBUG: true,
        AUTOCAPTCHA_KEY: 'bd388f89ab05276b17414163da80028a',
        SHOW_TOAST: true
    };

    // ========== BIẾN TOÀN CỤC ==========
    let isRunning = false;
    let isBankLinking = false;
    let currentUsername = '';
    let currentPassword = '';
    let toastContainer = null;
    let savedAccounts = GM_getValue('mmoo_saved_accounts', []);

    const sleep = (ms) => new Promise((r) => {
        const base = Number(ms) || 0;
        // Thêm jitter để thời gian chờ tự nhiên hơn, vẫn giữ nguyên cách gọi sleep(...)
        const min = Math.max(0, Math.floor(base * 0.9));
        const max = Math.max(min, Math.floor(base * 1.6) + 200);
        const t = Math.floor(Math.random() * (max - min + 1)) + min;
        setTimeout(r, t);
    });


    // ========== TOAST (GÓC TRÁI TRÊN) ==========
    function initToast() {
        if (!USER_CONFIG.SHOW_TOAST) return;

        if (!document.getElementById('mmooToast')) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'mmooToast';
            toastContainer.style.cssText = `
                position: fixed; top: 10px; left: 10px; z-index: 1000000;
                max-width: 300px; pointer-events: none;
            `;
            document.body.appendChild(toastContainer);
        } else {
            toastContainer = document.getElementById('mmooToast');
        }

        GM_addStyle(`
            @keyframes mmooSlideIn {
                from { transform: translateX(-120%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes mmooFadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
        `);
    }

    function showToast(message, type = 'info', duration = 2000) {
        if (!USER_CONFIG.SHOW_TOAST || !toastContainer) return;

        const colors = {
            info: '#0ea5e9',
            success: '#22c55e',
            warning: '#f59e0b',
            error: '#ef4444'
        };

        const toast = document.createElement('div');
        toast.style.cssText = `
            background: ${colors[type]}; color: white; padding: 8px 12px; margin-bottom: 8px;
            border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-size: 12px;
            animation: mmooSlideIn 0.2s ease-out, mmooFadeOut 0.3s ease-out ${duration - 300}ms forwards;
        `;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    }

    function log(message, data = null) {
        if (!USER_CONFIG.DEBUG) return;
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[AUTO-REG PRO] [${timestamp}] ${message}`, data || '');

        if (message.includes('✅') || message.includes('❌') || message.includes('⚠️')) {
            const type = message.includes('✅') ? 'success' :
                message.includes('❌') ? 'error' : 'warning';
            showToast(message.replace(/[✅❌⚠️]/g, '').trim(), type);
        }
    }

    function randomString(length, chars = 'abcdefghjkmnpqrstuvwxyz0123456789') {
        return Array(length).fill().map(() =>
            chars[Math.floor(Math.random() * chars.length)]
        ).join('');
    }

    function getBrandAndCodeUrl() {
        const host = window.location.host.toLowerCase();
        if (host.includes('mmoo')) return { brand: 'MMOO', codeUrl: 'https://mmoocode.shop/' };
        if (host.includes('33win')) return { brand: '33WIN', codeUrl: 'https://33wincode.com/' };
        if (host.includes('789')) return { brand: '789P', codeUrl: 'https://789pcode.store/' };
        if (host.includes('go99')) return { brand: 'GO99', codeUrl: 'https://go99code.store/' };
        if (host.includes('88vv')) return { brand: '88VV', codeUrl: 'https://88vvcode.com/' };
        if (host.includes('nohu')) return { brand: 'NOHU', codeUrl: 'http://nohucode.shop/' };
        if (host.includes('tt88')) return { brand: 'TT88', codeUrl: 'https://tt88code.win/' };
        return { brand: 'UNKNOWN', codeUrl: '' };
    }

    // thêm HÀM MỚI: trả landing URL theo domain
    function getLandingUrlForCurrentDomain() {
        const host = window.location.host.toLowerCase();
        if (host.includes('mmoo')) return 'https://m.mmoo.team/?f=394579&app=1';
        if (host.includes('789')) return 'https://m.789p1.vip/?f=784461&app=1';
        if (host.includes('8nohu')) return 'https://m.8nohu.vip/?f=6344995&app=1';
        if (host.includes('go99')) return 'https://m.1go99.vip/?f=3528698&app=1';
        if (host.includes('tt88')) return 'https://m.1tt88.vip/?f=3535864&app=1';
        if (host.includes('88vv')) return 'https://m.888vvv.bet/?f=1054152&app=1';
        if (host.includes('33win')) return 'https://m.3333win.cc/?f=3115867&app=1';
        return null;
    }

    // thêm HÀM MỚI: redirect về landing khi captcha fail
    function restartToLanding(reason = '') {
        const landingUrl = getLandingUrlForCurrentDomain();
        if (!landingUrl) {
            log('⚠️ Không xác định được landing URL để restart', reason);
            return;
        }
        log(`🔁 Restart về landing: ${landingUrl} (lý do: ${reason})`);
        showToast('🔁 Captcha lỗi, quay lại trang bắt đầu...', 'warning', 2500);
        setTimeout(() => {
            window.location.href = landingUrl;
        }, 500);
    }

    // thêm HÀM MỚI: mở trang code (new tab + fallback)
    function openCodeSite() {
        const { codeUrl } = getBrandAndCodeUrl();
        if (!codeUrl) {
            log('⚠️ Không xác định được codeUrl theo domain');
            return;
        }
        log(`🔀 Mở trang code: ${codeUrl}`);
        // thử mở tab mới
        const win = window.open(codeUrl, '_blank');
        if (!win) {
            // nếu bị chặn popup → chuyển luôn tab hiện tại
            log('⚠️ window.open bị chặn, chuyển tab hiện tại sang codeUrl');
            window.location.href = codeUrl;
        }
    }



// ========== CAPTCHA (API V3 - IMAGETOTEXT) ==========
    async function solveCaptcha(maxRetries = 100) {
        log('🔍 Đang giải captcha (API v3 Image)...');
        const checkCodeInput = $('input[formcontrolname="checkCode"]');
        if (!checkCodeInput.length) throw new Error('Không tìm thấy ô nhập captcha');

        const container = checkCodeInput.closest('div');
        const refreshBtn = container.find('i.fas.fa-sync').first();
        
        let attempts = 0;
        let lastCaptchaSrc = '';

        while (attempts < maxRetries) {
            try {
                attempts++;
                
                // 1. Lấy ảnh Captcha
                const captchaImg = container.find('img[src^="data:image"]').first();
                if (!captchaImg.length) throw new Error('Không tìm thấy ảnh');

                const src = captchaImg.attr('src'); // Lấy nguyên chuỗi data:image/png;base64,...
                
                if (src === lastCaptchaSrc && attempts > 1 && refreshBtn.length) {
                    refreshBtn[0].click();
                    await sleep(2000);
                    continue;
                }
                lastCaptchaSrc = src;

                // 2. Gửi Request API v3
                const captchaText = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'POST',
                        url: 'https://autocaptcha.pro/apiv3/process', //
                        headers: { 'Content-Type': 'application/json' },
                        data: JSON.stringify({
                            key: USER_CONFIG.AUTOCAPTCHA_KEY,
                            type: "imagetotext",  //
                            img: src              // (Dùng key là 'img', gửi nguyên src)
                        }),
                        timeout: 25000,
                        onload: r => {
                            try {
                                if (r.responseText.trim().startsWith('<')) {
                                    reject(new Error('Server trả về HTML lỗi'));
                                    return;
                                }

                                const data = JSON.parse(r.responseText);
                                // Kiểm tra kết quả: success=true và có captcha
                                if (data.success) {
                                    log(`✅ Giải thành công: ${data.captcha}`);
                                    resolve(data.captcha);
                                } else {
                                    reject(new Error(data.message || 'Lỗi API v3'));
                                }
                            } catch (e) {
                                console.error("Parse Error:", e);
                                reject(new Error('Lỗi phân tích JSON'));
                            }
                        },
                        onerror: () => reject(new Error('Lỗi kết nối mạng')),
                        ontimeout: () => reject(new Error('Timeout'))
                    });
                });

                return captchaText;

            } catch (error) {
                log(`❌ Lỗi lần ${attempts}: ${error.message}`);
                
                // Nếu lỗi, thử refresh
                if (attempts >= maxRetries) {
                    checkCodeInput.focus();
                    throw error;
                }
                
                if (refreshBtn.length) {
                    refreshBtn[0].click();
                    await sleep(2000);
                } else {
                    await sleep(2000);
                }
            }
        }
    }


    // ========== ĐIỀN FORM ĐĂNG KÝ ==========
    async function fillRegistrationForm(username, password) {
        log(`📝 Điền form đăng ký: ${username}`);

        const fields = [
            { selector: 'input[formcontrolname="account"]', value: username },
            { selector: 'input[formcontrolname="password"]', value: password },
            { selector: 'input[formcontrolname="confirmPassword"]', value: password },
            { selector: 'input[formcontrolname="moneyPassword"]', value: USER_CONFIG.WITHDRAW_PASS },
            { selector: 'input[formcontrolname="name"]', value: USER_CONFIG.FULL_NAME }
        ];

        for (const field of fields) {
            const input = $(field.selector);
            if (input.length) {
                input.val(field.value);
                input[0].dispatchEvent(new Event('input', { bubbles: true }));
                input[0].dispatchEvent(new Event('change', { bubbles: true }));
                await sleep(300);
            }
        }

        const agree = $('input[formcontrolname="agree"]');
        if (agree.length) {
            agree.prop('checked', true);
            agree[0].dispatchEvent(new Event('change', { bubbles: true }));
        }

        log('✅ Đã điền form đăng ký');
    }

    async function submitRegistrationForm() {
        log('🚀 Submit form đăng ký...');
        const form = $('input[formcontrolname="account"]').closest('form')[0];
        if (!form) throw new Error('Không tìm thấy form đăng ký');

        const submitBtn = $(form).find('button[type="submit"]').first()[0];
        if (!submitBtn) throw new Error('Không tìm thấy nút submit');

        let attempts = 0;
        while ((submitBtn.disabled || submitBtn.hasAttribute('disabled')) && attempts < 10) {
            log(`⚠️ Nút đăng ký disabled, chờ... (${attempts + 1}/10)`);
            await sleep(1000);
            attempts++;
        }

        if (submitBtn.disabled || submitBtn.hasAttribute('disabled')) {
            // Ép enable nếu vẫn disabled
            submitBtn.disabled = false;
            submitBtn.removeAttribute('disabled');
            log('⚠️ Ép enable nút đăng ký');
        }

        if (typeof form.requestSubmit === 'function') {
            form.requestSubmit(submitBtn);
        } else {
            submitBtn.click();
        }

        await sleep(USER_CONFIG.DELAY_LONG);
        log('✅ Đã submit form đăng ký');
    }

    // ========== NÚT "LẬP TỨC NẠP TIỀN" & TAB ==========
    async function clickInstantDeposit() {
        log('💰 Tìm nút "Lập tức nạp tiền"...');
        let attempts = 0;
        while (attempts < 15) {
            const btn = $('button:contains("lập tức nạp tiền"), button:contains("Lập tức nạp tiền"), button:contains("LẬP TỨC NẠP TIỀN")').first();
            if (btn.length && btn.is(':visible')) {
                log('✅ Click "Lập tức nạp tiền"');
                btn[0].click();
                await sleep(2000);
                return true;
            }
            await sleep(1000);
            attempts++;
        }
        throw new Error('Không tìm thấy nút "Lập tức nạp tiền"');
    }

    async function waitForFinancialTab1() {
        log('⏳ Chờ vào trang Financial?tab=1 ...');
        let attempts = 0;
        while (attempts < 20) {
            if (window.location.href.includes('/Financial?tab=1')) {
                log('✅ Đang ở Financial?tab=1');
                return true;
            }
            await sleep(1000);
            attempts++;
        }
        throw new Error('Không vào được /Financial?tab=1');
    }

    async function switchToWithdrawTab() {
        log('🔄 Chuyển sang tab Rút Tiền (tab=2)...');

        // Nếu URL dạng tab=1 => đổi sang 2
        if (window.location.href.includes('/Financial?tab=1')) {
            window.location.href = window.location.href.replace('tab=1', 'tab=2');
            await sleep(2500);
        }

        // Dự phòng: click tab "Rút Tiền"
        const tab = $('ul.top-tab li:contains("Rút Tiền"), ul.top-tab li:contains("RÚT TIỀN")').first();
        if (tab.length) {
            tab[0].click();
            await sleep(2000);
        }

        if (!window.location.href.includes('/Financial?tab=2')) {
            log('⚠️ URL chưa thấy tab=2 nhưng vẫn tiếp tục thử form rút tiền');
        } else {
            log('✅ Đã ở Financial?tab=2');
        }
    }

    // ========== LIÊN KẾT BANK ==========
    async function linkBankAccount() {
        if (isBankLinking) return;
        isBankLinking = true;

        try {
            if (!USER_CONFIG.BANK_ACCOUNT) {
                throw new Error('Chưa cấu hình BANK_ACCOUNT trong script');
            }

            showToast('🏦 Đang xử lý liên kết ngân hàng...', 'info', 2500);
            log('🏦 Bắt đầu liên kết ngân hàng...');

            // 0) Nếu đã có "Thông tin ngân hàng" => bank đã liên kết, mở code luôn
            let infoSection = $('h2.bank-info:contains("Thông tin ngân hàng"), h2:contains("Thông tin ngân hàng")').closest('section');
            if (infoSection.length) {
                log('ℹ️ Đã thấy khung "Thông tin ngân hàng" => bank đã liên kết.');
                openCodeSite();
                return true;
            }

            // 1) Thử mở form "Thêm ngân hàng"
            const addBankBtn = $('li.method:contains("Thêm ngân hàng"), li:contains("Thêm ngân hàng")').first();
            if (addBankBtn.length) {
                addBankBtn[0].click();
                await sleep(1500);
            }

            // 2) Chờ form (input account) hoặc bank-info xuất hiện
            let attempts = 0;
            while ($('input[formcontrolname="account"]').length === 0 && attempts < 10) {
                infoSection = $('h2.bank-info:contains("Thông tin ngân hàng"), h2:contains("Thông tin ngân hàng")').closest('section');
                if (infoSection.length) {
                    log('ℹ️ Trong lúc chờ form thì khung "Thông tin ngân hàng" xuất hiện => bank đã liên kết.');
                    openCodeSite();
                    return true;
                }
                await sleep(800);
                attempts++;
            }

            const accInputExist = $('input[formcontrolname="account"]').length > 0;

            // 3) Nếu không còn form luôn => coi như đã liên kết / không cần thêm => mở code
            if (!accInputExist) {
                log('ℹ️ Không thấy form thêm ngân hàng -> coi như bank đã liên kết, mở code.');
                openCodeSite();
                return true;
            }

            // 4) Thực sự điền form ngân hàng
            log('🔍 Thấy form ngân hàng, tiến hành điền MBBANK...');

            // Chọn MBBANK
            const bankSelect = $('mat-select[formcontrolname="bankName"]').first();
            if (bankSelect.length) {
                bankSelect[0].click();
                await sleep(1000);
                const mbOption = $('mat-option span:contains("MBBANK"), .mat-option-text:contains("MBBANK")').first();
                if (mbOption.length) {
                    mbOption.closest('mat-option')[0].click();
                    log('✅ Đã chọn MBBANK');
                } else {
                    log('⚠️ Không tìm thấy MBBANK trong danh sách, vẫn tiếp tục.');
                }
            } else {
                log('⚠️ Không tìm thấy mat-select bankName, bỏ qua chọn bank.');
            }

            await sleep(800);

            // Chi nhánh = "hn"
            const branchInput = $('input[formcontrolname="city"]').first();
            if (branchInput.length) {
                branchInput.val('hn');
                branchInput[0].dispatchEvent(new Event('input', { bubbles: true }));
                branchInput[0].dispatchEvent(new Event('blur', { bubbles: true }));
                log('✅ Điền chi nhánh: hn');
            }

            await sleep(500);

            // Số tài khoản
            const accInput = $('input[formcontrolname="account"]').first();
            if (accInput.length) {
                accInput.val(USER_CONFIG.BANK_ACCOUNT);
                accInput[0].dispatchEvent(new Event('input', { bubbles: true }));
                accInput[0].dispatchEvent(new Event('blur', { bubbles: true }));
                log(`✅ Điền STK: ${USER_CONFIG.BANK_ACCOUNT}`);
            }

            await sleep(1000);

            // Nút "Gửi đi"
            const getSubmitBtn = () => {
                // Ưu tiên selector bền (nếu có translate)
                let btn = $('button[type="submit"].btn-submit span[translate="Common_Submit"]').closest('button').first();
                if (!btn.length) {
                    // Fallback theo text in hoa (đúng với HTML bạn đưa)
                    btn = $('button[type="submit"]:contains("GỬI ĐI")').first();
                }
                if (!btn.length) {
                    // Fallback cuối: bất kỳ submit button nào đang hiển thị
                    btn = $('button[type="submit"]').filter(':visible').first();
                }
                return btn;
            };

            let submitBtn = getSubmitBtn();
            if (!submitBtn.length) {
                log('⚠️ Không tìm thấy nút "GỬI ĐI" sau khi điền form.');
            } else {
                attempts = 0;

                // Chờ enable (re-query mỗi vòng để tránh Angular render lại)
                while (attempts < 15) {
                    submitBtn = getSubmitBtn();
                    if (!submitBtn.length) break;

                    const isDisabled = submitBtn.prop('disabled') || submitBtn.is('[disabled]');
                    if (!isDisabled) break;

                    log(`⏳ Nút GỬI ĐI disabled, chờ... (${attempts + 1}/15)`);

                    ['input[formcontrolname="city"]', 'input[formcontrolname="account"]'].forEach(sel => {
                        const inp = $(sel).first();
                        if (inp.length) {
                            inp[0].dispatchEvent(new Event('input', { bubbles: true }));
                            inp[0].dispatchEvent(new Event('change', { bubbles: true }));
                            inp[0].dispatchEvent(new Event('blur', { bubbles: true }));
                        }
                    });

                    await sleep(800);
                    attempts++;
                }

                // Lấy lại lần cuối trước khi submit
                submitBtn = getSubmitBtn();
                if (!submitBtn.length) {
                    log('⚠️ Nút GỬI ĐI biến mất.');
                } else {
                    // Nếu vẫn disabled thì ép enable (giữ hành vi cũ của bạn)
                    if (submitBtn.prop('disabled') || submitBtn.is('[disabled]')) {
                        submitBtn.prop('disabled', false);
                        submitBtn.removeAttr('disabled');
                        log('⚠️ Ép enable nút GỬI ĐI');
                    }

                    log('✅ Submit "GỬI ĐI"...');

                    const btnEl = submitBtn[0];
                    const formEl = submitBtn.closest('form')[0];

                    // Đa web: ưu tiên requestSubmit (SPA), fallback click (web cũ)
                    if (formEl && typeof formEl.requestSubmit === 'function') {
                        formEl.requestSubmit(btnEl);
                    } else {
                        btnEl.click();
                    }

                    await sleep(2500);
                }
            }


            // 5) Dù form thế nào đi nữa, sau bước gửi → mở trang code
            openCodeSite();
            showToast('✅ Đã gửi form bank (hoặc bỏ qua) & mở trang code', 'success', 2500);
            return true;

        } catch (err) {
            log(`❌ Lỗi liên kết bank: ${err.message}`);
            // Có lỗi vẫn cố mở code để bạn lấy code tay
            openCodeSite();
            showToast(`⚠️ Bank lỗi: ${err.message}, nhưng đã mở code`, 'warning', 3000);
            return false;
        } finally {
            isBankLinking = false;
        }
    }




    // ========== TELEGRAM ==========
    async function sendTelegram(username, password) {
        if (!USER_CONFIG.TELEGRAM_BOT_TOKEN || !USER_CONFIG.TELEGRAM_CHAT_ID) return;

        const { brand } = getBrandAndCodeUrl();
        const text = `<b>${brand}</b>\n👤 TK: <code>${username}</code>\n🔑 MK: <code>${password}</code>`;

        GM_xmlhttpRequest({
            method: 'POST',
            url: `https://api.telegram.org/bot${USER_CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            data: `chat_id=${USER_CONFIG.TELEGRAM_CHAT_ID}&parse_mode=HTML&text=${encodeURIComponent(text)}`
        });
    }


    async function clickRegisterButton(maxAttempts = 10) {
        const selectors = [
            // === THÊM MỚI: Nút <a> ĐĂNG KÝ ===
            'a.btn-login[routerlink="/Account/Register"]',
            'a[routerlink="/Account/Register"]:contains("ĐĂNG KÝ")',
            'a[href="/Account/Register"]:contains("ĐĂNG KÝ")',
            'a:contains("ĐĂNG KÝ")[href="/Account/Register"]',
            
            // Nút đăng ký mới bạn cung cấp
            'button.btn-reg[routerlink="/Account/Register"]',
            'button[routerlink="/Account/Register"]:contains("Đăng ký")',

            // GO99 / MMOO / 789 / TT88 dạng cũ
            'li.btn-reg[routerlink="/Account/Register"]',
            'button[routerlink*="/Account/Register"]',
            'li[routerlink*="/Account/Register"]',

            // Tìm theo text fallback (THÊM <a> vào đây)
            'a:contains("Đăng ký")',
            'a:contains("ĐĂNG KÝ")',
            'button:contains("Đăng ký")',
            'li:contains("Đăng ký")',
            'button:contains("ĐĂNG KÝ")',
            'li:contains("ĐĂNG KÝ")'
        ];

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            log(`🔎 Tìm nút Đăng ký (lần ${attempt}/${maxAttempts})...`);

            for (const sel of selectors) {
                const btn = $(sel).first();
                if (btn.length && btn.is(':visible')) {
                    log(`👉 Thấy nút đăng ký qua selector: ${sel}`);
                    btn[0].click();
                    return true;
                }
            }

            await sleep(400);
        }

        log('😵 Không thể click nút Đăng ký');
        return false;
    }



    // ========== MAIN ==========
    async function mainProcess() {
        if (isRunning) return;
        isRunning = true;
        showToast('🚀 Bắt đầu quy trình auto...', 'info', 2500);

        try {
            // 1. Đảm bảo đang ở trang đăng ký
            const url = window.location.href;
            const isRegisterPage = $('input[formcontrolname="account"]').length > 0;
            const isFinancialPage = url.includes('/Financial');

            if (!isRegisterPage && !isFinancialPage) {
                log('🔀 Đang tìm nút đăng ký…');

                const clicked = await clickRegisterButton();
                if (!clicked) {
                    log('⚠️ Không tìm thấy nút đăng ký → chuyển hướng trực tiếp /Account/Register');
                    window.location.href = '/Account/Register';
                }

                await sleep(3000);
            }


            // Nếu đã ở trang Financial (auto chạy bank) thì bỏ qua đăng ký
            if (!window.location.href.includes('/Financial')) {
                // 2. Tạo TK/MK
                if (USER_CONFIG.USERNAME) {
                    currentUsername = USER_CONFIG.USERNAME;
                } else {
                    currentUsername = randomString(8);
                }

                if (USER_CONFIG.PASSWORD) {
                    currentPassword = USER_CONFIG.PASSWORD;
                } else {
                    currentPassword = randomString(10, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
                }

                const { brand } = getBrandAndCodeUrl();
                log(`👤 TK: ${currentUsername} | Game: ${brand}`);
                log(`🔑 MK: ${currentPassword}`);

                savedAccounts.push({
                    username: currentUsername,
                    password: currentPassword,
                    game: brand,
                    time: new Date().toISOString()
                });
                GM_setValue('mmoo_saved_accounts', savedAccounts.slice(-200));

                sendTelegram(currentUsername, currentPassword);

                // 3. Điền form đăng ký
                await fillRegistrationForm(currentUsername, currentPassword);
                await sleep(USER_CONFIG.DELAY_MEDIUM);

                // 4. CAPTCHA
                const captchaText = await solveCaptcha();
                const captchaInput = $('input[formcontrolname="checkCode"]').first();
                if (captchaInput.length) {
                    captchaInput.val(captchaText);
                    captchaInput[0].dispatchEvent(new Event('input', { bubbles: true }));
                }
                await sleep(USER_CONFIG.DELAY_SHORT);

                // 5. Submit form
                await submitRegistrationForm();

                // Sau đăng ký xong hệ thống thường về trang home → click "Lập tức nạp tiền"
                await clickInstantDeposit();
                await waitForFinancialTab1();
            }

            // 6. Đang ở tab=1 → chuyển tab=2
            await switchToWithdrawTab();

            // 7. Liên kết bank + mở code
            await linkBankAccount();

            log('🎉 QUY TRÌNH HOÀN TẤT');
            showToast('🎉 Hoàn tất toàn bộ!', 'success', 3000);
        } catch (err) {
            log(`❌ Lỗi main: ${err.message}`);
            showToast(`❌ ${err.message}`, 'error', 4000);
        } finally {
            isRunning = false;
        }
    }



    // ========== AUTO ĐÓNG POPUP LANDING & MỞ ĐĂNG KÝ ==========
    async function autoFromLanding() {
        const url = window.location.href;
        const isLanding = url.includes('/?f=') && url.includes('&app=1');
        if (!isLanding) return;

        log('🔍 Landing game, tự đóng popup & mở đăng ký...');
        await sleep(2000);

        // ---------- 1) AUTO ĐÓNG TẤT CẢ POPUP (ĐÓNG / GOT IT / BIẾT RỒI) ----------
        const closeSelectors = [
            // POPUP 1: button translate="Common_Closed"
            'button[translate="Common_Closed"]',
            'button[translate="Common_Closed"]:contains("Đóng")',
            
            // POPUP 2: button translate="Announcement_GotIt"
            'button[translate="Announcement_GotIt"]',
            'button[translate="Announcement_GotIt"]:contains("Đóng")',
            
            // Các nút đóng khác
            'button:contains("Đóng")',
            'button:contains("TÔI BIẾT RỒI")',
            'button[translate="Common_Close"]',
            'button[translate="Announcement_GotIt"]:contains("TÔI BIẾT RỒI")'
        ];

        for (let i = 0; i < 5; i++) { // tối đa 5 popup liên tiếp
            let closed = false;

            for (const sel of closeSelectors) {
                const btn = $(sel).filter(':visible').first();
                if (btn.length) {
                    const btnText = btn.text().trim();
                    log(`✅ Auto đóng popup: ${btnText || sel}`);
                    btn[0].click();
                    await sleep(700);
                    closed = true;
                    break;
                }
            }

            if (!closed) break;
        }

        // ---------- 2) CLICK NÚT ĐĂNG KÝ ----------
        // Ưu tiên selector mới bạn cung cấp
        let regBtn = $(
            'a.btn-login[routerlink="/Account/Register"]'
        ).filter(':visible').first();

        // fallback: các selector khác
        if (!regBtn.length) {
            regBtn = $(
                'a[routerlink="/Account/Register"]:contains("ĐĂNG KÝ"), ' +
                'a[href="/Account/Register"]:contains("ĐĂNG KÝ"), ' +
                'button.btn-reg[routerlink="/Account/Register"], ' +
                'button[routerlink="/Account/Register"], ' +
                'a[routerlink="/Account/Register"], ' +
                'a[href="/Account/Register"]'
            ).filter(':visible').first();
        }

        // fallback cuối: tìm theo text
        if (!regBtn.length) {
            regBtn = $(
                'a:contains("ĐĂNG KÝ"), ' +
                'a:contains("Đăng ký"), ' +
                'button:contains("Đăng ký"), ' +
                'button:contains("ĐĂNG KÝ"), ' +
                'li:contains("Đăng ký"), ' +
                'li:contains("ĐĂNG KÝ")'
            ).filter(':visible').first();
        }

        if (regBtn.length) {
            log('✅ Click nút Đăng ký (landing)');
            // Cuộn đến nút nếu cần
            regBtn[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(300);
            regBtn[0].click();
            await sleep(1000);
            return;
        }

        log('⚠️ Không thấy nút Đăng ký ở landing → để mainProcess xử lý');
    }




    // ========== INIT ==========
    function init() {
        initToast();
        log('🔧 Khởi tạo AUTO REG PRO (no GUI)');

        autoFromLanding();

        if (USER_CONFIG.AUTO_START) {
            // Chờ có form đăng ký hoặc trang Financial rồi chạy 1 lần
            let started = false;
            const checkInterval = setInterval(() => {
                if (started) return;

                if ($('input[formcontrolname="account"]').length > 0 ||
                    window.location.href.includes('/Financial')) {
                    started = true;
                    clearInterval(checkInterval);
                    log('🚀 Auto start mainProcess');
                    mainProcess();
                }
            }, 1000);
        }
    }

    $(document).ready(init);
})();


// ======================================================================
// ========= PHẦN THÊM: AUTO AUDIO CAPTCHA TRÊN TRANG CODE ===============
// ======================================================================

(function () {
    'use strict';

    const host = window.location.host.toLowerCase();
    const IS_CODE_SITE = /mmoocode\.shop|789pcode\.store|33wincode\.com|go99code\.store|88vvcode\.com|nohucode\.shop|tt88code\.win|tt88cade\.win/.test(host);

    if (!IS_CODE_SITE) return; // chỉ chạy phần này ở trang code

    // ====== CẤU HÌNH AUDIO CAPTCHA (y nguyên script bạn gửi) ======
    const CONFIG = {
        USERNAME: GLOBAL_USERNAME,               // ví dụ: 'vinhauto01'
        API_KEY: 'bd388f89ab05276b17414163da80028a', // API key autocaptcha.pro
        API_URL: 'https://autocaptcha.pro/apiv3/process',
        DEBUG_MODE: true
    };

    console.log('🎯 Full Auto Audio Captcha Bypass + Submit (CODE SITE) loaded');

    function showMsg(text, type = 'info') {
        const msg = document.createElement('div');
        msg.textContent = text;
        msg.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 999999;
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
            color: white;
            padding: 8px 15px;
            border-radius: 4px;
            font-size: 13px;
            font-family: Arial;
            opacity: 0;
            transform: translateX(100px);
            transition: all 0.3s;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;
        document.body.appendChild(msg);
        setTimeout(() => {
            msg.style.opacity = '1';
            msg.style.transform = 'translateX(0)';
        }, 10);
        setTimeout(() => {
            msg.style.opacity = '0';
            setTimeout(() => msg.remove(), 300);
        }, 3000);
    }

    function logDebug(...args) {
        if (CONFIG.DEBUG_MODE) {
            console.log('[AUDIO CAPTCHA CODE]', ...args);
        }
    }

    // TỰ ĐỘNG NHẬP TÀI KHOẢN (nếu muốn dùng CONFIG.USERNAME)
    function fillUsername() {
        const usernameInput = document.querySelector('#ten_tai_khoan');
        if (usernameInput && !usernameInput.value) {
            usernameInput.value = CONFIG.USERNAME;
            usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
            showMsg('✅ Đã nhập tài khoản', 'success');
            logDebug('Filled username');
            return true;
        }
        return false;
    }

    function selectTaiApp() {
        const kmBtn = document.querySelector('#kmBtn');
        if (kmBtn) {
            kmBtn.click();
            showMsg('✅ Đã mở chọn khuyến mãi', 'success');
            logDebug('Opened promotion selection');

            setTimeout(() => {
                const taiAppRow = document.querySelector(
                    'tr[data-ma="TAIAPP"], tr[data-ma="TAI APP"]'
                );

                if (taiAppRow) {
                    taiAppRow.click();
                    showMsg('✅ Đã chọn TAIAPP', 'success');
                    logDebug('Selected TAIAPP');

                    setTimeout(() => {
                        const closeBtn = document.querySelector('#kmClose');
                        if (closeBtn) {
                            closeBtn.click();
                            showMsg('✅ Đã đóng popup chọn khuyến mãi', 'success');
                            logDebug('Closed promotion popup');
                        }
                    }, 800);
                } else {
                    logDebug('Không tìm thấy dòng TAIAPP');
                }
            }, 1200);

            return true;
        }
        return false;
    }


    function clickXacThucTaiDay() {
        const xacThucBtn = document.querySelector('#xacThucTaiDay');
        if (xacThucBtn) {
            xacThucBtn.click();
            showMsg('✅ Đã ấn "Xác thực tại đây"', 'success');
            logDebug('Clicked "Xác thực tại đây"');
            return true;
        }
        return false;
    }

    function createAudioCaptcha() {
        const showAudioBtn = document.querySelector('#showAudioCaptcha');
        if (showAudioBtn) {
            showAudioBtn.click();
            showMsg('✅ Đã mở popup audio captcha', 'success');
            logDebug('Opened audio captcha popup');

            setTimeout(() => {
                const generateBtn = document.querySelector('#generateAudioCaptcha');
                if (generateBtn) {
                    generateBtn.click();
                    showMsg('✅ Đã ấn "Tạo audio"', 'success');
                    logDebug('Clicked "Tạo audio"');
                }
            }, 1500);
            return true;
        }
        return false;
    }

    const seen = new Set();

    function scanResources() {
        const entries = performance.getEntriesByType('resource');
        for (const entry of entries) {
            const name = entry.name;
            if (!name) continue;

            if (/\.mp3(\?|$)/i.test(name) && !seen.has(name)) {
                seen.add(name);
                playAudio(name);
            }
        }
    }

    function playAudio(url) {
        console.log('🎧 FOUND MP3:', url);
        showMsg(`🎧 Đã bắt URL MP3: ${url.substring(0, 30)}...`, 'success');
        solveCaptcha(url);
    }

    function solveCaptcha(audioUrl) {
        showMsg('🔍 Đang giải captcha...', 'info');
        logDebug('Solving captcha for:', audioUrl);

        GM_xmlhttpRequest({
            method: 'POST',
            url: CONFIG.API_URL,
            data: JSON.stringify({
                key: CONFIG.API_KEY,
                type: 'speechtotext',
                body: audioUrl
            }),
            headers: {
                'Content-Type': 'application/json'
            },
            onload: function (response) {
                if (response.status === 200) {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.success) {
                            const captchaCode = data.captcha;
                            showMsg(`🎉 Giải xong: ${captchaCode}`, 'success');
                            logDebug('Captcha solved:', captchaCode);

                            fillCaptchaInput(captchaCode);
                            clickVerifyButton();
                        } else {
                            showMsg(`❌ Lỗi: ${data.message}`, 'error');
                            logDebug('Failed to solve captcha:', data.message);
                        }
                    } catch (e) {
                        showMsg('❌ Lỗi phân tích dữ liệu', 'error');
                        logDebug('Error parsing response:', e);
                    }
                } else {
                    showMsg(`❌ Lỗi HTTP: ${response.status}`, 'error');
                    logDebug('HTTP error:', response.status);
                }
            },
            onerror: function (error) {
                showMsg('❌ Lỗi kết nối API', 'error');
                logDebug('Request failed:', error);
            }
        });
    }

    function fillCaptchaInput(captchaCode) {
        const input = document.querySelector('#audioCaptchaInput');
        if (input) {
            input.value = captchaCode;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            showMsg(`✅ Đã điền: ${captchaCode}`, 'success');
            logDebug('Filled captcha code into input');
            return true;
        }
        showMsg('❌ Không tìm thấy ô input', 'error');
        logDebug('Input field not found');
        return false;
    }

    function clickVerifyButton() {
        const verifyBtn = document.querySelector('#verifyAudioCaptcha');
        if (verifyBtn) {
            verifyBtn.disabled = false;
            verifyBtn.click();
            showMsg('✅ Đã ấn "Xác thực"', 'success');
            logDebug('Clicked verify button');

            monitorVerification();
            return true;
        }
        showMsg('❌ Không tìm thấy nút "Xác thực"', 'error');
        logDebug('Verify button not found');
        return false;
    }

    function monitorVerification() {
        const observer = new MutationObserver(() => {
            const msgEl = document.querySelector('#audioCaptchaMessage');
            if (msgEl && getComputedStyle(msgEl).display !== 'none') {
                const text = msgEl.textContent;
                if (text.includes('thành công')) {
                    showMsg('✅ Xác thực thành công!', 'success');
                    logDebug('Verification successful');

                    setTimeout(() => {
                        const closeBtn = document.querySelector('#audioCaptchaClose');
                        if (closeBtn) {
                            closeBtn.click();
                            logDebug('Closed audio captcha popup');

                            setTimeout(clickCasinoSubmit, 1500);
                        }
                    }, 1000);

                    observer.disconnect();
                } else if (text.includes('thất bại') || text.includes('sai')) {
                    showMsg('❌ Xác thực thất bại! Thử lại...', 'error');
                    logDebug('Verification failed');
                }
            }
        });

        const msgEl = document.querySelector('#audioCaptchaMessage');
        if (msgEl) observer.observe(msgEl, { childList: true, subtree: true });
    }

    function clickCasinoSubmit() {
        const submitBtn = document.querySelector('#casinoSubmit');
        if (submitBtn) {
            submitBtn.click();
            showMsg('✅ Đã ấn "Nhận khuyến mãi"', 'success');
            logDebug('Clicked "Nhận khuyến mãi"');
            return true;
        }
        showMsg('❌ Không tìm thấy nút "Nhận khuyến mãi"', 'error');
        logDebug('Submit button not found');
        return false;
    }

    function runAutoProcess() {
        fillUsername();
        setTimeout(selectTaiApp, 1500);
        setTimeout(clickXacThucTaiDay, 3000);
        setTimeout(createAudioCaptcha, 4500);
        setInterval(scanResources, 500);
    }

    function initAudioPart() {
        runAutoProcess();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAudioPart);
    } else {
        initAudioPart();
    }

})();