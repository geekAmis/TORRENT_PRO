const API_URL = "/api";
let pollingInterval = null;

const toastContainer = document.createElement('div');
toastContainer.id = 'toast-container';
Object.assign(toastContainer.style, {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '10000',
    display: 'flex',
    flexDirection: 'column', // Это заставляет их вставать в столбик
    alignItems: 'center',
    gap: '10px',              // Расстояние между уведомлениями
    pointerEvents: 'none'     // Чтобы контейнер не мешал кликать по кнопкам под ним
});
document.body.appendChild(toastContainer);

// Вспомогательная функция для создания самого элемента тоста
function createToastElement(message, isError) {
    console.log(`[Toast System] Начинаю создание тоста. Тип: ${isError ? 'ОШИБКА' : 'ИНФО'}, Сообщение: "${message}"`);

    const toast = document.createElement('div');
    toast.textContent = message;
    console.log('[Toast System] 1. Элемент div создан, текст установлен.');

    // Базовые стили (общие для обоих типов)
    const baseStyle = isError ? 
        'background: #ff4d4d; box-shadow: 0 0 15px #ff4d4d;' : 
        'background: var(--neon-magenta); box-shadow: 0 0 15px var(--neon-magenta);';
    console.log('[Toast System] 2. Базовые стили определены.');

    toast.style.cssText = `
        ${baseStyle}
        color: white;
        padding: 10px 20px;
        border-radius: 4px;
        font-size: 0.8rem;
        pointer-events: auto;
        font-family: 'Orbitron', sans-serif;
        animation: toastFadeIn 0.3s ease;
    `;
    console.log('[Toast System] 3. CSS-свойства (cssText) применены к элементу.');

    // Добавляем анимацию появления через JS
    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
        @keyframes toastFadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(styleSheet);
    console.log('[Toast System] 4. Анимация @keyframes добавлена в <head>.');

    console.log('[Toast System] 5. Готово! Элемент возвращается в основную функцию.');
    return toast;
}
// 2. Исправленная функция для ОШИБОК
function showErrorToast(message) {
    const toast = createToastElement(message, true);
    document.body.querySelector("#toast-container").appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s ease';
        setTimeout(() => toast.remove(), 500); // Полное удаление из DOM
    }, 3000);
}

// 3. Исправленная функция для ОБЫЧНЫХ уведомлений
function showToast(message) {
    const toast = createToastElement(message, false);
    document.body.querySelector("#toast-container").appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s ease';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}


async function apiFetch(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
        credentials: "include",
        ...options,
    });

    if (response.status === 401) {
        handleUnauthorized();
        throw new Error("Не авторизован");
    }

    if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
            const body = await response.json();
            detail = body.detail || detail;
        } catch {
            // Ответ не в JSON
        }
        throw new Error(detail);
    }

    return response;
}

// --- AUTH ---

function login() {
    window.location.href = `${API_URL}/auth/login`;
}

async function loadUserProfile() {
    try {
        // Запрашиваем данные пользователя (status-check должен отдавать JSON)
        // Убедитесь, что вы вызываете его с заголовком Accept: application/json
        const response = await fetch('/status-check', {
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) throw new Error("Not authorized");

        const userData = await response.json();

        // 1. Обновляем Email
        scrambleText(document.getElementById('user-email'),userData.email.replace('@gmail.com',''));

        // 2. Обновляем Аватар
        const avatarImg = document.getElementById('user-avatar-img');
        const avatarPlaceholder = document.getElementById('avatar-placeholder');

        if (userData.avatar) {
            avatarImg.src = userData.avatar;
            avatarImg.style.display = 'block'; // Показываем картинку
            avatarPlaceholder.style.display = 'none'; // Прячем заглушку
        } else {
            // Если аватара нет, можно поставить дефолтную иконку
            avatarImg.src = '/static/default-avatar.png'; 
            avatarImg.style.display = 'block';
            avatarPlaceholder.style.display = 'none';
        }

    } catch (err) {
        console.error("Error loading profile:", err);
        document.getElementById('user-email').textContent = "Guest";
    }
}

async function logout() {
    try {
        await apiFetch("/auth/logout");
    } catch (err) {
        console.error("Logout failed:", err);
    } finally {
        stopPolling();
        location.reload();
    }
}

async function checkAuth() {
    try {
        const response = await apiFetch("/status-check", {
            headers: { Accept: "application/json" },
        });

        const user = await response.json();
        showDashboard(user);
        startPolling();
    } catch (err) {
        console.error("Auth check failed:", err);
    }
    scrambleText(document.getElementById('glich-text'), "BYPASS THE LIMITS. UNLOCK MAX_SIZE.");
}

function handleUnauthorized() {
    stopPolling();

    document.getElementById("auth-area")?.classList.remove("hidden");
    document.getElementById("dashboard")?.classList.add("hidden");

    const controlsCard = document.querySelector(".controls-card");
    if (controlsCard) controlsCard.innerHTML = "";

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) logoutBtn.classList.add("hidden");
}

function showDashboard(user) {
     document.body.innerHTML += `<style>.hidden {display: none;}</style>`;
    document.getElementById("auth-area")?.classList.add("hidden");
    document.getElementById("dashboard")?.classList.remove("hidden");

    const email = document.getElementById("user-email");
    scrambleText(document.getElementById('user-email'),user.email.replace('@gmail.com',''));
    if (email) email.textContent = user.email || "";

    const avatar = document.getElementById("user-avatar-img");
    if (avatar && user.avatar) {
        avatar.src = user.avatar;
        avatar.classList.remove("hidden");
        document.getElementById("avatar-placeholder").classList.add("hidden");
    } else if (avatar && ! user.avatar) {
        avatar.src = "/static/avatar.png";
        avatar.classList.remove('hidden');
        document.getElementById("avatar-placeholder").classList.add("hidden");
    }

    const stats = document.getElementById("user-stats");

    /*
    if (stats) {
        
        stats_text = `Файлов: ${user.downloads_count ?? 0}<br> `;
        scrambleText(stats,stats_text);
        stats_text +=    `Использовано: ${Number(user.total_mb ?? 0).toFixed(2)} MB`;
        stats.innerHTML = stats_text;
        scrambleText(stats,stats_text);
    }
    */

    //stats.classList.add("hidden");
    const adminArea = document.getElementById("admin-area");
    if (adminArea) {
        adminArea.classList.toggle("hidden", !user.is_admin);
    }

   if (document.getElementById("profile-info")) {
        document.getElementById("profile-info").style.cursor = "pointer";
        document.getElementById("profile-info").onclick = () => {
            window.location.href = "/my-profile"; // Путь к новой странице
        };
    }
}

// --- TORRENTS ---

async function addMagnet() {
    const input = document.getElementById("magnet-input");
    const magnet = input?.value.trim();

    if (!magnet) return;

    const formData = new FormData();
    formData.append("magnet", magnet);

    try {
        const response = await apiFetch("/torrent/magnet", {
            method: "POST",
            body: formData,
        });
        const result = await response.json();

        input.value = "";
        await updateDownloads();
        console.log("Torrent added:", result);
    } catch (err) {
        showErrorToast(`Не удалось добавить magnet: ${err.message}`)
    }
}

async function addFiles() {
    const input = document.getElementById("file-input");
    const files = input?.files;

    if (!files || files.length === 0) {
        showErrorToast("Пожалуйста, выберите хотя бы один файл.")
        return;
    }

    const MAX_SIZE_MB = 5;
    const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
    const ALLOWED_EXTENSION = ".torrent";

    // Превращаем FileList в массив, чтобы использовать map/forEach
    const fileArray = Array.from(files);
    
    // Сначала делаем быструю валидацию, чтобы не начинать загрузку, если есть явные ошибки
    for (const file of fileArray) {
        if (!file.name.toLowerCase().endsWith(ALLOWED_EXTENSION)) {
            showErrorToast(`Ошибка: Файл "${file.name}" не является .torrent файлом.`)
            return;
        }
        if (file.size > MAX_SIZE_BYTES) {
            showErrorToast(`Ошибка: Файл "${file.name}" слишком большой (макс. 5Мб).`)
            return;
        }
    }


    showToast(`Начинаю загрузку ${fileArray.length} файлов...`)

    // Создаем массив промисов для параллельной загрузки
    const uploadPromises = fileArray.map(async (file) => {
        const formData = new FormData();
        formData.append("file", file); // Используем старый ключ "file", как в твоем первом коде

        try {
            const response = await apiFetch("/torrent/file", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Ошибка сервера");
            }

            const result = await response.json();
            showToast(`✅ Успешно: ${file.name}`);
            console.log(`✅ Успешно: ${file.name}`, result);
            return { name: file.name, status: 'success' };
        } catch (err) {
            console.error(`❌ Ошибка при загрузке ${file.name}:`, err.message);
            return { name: file.name, status: 'error', message: err.message };
        }
    });

    // Ждем завершения всех запросов (и успешных, и упавших)
    const results = await Promise.all(uploadPromises);

    // Анализируем результаты
    const errors = results.filter(r => r.status === 'error');
    const successes = results.filter(r => r.status === 'success');

    // Очищаем инпут
    input.value = "";

    // Обновляем список загрузок
    await updateDownloads();

    // Выводим отчет пользователю
    if (errors.length > 0) {
        let errorMsg = `Загрузка завершена с ошибками:\n`;
        errors.forEach(e => errorMsg += `- ${e.name}: ${e.message}\n`);
        showErrorToast(errorMsg + `\nУспешно загружено: ${successes.length}`)
    } else {
        showToast(`Все файлы (${successes.length}) успешно загружены!`);

    }
}

async function updateDownloads() {
    try {
        const response = await apiFetch("/torrent/all");
        const data = await response.json();
        const tbody = document.getElementById("torrent-table-body");
        if (!tbody) return;

        const existingRows = new Map();
        Array.from(tbody.rows).forEach(row => {
            const hash = row.getAttribute("data-hash");
            if (hash) existingRows.set(hash, row);
        });

        const currentHashes = new Set(data.my_files.map(f => f.torrent_hash));
        for (const [hash, row] of existingRows) {
            if (!currentHashes.has(hash)) row.remove();
        }

        for (const file of data.my_files || []) {
            const hash = file.torrent_hash;
            const torrent = file.status || {};
            const progress = Math.max(0, Math.min(100, Number(torrent.progress) || 0));

            let row = existingRows.get(hash);

            if (!row) {
                row = document.createElement("tr");
                row.setAttribute("data-hash", hash);
                row.innerHTML = `
                    <td class="name-cell">
                        <div class="file-name"></div>
                        <div class="file-state"></div>
                    </td>
                    <td class="progress-cell">
                        <div class="progress-text">0%</div>
                        <div class="progress-wrapper"><div class="progress-fill"></div></div>
                    </td>
                    <td class="speed-cell">
                        <div class="speed-val">↓ 0 KB/s</div>
                    </td>
                    <td class="peers-cell">
                        <div class="peers-container"></div>
                    </td>
                `;
                tbody.append(row);
            }

            if (row.getAttribute("data-downloading") === "true") {
                row.querySelector(".file-name").textContent = torrent.name || file.name || hash;
                row.querySelector(".file-state").textContent = torrent.state || "idle";
                continue; 
            }

            row.querySelector(".file-name").textContent = torrent.name || file.name || hash;
            row.querySelector(".file-name").style.cssText = "font-size:.8rem;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
            row.querySelector(".file-state").textContent = torrent.state || "idle";
            row.querySelector(".file-state").style.cssText = "font-size:.6rem;color:var(--border)";

            const progText = row.querySelector(".progress-text");
            const progFill = row.querySelector(".progress-fill");
            progText.textContent = `${progress.toFixed(2)}%`;
            progFill.style.width = `${progress}%`;
            progText.style.fontSize = ".7rem";

            const speedVal = row.querySelector(".speed-val");
            const newSpeed = `↓ ${Number(torrent.download_rate_kb || 0).toFixed(2)} KB/s`;
            if (speedVal.textContent !== newSpeed) {
                speedVal.textContent = newSpeed;
                speedVal.style.color = "var(--neon-cyan)";
            }
            speedVal.style.fontSize = ".7rem";

            const peersContainer = row.querySelector(".peers-container");
            const isFinished = progress >= 100;

            if (isFinished) {
                // Проверяем, не отрисовали ли мы кнопки уже
                if (!peersContainer.querySelector(".btn-actions-group")) {
                    peersContainer.innerHTML = '';
                    
                    const actionsWrapper = document.createElement("div");
                    actionsWrapper.className = "btn-actions-group"; // Группируем кнопки
                    actionsWrapper.style.cssText = "display:flex; gap:5px; align-items:center;";

                    // 1. Кнопка Download
                    const dlBtn = document.createElement("button");
                    dlBtn.className = "btn btn-sm btn-magenta";
                    dlBtn.textContent = "DL";
                    dlBtn.onclick = () => downloadFile(hash);

                    // 2. Кнопка Share
                    const shareBtn = document.createElement("button");
                    shareBtn.className = "btn btn-sm btn-share";
                    shareBtn.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                            <polyline points="16 6 12 2 8 6"></polyline>
                            <line x1="12" y1="2" x2="12" y2="15"></line>
                        </svg>`;
                    shareBtn.title = "Share link";
                    shareBtn.onclick = () => shareFileLink(hash);

                    // 3. Кнопка DELETE (Корзина)
                    const delBtn = document.createElement("button");
                    delBtn.className = "btn btn-sm btn-delete"; 
                    delBtn.style.cssText = "color: #ff4d4d; border-color: #ff4d4d; background: transparent;";
                    delBtn.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>`;
                    delBtn.title = "Delete from library";
                    delBtn.onclick = () => deleteTorrent(hash);

                    actionsWrapper.appendChild(dlBtn);
                    actionsWrapper.appendChild(shareBtn);
                    actionsWrapper.appendChild(delBtn);
                    peersContainer.appendChild(actionsWrapper);
                }
            } else {
                const peerCount = torrent.peers ?? 0;
                peersContainer.innerHTML = `
                    <div style="display:flex;align-items:center;gap:8px">
                        <div class="peer-animation"></div>
                        <span style="color:var(--neon-magenta); font-size:.7rem">${peerCount}</span>
                    </div>
                `;
            }
        }
    } catch (err) {
        if (err.message !== "Не авторизован") console.error("Polling error:", err);
    }
}

async function shareFileLink(hash) {
    // Формируем ссылку. 
    // ВАЖНО: замени window.location.origin на свой домен, если нужно
    const shareUrl = `${window.location.origin}/api/torrent/download/${hash}`;
    const textToShare = `Check this file: ${shareUrl} by [ https://secommu.com ] `;

    try {
        // Пытаемся использовать Web Share API (работает на мобилках)
        if (navigator.share) {
            await navigator.share({
                title: 'File Download',
                text: textToShare,
                url: shareUrl,
            });
        } else {
            // Если Web Share не поддерживается (десктоп), копируем в буфер
            await navigator.clipboard.writeText(textToShare);
            
            // Показываем маленькое уведомление (Toast)
            showToast("Link copied to clipboard!");
        }
    } catch (err) {
        console.error("Error sharing:", err);
    }
}

async function deleteTorrent(hash) {
    // 1. Подтверждение действия пользователем
    const confirmDelete = confirm("Вы уверены, что хотите удалить этот файл из своей библиотеки? Это не удалит файл с сервера, но уберет его из вашего списка.");
    if (!confirmDelete) return;

    // Находим строку, чтобы визуально ее пометить
    const row = document.querySelector(`tr[data-hash="${hash}"]`);
    const originalOpacity = row ? row.style.opacity : "";

    try {
        if (row) row.style.opacity = "0.5"; // Визуальный эффект "удаления"

        // 2. Вызов API (используем метод DELETE)
        const response = await apiFetch(`/torrent/delete/${encodeURIComponent(hash)}`, {
            method: "DELETE"
        });

        const result = await response.json();

        // 3. Успешное удаление
        showToast(result.message || "Файл удален");
        
        // Принудительно обновляем список, чтобы статистика и таблица синхронизировались
        await updateDownloads();

    } catch (err) {
        // 4. Обработка ошибок
        console.error("Delete error:", err);
        
        let errorMessage = "Не удалось удалить файл";
        
        // Если ошибка пришла от сервера в формате JSON
        if (err.message && err.message.includes("HTTP")) {
             // Здесь можно добавить более сложную логику парсинга, 
             // если apiFetch не прокидывает detail напрямую
             errorMessage = err.message;
        } else if (err.message) {
            errorMessage = err.message;
        }

        // Выводим уведомление об ошибке (красным цветом)
        showErrorToast(`Ошибка: ${errorMessage}`);
        
        // Возвращаем прозрачность, если произошла ошибка
        if (row) row.style.opacity = originalOpacity;
    }
}



async function downloadFile(hash) {
    let row = document.querySelector(`tr[data-hash="${hash}"]`);
    if (!row) return;

    try {
        // 1. Ставим флаг блокировки для updateDownloads
        row.setAttribute("data-downloading", "true");

        const response = await apiFetch(`/torrent/download/${encodeURIComponent(hash)}`);
        if (!response.ok) throw new Error("Ошибка при запросе файла");

        const total = parseInt(response.headers.get('content-length'), 10);
        
        const progressText = row.querySelector(".progress-text");
        const progressFill = row.querySelector(".progress-fill");
        const speedVal = row.querySelector(".speed-val");
        const peersContainer = row.querySelector(".peers-cell"); // Исправлено: container внутри ячейки

        // 2. Визуальное состояние начала загрузки
        peersContainer.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px">
                <div class="peer-animation" style="background-color: var(--neon-cyan)"></div>
                <span style="font-size:.6rem; color:var(--neon-cyan)">DOWNLOADING...</span>
            </div>
        `;

        const reader = response.body.getReader();
        const chunks = [];
        let loaded = 0;
        let lastUpdateTime = Date.now();
        let lastLoaded = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            chunks.push(value);
            loaded += value.length;

            const now = Date.now();
            if (now - lastUpdateTime > 100) {
                const elapsedSeconds = (now - lastUpdateTime) / 1000;
                const bytesPerSecond = (loaded - lastLoaded) / elapsedSeconds;
                const kbps = bytesPerSecond / 1024;

                const percent = total ? Math.round((loaded / total) * 100) : 0;
                
                // Обновляем UI напрямую
                progressText.textContent = `${percent}%`;
                progressFill.style.width = `${percent}%`;
                speedVal.textContent = `↓ ${kbps.toFixed(2)} KB/s`;
                speedVal.style.color = "var(--neon-cyan)";

                lastUpdateTime = now;
                lastLoaded = loaded;
            }
        }

        // 3. Завершение
        const blob = new Blob(chunks);
        const disposition = response.headers.get("Content-Disposition") || "";
        const match = disposition.match(/filename="?([^"]+)"?/i);
        const filename = match?.[1] || `${hash}.download`;

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

    } catch (err) {
        console.error(err);
        showErrorToast(`Не удалось скачать файл: ${err.message}`)
    } finally {
        // 4. Снимаем флаг в любом случае (успех или ошибка)
        row.removeAttribute("data-downloading");
        updateDownloads(); // Сразу возвращаем управление поллингу
    }
}

const CHARS = "ABCDEFGHIJKLMNABCDEFGHЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮIJKLMNOPQRSTUVWXYZ0123456789$#@&%*!_OPQRSTUVWXYZ0123456789$#@&%*!_";

/**
 * Эффект "Матрицы" для текста
 */
function scrambleText(element, targetText) {
    let iteration = 0;
    const interval = setInterval(() => {
        element.innerHTML = targetText
            .split("")
            .map((char, index) => {
                if (index < iteration) return targetText[index];
                return CHARS[Math.floor(Math.random() * CHARS.length)];
            })
            .join("");

        if (iteration >= targetText.length) {
            clearInterval(interval);
        }
        iteration += 1 / 3; // Скорость проявления (чем меньше, тем медленнее)
    }, 15);
}

/**
 * Эффект быстрого счетчика для чисел
 */
function countUp(element, targetValue, isMB = false) {
    let startValue = -111155;
    const duration = 1500; // Длительность анимации в мс
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Функция плавного ускорения (Ease Out Expo)
        const easeOutProgress = 1 - Math.pow(2, -10 * progress);
        
        const currentValue = startValue + (targetValue - startValue) * easeOutProgress;
        
        if (isMB) {
            element.innerText = `${currentValue.toFixed(2)} MB`;
        } else {
            element.innerText = Math.floor(currentValue);
        }

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            // Финальная установка точного значения
            element.innerText = isMB ? `${targetValue.toFixed(2)} MB` : Math.floor(targetValue);
        }
    }

    requestAnimationFrame(update);
}

function startPolling() {
    stopPolling();
    updateDownloads();
    pollingInterval = setInterval(updateDownloads, 2000);
}

function stopPolling() {
    if (pollingInterval !== null) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}



// Init
checkAuth();