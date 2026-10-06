const API_URL = "/api";
const CHARS = "ABCDEFGHIJKLMNABCDEFGHЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮIJKLMNOPQRSTUVWXYZ0123456789$#@&%*!_OPQRSTUVWXYZ0123456789$#@&%*!_";

let pollingInterval = null;
/**
 * Эффект "Матрицы" для текста
 */
function scrambleText(element, targetText) {
    let iteration = 0;
    const interval = setInterval(() => {
        element.innerText = targetText
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
    }, 30);
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


async function apiFetch(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        },
        credentials: "include",
        ...options,
    });

    if (response.status === 401) {
        window.location.href = "/";
        throw new Error("UNAUTHORIZED_ACCESS");
    }
    return response;
}

async function loadProfileData() {
    try {
        // 1. Параллельно запрашиваем статус пользователя и уровни подписки
        const [statusRes, levelsRes] = await Promise.all([
            apiFetch("/status-check"),
            apiFetch("/subscribe/levels")
        ]);

        const user = await statusRes.json();
        const levels = await levelsRes.json();

        // 2. Ищем лимиты текущего уровня пользователя
        // Предполагаем, что user.subscription содержит имя уровня (например, "VIP")
        const currentLevel = levels.find(l => l.name === user.subscription) || levels[0];

        const data = {
            email: user.email || "UNKNOWN_USER",
            sub: user.subscription || "NONE",
            files: user.downloads_count || 0,
            mb: Number(user.total_mb || 0),
            admin: user.is_admin ? "ENABLED" : "DISABLED",
            // Лимиты из найденного уровня
            maxFiles: currentLevel ? currentLevel.torrent_limit : 0,
            maxMb: currentLevel ? currentLevel.mb_limit : 0
        };
        
        // Аватар
        const avatarImg = document.getElementById('profile-avatar');
        if (avatarImg) avatarImg.src = user.avatar ? user.avatar : "/static/avatar.png";

        // 3. Запуск анимаций ТЕКСТА
        scrambleText(document.getElementById('profile-email'), data.email);
        scrambleText(document.getElementById('profile-sub'), data.sub);
        scrambleText(document.getElementById('stat-admin'), data.admin);

        // 4. Запуск анимаций ЧИСЕЛ
        // Сначала ставим "максимальные" значения (они просто появятся)
        document.getElementById('max-files').innerText = data.maxFiles;
        document.getElementById('max-mb').innerText = `${data.maxMb} MB`;

        // Затем запускаем счетчики для текущих значений
        countUp(document.getElementById('stat-files'), data.files, false);
        countUp(document.getElementById('stat-mb'), data.mb, true);

        // Стилизация админа
        const adminEl = document.getElementById('stat-admin');
        if (user.is_admin) {
            adminEl.style.color = "var(--neon-cyan)";
        } else {
            adminEl.style.color = "var(--neon-magenta)";
        }

    } catch (err) {
        console.error("PROFILE_LOAD_ERROR:", err);
        const emailEl = document.getElementById('profile-email');
        if (emailEl) emailEl.innerText = "ERROR_FETCHING_DATA";
    }
}

async function logout() {
    try {
        await apiFetch("/auth/logout", { method: "POST" });
    } catch (err) {
        console.error("LOGOUT_FAILED:", err);
    } finally {
        window.location.href = "/";
    }
}

function startPolling() {
    stopPolling();
    loadProfileData();
    pollingInterval = setInterval(loadProfileData, 20000);
}

function stopPolling() {
    if (pollingInterval !== null) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}


// Инициализация при загрузке DOM
document.addEventListener("DOMContentLoaded", startPolling);